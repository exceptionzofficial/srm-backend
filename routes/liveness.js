const express = require('express');
const router = express.Router();
const path = require('path');
const {
    RekognitionClient,
    CreateFaceLivenessSessionCommand,
    GetFaceLivenessSessionResultsCommand,
    SearchFacesByImageCommand,
    DetectFacesCommand  // Added for blink detection
} = require('@aws-sdk/client-rekognition');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// GCP Cloud Storage and Vision API (for liveness photos)
const { Storage } = require('@google-cloud/storage');
const vision = require('@google-cloud/vision');

// AWS Configuration (for Rekognition face matching - stays in AWS)
const awsConfig = {
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
};

// Configure AWS Rekognition Client (SDK v3)
const rekognitionClient = new RekognitionClient(awsConfig);

// Configure AWS S3 Client (legacy - still used for some features)
const s3Client = new S3Client(awsConfig);

// S3 bucket for storing liveness images (legacy)
const S3_BUCKET = process.env.AWS_LIVENESS_S3_BUCKET || 'srm-face-liveness-images';

// GCP Configuration
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'srm-attendance-482409';
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'srm-liveness-photos';

// Initialize GCP clients
let gcsClient;
let visionClient;

try {
    // Check if running on Vercel with env var credentials
    if (process.env.GCP_CREDENTIALS) {
        // Parse credentials from environment variable
        const credentials = JSON.parse(process.env.GCP_CREDENTIALS);
        gcsClient = new Storage({
            projectId: GCP_PROJECT_ID,
            credentials: credentials
        });
        visionClient = new vision.ImageAnnotatorClient({
            projectId: GCP_PROJECT_ID,
            credentials: credentials
        });
        console.log('[Liveness] GCP clients initialized with env credentials');
    } else {
        // Local development - use key file
        const keyPath = path.join(__dirname, '..', 'gcp-service-account.json');
        gcsClient = new Storage({
            projectId: GCP_PROJECT_ID,
            keyFilename: keyPath
        });
        visionClient = new vision.ImageAnnotatorClient({
            projectId: GCP_PROJECT_ID,
            keyFilename: keyPath
        });
        console.log('[Liveness] GCP clients initialized with key file');
    }
} catch (error) {
    console.error('[Liveness] Failed to initialize GCP clients:', error.message);
}

/**
 * Create a new Face Liveness Session
 * POST /api/liveness/create-session
 */
router.post('/create-session', async (req, res) => {
    try {
        const { employeeId } = req.body;

        const command = new CreateFaceLivenessSessionCommand({
            Settings: {
                OutputConfig: {
                    S3Bucket: S3_BUCKET,
                    S3KeyPrefix: `liveness/${employeeId || 'unknown'}/`
                },
                AuditImagesLimit: 4
            }
        });

        const response = await rekognitionClient.send(command);

        console.log('Liveness session created:', response.SessionId);

        res.json({
            success: true,
            sessionId: response.SessionId,
            message: 'Liveness session created successfully'
        });
    } catch (error) {
        console.error('Error creating liveness session:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to create liveness session'
        });
    }
});

/**
 * Get presigned URLs for uploading liveness photos to S3
 * POST /api/liveness/get-upload-urls
 * 
 * Returns presigned URLs that mobile can use to upload photos directly to S3
 * This bypasses Vercel's 4.5 MB payload limit
 */
