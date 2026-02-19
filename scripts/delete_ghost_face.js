const { ListFacesCommand, DeleteFacesCommand } = require('@aws-sdk/client-rekognition');
const { rekognitionClient } = require('../config/aws');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID || 'srm-employees-faces';
const TARGET_EXTERNAL_ID = 'SRM005';

async function deleteGhostFace() {
    try {
        console.log(`🔍 Searching for faces with ExternalImageId: ${TARGET_EXTERNAL_ID} in collection: ${COLLECTION_ID}...`);

        let faceIdToDelete = null;
        let paginationToken = null;

        do {
            const command = new ListFacesCommand({
                CollectionId: COLLECTION_ID,
                MaxResults: 1000,
                NextToken: paginationToken
            });

            const response = await rekognitionClient.send(command);
            paginationToken = response.NextToken;

            const match = response.Faces.find(face => face.ExternalImageId === TARGET_EXTERNAL_ID);

            if (match) {
                faceIdToDelete = match.FaceId;
                console.log(`✅ FOUND Ghost Face! FaceId: ${faceIdToDelete}`);
                break;
            }

        } while (paginationToken);

        if (faceIdToDelete) {
            console.log(`🗑️ Deleting FaceId: ${faceIdToDelete}...`);

            const deleteCommand = new DeleteFacesCommand({
                CollectionId: COLLECTION_ID,
                FaceIds: [faceIdToDelete]
            });

            await rekognitionClient.send(deleteCommand);
            console.log(`🎉 Successfully deleted face for ${TARGET_EXTERNAL_ID}.`);
        } else {
            console.log(`⚠️ No face found for ${TARGET_EXTERNAL_ID}. It might have already been deleted.`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

deleteGhostFace();
