const {
    IndexFacesCommand,
    SearchFacesByImageCommand,
    DeleteFacesCommand,
    CreateCollectionCommand,
    ListCollectionsCommand,
} = require('@aws-sdk/client-rekognition');
const { rekognitionClient } = require('../config/aws');

const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID || 'srm-employees-faces';

/**
 * Ensure Rekognition collection exists
 */
async function ensureCollectionExists() {
    try {
        const listCommand = new ListCollectionsCommand({});
        const response = await rekognitionClient.send(listCommand);

        if (!response.CollectionIds.includes(COLLECTION_ID)) {
            const createCommand = new CreateCollectionCommand({
                CollectionId: COLLECTION_ID,
            });
            await rekognitionClient.send(createCommand);
            console.log(`✅ Created Rekognition collection: ${COLLECTION_ID}`);
        }
    } catch (error) {
        console.error('Error ensuring collection exists:', error);
        throw error;
    }
}

/**
 * Index a face image to Rekognition collection
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} employeeId - Employee ID to associate with face
 * @returns {object} Face indexing result with faceId
 */
async function indexFace(imageBuffer, employeeId) {
    try {
        await ensureCollectionExists();

        const command = new IndexFacesCommand({
            CollectionId: COLLECTION_ID,
            Image: {
                Bytes: imageBuffer,
            },
            ExternalImageId: employeeId,
            DetectionAttributes: ['ALL'],
            MaxFaces: 1,
            QualityFilter: 'AUTO',
        });

        const response = await rekognitionClient.send(command);

        if (!response.FaceRecords || response.FaceRecords.length === 0) {
            throw new Error('No face detected in the image');
        }

        const faceRecord = response.FaceRecords[0];
        return {
            success: true,
            faceId: faceRecord.Face.FaceId,
            confidence: faceRecord.Face.Confidence,
            boundingBox: faceRecord.Face.BoundingBox,
        };
    } catch (error) {
        console.error('Error indexing face:', error);
        throw error;
    }
}

/**
 * Search for a face in the collection
 * @param {Buffer} imageBuffer - Image buffer to search
 * @returns {object} Search result with matched face info
 */
async function searchFace(imageBuffer) {
    try {
        const command = new SearchFacesByImageCommand({
            CollectionId: COLLECTION_ID,
            Image: {
                Bytes: imageBuffer,
            },
            MaxFaces: 1,
            FaceMatchThreshold: 95, // Increased to 95% to prevent "ghosty" matches
        });

        const response = await rekognitionClient.send(command);

        if (!response.FaceMatches || response.FaceMatches.length === 0) {
            return {
                success: false,
                message: 'No matching face found',
            };
        }

        const match = response.FaceMatches[0];
        return {
            success: true,
            employeeId: match.Face.ExternalImageId,
            faceId: match.Face.FaceId,
            similarity: match.Similarity,
        };
    } catch (error) {
        if (error.name === 'InvalidParameterException') {
            return {
                success: false,
                message: 'No face detected in the image',
            };
        }
        console.error('Error searching face:', error);
        throw error;
    }
}

/**
 * Delete ALL faces for a specific Employee ID (Cleanup)
 * @param {string} employeeId - properties to search by (ExternalImageId)
 */
async function deleteFacesByEmployeeId(employeeId) {
    try {
        // 1. List faces in collection (Filtering by ExternalImageId is not directly supported in ListFaces)
        // We have to list all and filter, OR use IndexFaces to ensure we only have one? 
        // Actually, the best way for cleanup is to rely on our DB faceId if possible. 
        // But if we want to be nuking "ghost" faces, we might need to iterate.
        // HOWEVER, listing all faces is expensive if collection is huge. 
        // Optimization: We assume the DB has the faceId. If DB is empty, maybe there's nothing?
        // But the user says "multiple faces". 
        // Alternative: We can use `foundFace = await searchFace(referenceImage)` if we had one.
        // BETTER: Just trust the DB faceId. If that fails, we might need a manual "Reset" tool.
        // BUT, for now, let's implement a robust delete that accepts a faceId, AND maybe tries to list if we suspect ghosts?
        // Let's stick to deleting the faceId we KNOW about first.

        // Wait, if I index a face with ExternalImageId, does Rekognition allow searching by ExternalImageId?
        // No, `ListFaces` returns everything.
        // But if I use `IndexFaces` with unique ExternalImageId, I can't easily find them without listing.
        // LIMITATION: AWS Rekognition doesn't let you "Delete by ExternalImageId".
        // Workaround: We will rely on the `deleteFace` (singular) which uses the FaceId stored in our DB.
        // To fix the "friend registered" issue: The friend's faceId SHOULD be in the DB.
        // If the user overwrote the DB record but the Face is still in AWS, we have a problem.
        // So, we will implement a "List and Filter" strategy for this specific employeeId to be safe.
        // It might be slow if collection is massive, but for 100-1000 employees it's instant.

        await ensureCollectionExists();

        const listCommand = new ListCollectionsCommand({}); // Just to ensure connection

        // Pagination for ListFaces
        let nextToken = null;
        const facesToDelete = [];

        do {
            const cmd = require('@aws-sdk/client-rekognition').ListFacesCommand;
            const response = await rekognitionClient.send(new cmd({
                CollectionId: COLLECTION_ID,
                NextToken: nextToken,
                MaxResults: 1000
            }));

            if (response.Faces) {
                const matches = response.Faces.filter(f => f.ExternalImageId === employeeId);
                matches.forEach(m => facesToDelete.push(m.FaceId));
            }
            nextToken = response.NextToken;
        } while (nextToken);

        if (facesToDelete.length > 0) {
            console.log(`[Rekognition] Found ${facesToDelete.length} faces for ${employeeId}. Deleting...`);
            const delCmd = new DeleteFacesCommand({
                CollectionId: COLLECTION_ID,
                FaceIds: facesToDelete
            });
            await rekognitionClient.send(delCmd);
            return { success: true, count: facesToDelete.length };
        }

        return { success: true, count: 0 };
    } catch (error) {
        console.error('Error deleting faces by employee ID:', error);
        // Don't throw, just return success: false so registration can proceed (maybe)
        // actually better to throw so we know.
        throw error;
    }
}

module.exports = {
    indexFace,
    searchFace,
    deleteFace,
    deleteFacesByEmployeeId,
    ensureCollectionExists,
};