router.post('/get-upload-urls', async (req, res) => {
    try {
        const { photoCount = 2 } = req.body;
        const sessionId = `liveness-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const uploadUrls = [];
        const s3Keys = [];

        for (let i = 0; i < photoCount; i++) {
            const key = `liveness/${sessionId}/photo-${i + 1}.jpg`;
            s3Keys.push(key);

            const command = new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: key,
                ContentType: 'image/jpeg'
            });

            // Generate presigned URL valid for 5 minutes
            const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
            uploadUrls.push(uploadUrl);
        }

        console.log(`[Liveness] Generated ${photoCount} presigned URLs for session ${sessionId}`);

        res.json({
            success: true,
            sessionId: sessionId,
            uploadUrls: uploadUrls,
            s3Keys: s3Keys,
            bucket: S3_BUCKET,
            message: 'Upload URLs generated successfully'
        });
    } catch (error) {
        console.error('Error generating upload URLs:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to generate upload URLs'
        });
    }
});

/**
 * Get Face Liveness Session Results
 * GET /api/liveness/get-results/:sessionId
 */
router.get('/get-results/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Session ID is required'
            });
        }

        const command = new GetFaceLivenessSessionResultsCommand({
            SessionId: sessionId
        });

        const response = await rekognitionClient.send(command);

        // Determine if liveness check passed (threshold: 85%)
        const isLive = response.Confidence >= 85;

        console.log(`Liveness result for session ${sessionId}: ${response.Confidence}% (${isLive ? 'PASSED' : 'FAILED'})`);

        res.json({
            success: true,
            sessionId: sessionId,
            confidence: response.Confidence,
            isLive: isLive,
            status: response.Status,
            referenceImage: response.ReferenceImage ? {
                boundingBox: response.ReferenceImage.BoundingBox,
                hasImage: !!response.ReferenceImage.Bytes
            } : null,
            auditImagesCount: response.AuditImages ? response.AuditImages.length : 0
        });
    } catch (error) {
        console.error('Error getting liveness results:', error);

        if (error.name === 'SessionNotFoundException') {
            return res.status(404).json({
                success: false,
                error: 'Session not found or expired',
                message: 'The liveness session has expired or does not exist'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get liveness results'
        });
    }
});

/**
 * Get Cognito Identity Pool credentials for mobile app
 * GET /api/liveness/credentials
 */
router.get('/credentials', async (req, res) => {
    try {
        res.json({
            success: true,
            region: process.env.AWS_REGION || 'ap-south-1',
            identityPoolId: process.env.AWS_COGNITO_IDENTITY_POOL_ID
        });
    } catch (error) {
        console.error('Error getting credentials:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Verify liveness and compare with registered face
 * POST /api/liveness/verify
 */
router.post('/verify', async (req, res) => {
    try {
        const { sessionId, employeeId } = req.body;

        if (!sessionId || !employeeId) {
            return res.status(400).json({
                success: false,
                message: 'Session ID and Employee ID are required'
            });
        }

        // Step 1: Get liveness results
        const livenessCommand = new GetFaceLivenessSessionResultsCommand({
            SessionId: sessionId
        });
        const livenessResult = await rekognitionClient.send(livenessCommand);

        if (livenessResult.Confidence < 85) {
            return res.json({
                success: false,
                isLive: false,
                confidence: livenessResult.Confidence,
                message: 'Liveness check failed. Please try again.'
            });
        }

        // Step 2: If liveness passed and we have a reference image, compare with registered face
        if (livenessResult.ReferenceImage && livenessResult.ReferenceImage.Bytes) {
            const searchCommand = new SearchFacesByImageCommand({
                CollectionId: process.env.REKOGNITION_COLLECTION_ID || 'srm-employees-faces',
                Image: {
                    Bytes: livenessResult.ReferenceImage.Bytes
                },
                MaxFaces: 1,
                FaceMatchThreshold: 80
            });

            try {
                const searchResult = await rekognitionClient.send(searchCommand);

                if (searchResult.FaceMatches && searchResult.FaceMatches.length > 0) {
                    const match = searchResult.FaceMatches[0];
                    const matchedEmployeeId = match.Face.ExternalImageId;

                    if (matchedEmployeeId === employeeId) {
                        return res.json({
                            success: true,
                            isLive: true,
                            isVerified: true,
                            livenessConfidence: livenessResult.Confidence,
                            faceMatchConfidence: match.Similarity,
                            employeeId: matchedEmployeeId,
                            message: 'Identity verified successfully'
                        });
                    } else {
                        return res.json({
                            success: false,
                            isLive: true,
                            isVerified: false,
                            message: 'Face does not match the registered employee'
                        });
                    }
                } else {
                    return res.json({
                        success: false,
                        isLive: true,
                        isVerified: false,
                        message: 'No matching face found in the system'
                    });
                }
            } catch (faceError) {
                console.error('Face search error:', faceError);
                return res.json({
                    success: true,
                    isLive: true,
                    isVerified: false,
                    livenessConfidence: livenessResult.Confidence,
                    message: 'Liveness verified, but face comparison failed'
                });
            }
        }

        // Liveness passed but no reference image available
        res.json({
            success: true,
            isLive: true,
            isVerified: false,
            livenessConfidence: livenessResult.Confidence,
            message: 'Liveness verified successfully'
        });

    } catch (error) {
        console.error('Error in liveness verification:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to verify liveness'
        });
    }
});

/**
 * Analyze photos for blink detection (Custom Liveness Check)
 * POST /api/liveness/analyze-blinks
 * 
 * Takes multiple photos captured over time and analyzes eye state changes
 * to detect if the person blinked (proving they are real, not a photo)
 */
router.post('/analyze-blinks', async (req, res) => {
    try {
        const { photos, employeeId } = req.body;

        if (!photos || !Array.isArray(photos) || photos.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'At least 2 photos are required for blink detection'
            });
        }

        console.log(`[Liveness] Analyzing ${photos.length} photos for blink detection`);

        // Analyze each photo for eye state
        const eyeStates = [];

        for (let i = 0; i < photos.length; i++) {
            const photo = photos[i];

            // Convert base64 to buffer
            const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');

            try {
                const command = new DetectFacesCommand({
                    Image: {
                        Bytes: imageBuffer
                    },
                    Attributes: ['ALL'] // Request all facial attributes including eyes open/closed
                });

                const response = await rekognitionClient.send(command);

                if (response.FaceDetails && response.FaceDetails.length > 0) {
                    const face = response.FaceDetails[0];

                    // Check if eyes are open or closed
                    const eyesOpen = face.EyesOpen;
                    const leftEyeOpen = eyesOpen ? eyesOpen.Value : true;
                    const eyeConfidence = eyesOpen ? eyesOpen.Confidence : 0;

                    eyeStates.push({
                        photoIndex: i,
                        eyesOpen: leftEyeOpen,
                        confidence: eyeConfidence,
                        faceDetected: true
                    });

                    console.log(`[Liveness] Photo ${i + 1}: Eyes ${leftEyeOpen ? 'OPEN' : 'CLOSED'} (${eyeConfidence.toFixed(1)}%)`);
                } else {
                    eyeStates.push({
                        photoIndex: i,
                        eyesOpen: null,
                        confidence: 0,
                        faceDetected: false
                    });
                    console.log(`[Liveness] Photo ${i + 1}: No face detected`);
                }
            } catch (detectError) {
                console.error(`[Liveness] Error analyzing photo ${i + 1}:`, detectError.message);
                eyeStates.push({
                    photoIndex: i,
                    eyesOpen: null,
                    confidence: 0,
                    faceDetected: false,
                    error: detectError.message
                });
            }
        }

        // Count blinks (transitions from open to closed or closed to open)
        let blinksDetected = 0;
        let previousState = null;
        let eyeConfidences = [];

        for (const state of eyeStates) {
            if (state.faceDetected && state.eyesOpen !== null) {
                eyeConfidences.push(state.confidence);
                if (previousState !== null && previousState !== state.eyesOpen) {
                    // Eye state changed - this is half a blink
                    // A full blink is open -> closed -> open (2 transitions)
                    blinksDetected += 0.5;
                }
                previousState = state.eyesOpen;
            }
        }

        // Round to whole blinks
        blinksDetected = Math.floor(blinksDetected);

        // Alternative liveness check: confidence variance
        // ANY variance in eye confidence indicates real face (even slight head movement causes this)
        let hasVariance = false;
        let varianceValue = 0;
        if (eyeConfidences.length >= 3) {
            const minConf = Math.min(...eyeConfidences);
            const maxConf = Math.max(...eyeConfidences);
            varianceValue = maxConf - minConf;
            hasVariance = varianceValue > 1; // Super lenient - even 1% variance counts as movement
            console.log(`[Liveness] Eye confidence variance: ${varianceValue.toFixed(2)}% (min: ${minConf.toFixed(1)}, max: ${maxConf.toFixed(1)})`);
        }

        // Count how many photos had face detected
        const facesDetected = eyeStates.filter(s => s.faceDetected).length;

        // LENIENT LIVENESS CHECK: 
        // Pass if: 
        // 1. Any blinks detected, OR
        // 2. Any confidence variance (even small), OR
        // 3. Face detected in both photos (consistent detection = real face)
        const hasEnoughFaces = facesDetected >= 2;
        const isLive = blinksDetected >= 1 || hasVariance || hasEnoughFaces;

        // Confidence based on what triggered the pass
        let confidence = 20;
        if (blinksDetected >= 2) confidence = 95;
        else if (blinksDetected >= 1) confidence = 85;
        else if (varianceValue > 5) confidence = 80;
        else if (hasVariance) confidence = 75;
        else if (hasEnoughFaces) confidence = 70;

        console.log(`[Liveness] Result: blinks=${blinksDetected}, variance=${varianceValue.toFixed(2)}%, faces=${facesDetected}, isLive: ${isLive}`);

        res.json({
            success: true,
            isLive: isLive,
            blinksDetected: blinksDetected,
            confidence: confidence,
            photosAnalyzed: photos.length,
            facesDetected: facesDetected,
            varianceDetected: varianceValue,
            eyeStates: eyeStates.map(s => ({
                photoIndex: s.photoIndex,
                eyesOpen: s.eyesOpen,
                faceDetected: s.faceDetected
            })),
            message: isLive
                ? `Liveness verified! Face detected in ${facesDetected} photos.`
                : 'Could not verify liveness. Please ensure good lighting and keep your face visible.'
        });

    } catch (error) {
        console.error('[Liveness] Blink analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to analyze photos for liveness'
        });
    }
});

/**
 * Analyze liveness photos from S3 (bypasses payload limit)
 * POST /api/liveness/analyze-from-s3
 * 
 * Mobile uploads photos to S3 using presigned URLs, then calls this endpoint with S3 keys
 */
router.post('/analyze-from-s3', async (req, res) => {
    try {
        const { sessionId, s3Keys } = req.body;

        if (!s3Keys || !Array.isArray(s3Keys) || s3Keys.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'At least 2 S3 keys are required for liveness detection'
            });
        }

        console.log(`[Liveness S3] Analyzing ${s3Keys.length} photos from S3 for session ${sessionId}`);

        // Analyze each photo from S3 for eye state
        const eyeStates = [];

        for (let i = 0; i < s3Keys.length; i++) {
            const s3Key = s3Keys[i];

            try {
                // Use S3Object reference for Rekognition (no need to download)
                const command = new DetectFacesCommand({
                    Image: {
                        S3Object: {
                            Bucket: S3_BUCKET,
                            Name: s3Key
                        }
                    },
                    Attributes: ['ALL']
                });

                const response = await rekognitionClient.send(command);

                if (response.FaceDetails && response.FaceDetails.length > 0) {
                    const face = response.FaceDetails[0];
                    const eyesOpen = face.EyesOpen;
                    const leftEyeOpen = eyesOpen ? eyesOpen.Value : true;
                    const eyeConfidence = eyesOpen ? eyesOpen.Confidence : 0;

                    eyeStates.push({
                        photoIndex: i,
                        eyesOpen: leftEyeOpen,
                        confidence: eyeConfidence,
                        faceDetected: true
                    });

                    console.log(`[Liveness S3] Photo ${i + 1}: Eyes ${leftEyeOpen ? 'OPEN' : 'CLOSED'} (${eyeConfidence.toFixed(1)}%)`);
                } else {
                    eyeStates.push({
                        photoIndex: i,
                        eyesOpen: null,
                        confidence: 0,
                        faceDetected: false
                    });
                    console.log(`[Liveness S3] Photo ${i + 1}: No face detected`);
                }
            } catch (detectError) {
                console.error(`[Liveness S3] Error analyzing photo ${i + 1}:`, detectError.message);
                eyeStates.push({
                    photoIndex: i,
                    eyesOpen: null,
                    confidence: 0,
                    faceDetected: false,
                    error: detectError.message
                });
            }
        }

        // Count faces detected and check for variance
        const facesDetected = eyeStates.filter(s => s.faceDetected).length;
        const eyeConfidences = eyeStates.filter(s => s.faceDetected).map(s => s.confidence);

        let hasVariance = false;
        let varianceValue = 0;
        if (eyeConfidences.length >= 2) {
            const minConf = Math.min(...eyeConfidences);
            const maxConf = Math.max(...eyeConfidences);
            varianceValue = maxConf - minConf;
            hasVariance = varianceValue > 1;
        }

        // Pass if face detected in both photos
        const hasEnoughFaces = facesDetected >= 2;
        const isLive = hasEnoughFaces || hasVariance;
        const confidence = hasEnoughFaces ? (hasVariance ? 85 : 75) : 20;

        console.log(`[Liveness S3] Result: faces=${facesDetected}, variance=${varianceValue.toFixed(2)}%, isLive: ${isLive}`);

        res.json({
            success: true,
            isLive: isLive,
            confidence: confidence,
            photosAnalyzed: s3Keys.length,
            facesDetected: facesDetected,
            varianceDetected: varianceValue,
            eyeStates: eyeStates,
            message: isLive
                ? `Liveness verified! Face detected in ${facesDetected} photos.`
                : 'Could not verify liveness. Please ensure good lighting.'
        });

    } catch (error) {
        console.error('[Liveness S3] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to analyze photos from S3'
        });
    }
});

/**
 * GCP LIVENESS ENDPOINTS
 * Uses Google Cloud Storage for photos and Vision API for face detection
 */

/**
 * Get GCP signed URLs for uploading liveness photos
 * POST /api/liveness/gcp-upload-urls
 */
router.post('/gcp-upload-urls', async (req, res) => {
    try {
        const { photoCount = 2 } = req.body;
        const sessionId = `liveness-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const uploadUrls = [];
        const gcsKeys = [];

        const bucket = gcsClient.bucket(GCS_BUCKET_NAME);

        for (let i = 0; i < photoCount; i++) {
            const filename = `liveness/${sessionId}/photo-${i + 1}.jpg`;
            gcsKeys.push(filename);

            const file = bucket.file(filename);

            // Generate signed URL valid for 5 minutes
            const [signedUrl] = await file.getSignedUrl({
                version: 'v4',
                action: 'write',
                expires: Date.now() + 5 * 60 * 1000, // 5 minutes
                contentType: 'image/jpeg',
            });

            uploadUrls.push(signedUrl);
        }

        console.log(`[Liveness GCP] Generated ${photoCount} signed URLs for session ${sessionId}`);

        res.json({
            success: true,
            sessionId: sessionId,
            uploadUrls: uploadUrls,
            gcsKeys: gcsKeys,
            bucket: GCS_BUCKET_NAME,
            message: 'GCP Upload URLs generated successfully'
        });
    } catch (error) {
        console.error('[Liveness GCP] Error generating upload URLs:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to generate GCP upload URLs'
        });
    }
});

