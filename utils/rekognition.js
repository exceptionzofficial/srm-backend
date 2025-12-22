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
            FaceMatchThreshold: 80, // 80% similarity threshold
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
 * Delete a face from collection
 * @param {string} faceId - Face ID to delete
 */
async function deleteFace(faceId) {
    try {
        const command = new DeleteFacesCommand({
            CollectionId: COLLECTION_ID,
            FaceIds: [faceId],
        });
        await rekognitionClient.send(command);
        return { success: true };
    } catch (error) {
        console.error('Error deleting face:', error);
        throw error;
    }
}

module.exports = {
    indexFace,
    searchFace,
    deleteFace,
    ensureCollectionExists,
};
