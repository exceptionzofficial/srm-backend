require('dotenv').config();
const { ListFacesCommand, DeleteFacesCommand } = require('@aws-sdk/client-rekognition');
const { rekognitionClient } = require('./config/aws');

const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID || 'srm-employees-faces';

async function cleanupGhostFaces() {
    try {
        console.log(`🔍 Scanning for Ghost Faces (Duplicates) in: ${COLLECTION_ID}...`);

        const faceCounts = {};
        let paginationToken = null;

        // 1. Collect all faces
        do {
            const command = new ListFacesCommand({
                CollectionId: COLLECTION_ID,
                MaxResults: 1000,
                NextToken: paginationToken
            });
            const response = await rekognitionClient.send(command);
            paginationToken = response.NextToken;

            response.Faces.forEach(face => {
                const extId = face.ExternalImageId;
                if (!faceCounts[extId]) faceCounts[extId] = [];
                faceCounts[extId].push(face.FaceId);
            });
        } while (paginationToken);

        // 2. Identify duplicates and delete
        const idsWithDuplicates = Object.keys(faceCounts).filter(id => faceCounts[id].length > 1);
        
        if (idsWithDuplicates.length === 0) {
            console.log("✅ No duplicate faces found.");
            return;
        }

        console.log(`\n🚨 Found ${idsWithDuplicates.length} IDs with duplicate faces.`);

        for (const extId of idsWithDuplicates) {
            const faceIds = faceCounts[extId];
            console.log(`🗑️ Deleting ${faceIds.length} faces for ${extId}...`);
            
            const deleteCommand = new DeleteFacesCommand({
                CollectionId: COLLECTION_ID,
                FaceIds: faceIds
            });

            await rekognitionClient.send(deleteCommand);
            console.log(`✅ Deleted all faces for ${extId}.`);
        }

        console.log("\n✨ Cleanup complete.");

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    }
}

cleanupGhostFaces();