/**
 * Analyze liveness photos from GCP using Vision API
 * POST /api/liveness/gcp-analyze
 */
router.post('/gcp-analyze', async (req, res) => {
    try {
        const { sessionId, gcsKeys } = req.body;

        if (!gcsKeys || !Array.isArray(gcsKeys) || gcsKeys.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'At least 2 GCS keys are required for liveness detection'
            });
        }

        console.log(`[Liveness GCP] Analyzing ${gcsKeys.length} photos from GCS for session ${sessionId}`);

        // Analyze each photo using Vision API
        const faceResults = [];

        for (let i = 0; i < gcsKeys.length; i++) {
            const gcsUri = `gs://${GCS_BUCKET_NAME}/${gcsKeys[i]}`;

            try {
                // Use Vision API for face detection
                const [result] = await visionClient.faceDetection(gcsUri);
                const faces = result.faceAnnotations;

                if (faces && faces.length > 0) {
                    const face = faces[0];
                    faceResults.push({
                        photoIndex: i,
                        faceDetected: true,
                        confidence: face.detectionConfidence * 100,
                        joyLikelihood: face.joyLikelihood,
                        sorrowLikelihood: face.sorrowLikelihood,
                        angerLikelihood: face.angerLikelihood,
                        surpriseLikelihood: face.surpriseLikelihood,
                        blurredLikelihood: face.blurredLikelihood,
                    });
                    console.log(`[Liveness GCP] Photo ${i + 1}: Face detected (${(face.detectionConfidence * 100).toFixed(1)}%)`);
                } else {
                    faceResults.push({
                        photoIndex: i,
                        faceDetected: false,
                        confidence: 0,
                    });
                    console.log(`[Liveness GCP] Photo ${i + 1}: No face detected`);
                }
            } catch (detectError) {
                console.error(`[Liveness GCP] Error analyzing photo ${i + 1}:`, detectError.message);
                faceResults.push({
                    photoIndex: i,
                    faceDetected: false,
                    confidence: 0,
                    error: detectError.message
                });
            }
        }

        // Count faces detected
        const facesDetected = faceResults.filter(r => r.faceDetected).length;
        const avgConfidence = faceResults
            .filter(r => r.faceDetected)
            .reduce((sum, r) => sum + r.confidence, 0) / facesDetected || 0;

        // Pass if face detected in both photos
        const isLive = facesDetected >= 2;
        const confidence = isLive ? Math.round(avgConfidence) : 20;

        console.log(`[Liveness GCP] Result: faces=${facesDetected}, avgConfidence=${avgConfidence.toFixed(1)}%, isLive: ${isLive}`);

        res.json({
            success: true,
            isLive: isLive,
            confidence: confidence,
            photosAnalyzed: gcsKeys.length,
            facesDetected: facesDetected,
            faceResults: faceResults,
            message: isLive
                ? `Liveness verified! Face detected in ${facesDetected} photos.`
                : 'Could not verify liveness. Please ensure good lighting.'
        });

    } catch (error) {
        console.error('[Liveness GCP] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to analyze photos from GCP'
        });
    }
});

module.exports = router;
