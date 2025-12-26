const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');

// Configure AWS Rekognition
const rekognition = new AWS.Rekognition({
    region: process.env.AWS_REGION || 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// S3 bucket for storing liveness images
const S3_BUCKET = process.env.AWS_LIVENESS_S3_BUCKET || 'srm-face-liveness-images';

/**
 * Create a new Face Liveness Session
 * POST /api/liveness/create-session
 */
router.post('/create-session', async (req, res) => {
    try {
        const { employeeId } = req.body;

        const params = {
            Settings: {
                OutputConfig: {
                    S3Bucket: S3_BUCKET,
                    S3KeyPrefix: `liveness/${employeeId || 'unknown'}/`
                },
                AuditImagesLimit: 4 // Store up to 4 audit images
            }
        };

        const response = await rekognition.createFaceLivenessSession(params).promise();

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

        const params = {
            SessionId: sessionId
        };

        const response = await rekognition.getFaceLivenessSessionResults(params).promise();

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
                // Don't send raw bytes to client
                hasImage: !!response.ReferenceImage.Bytes
            } : null,
            auditImagesCount: response.AuditImages ? response.AuditImages.length : 0
        });
    } catch (error) {
        console.error('Error getting liveness results:', error);

        // Handle specific error cases
        if (error.code === 'SessionNotFoundException') {
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
        const livenessParams = {
            SessionId: sessionId
        };
        const livenessResult = await rekognition.getFaceLivenessSessionResults(livenessParams).promise();

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
            const searchParams = {
                CollectionId: process.env.REKOGNITION_COLLECTION_ID || 'srm-employees-faces',
                Image: {
                    Bytes: livenessResult.ReferenceImage.Bytes
                },
                MaxFaces: 1,
                FaceMatchThreshold: 80
            };

            try {
                const searchResult = await rekognition.searchFacesByImage(searchParams).promise();

                if (searchResult.FaceMatches && searchResult.FaceMatches.length > 0) {
                    const match = searchResult.FaceMatches[0];
                    const matchedEmployeeId = match.Face.ExternalImageId;

                    // Check if matched employee is the expected one
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
                // If face comparison fails, still return liveness success
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

module.exports = router;
