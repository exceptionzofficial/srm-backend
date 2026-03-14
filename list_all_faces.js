require('dotenv').config();
const { ListFacesCommand } = require('@aws-sdk/client-rekognition');
const { rekognitionClient } = require('./config/aws');

const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID || 'srm-employees-faces';

async function listAllFaces() {
    try {
        console.log(`🔍 Listing all faces in collection: ${COLLECTION_ID}...`);

        // Count per external ID
        const faceCounts = {};
        let totalFaces = 0;
        let paginationToken = null;

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
                if (!faceCounts[extId]) {
                    faceCounts[extId] = [];
                }
                faceCounts[extId].push(face.FaceId);
                totalFaces++;
            });

        } while (paginationToken);

        console.log(`\n📊 Total Faces Indexed: ${totalFaces}`);
        Object.keys(faceCounts).forEach(extId => {
            const count = faceCounts[extId].length;
            console.log(`${extId}: ${count} face(s)`);
            if (count > 1) {
                console.log(`   ⚠️ WARNING: Found ${extId} with FaceIds: ${faceCounts[extId].join(', ')}`);
            }
        });

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

listAllFaces();
