require('dotenv').config();
const { ListFacesCommand, DeleteFacesCommand } = require('@aws-sdk/client-rekognition');
const { rekognitionClient } = require('./config/aws');
const Employee = require('./models/Employee');
const Manager = require('./models/Manager');

const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID || 'srm-employees-faces';

async function verifyFaces() {
    try {
        console.log(`🔍 Verifying faces in collection: ${COLLECTION_ID}...`);

        let paginationToken = null;
        const facesInRek = [];

        do {
            const command = new ListFacesCommand({
                CollectionId: COLLECTION_ID,
                MaxResults: 1000,
                NextToken: paginationToken
            });
            const response = await rekognitionClient.send(command);
            paginationToken = response.NextToken;
            facesInRek.push(...response.Faces);
        } while (paginationToken);

        console.log(`📊 Found ${facesInRek.length} faces in Rekognition.`);

        for (const face of facesInRek) {
            const employeeId = face.ExternalImageId;
            console.log(`Checking ${employeeId}...`);

            const employee = await Employee.getEmployeeById(employeeId);
            const manager = await Manager.getManagerById(employeeId);
            const exists = employee || manager;

            if (!exists) {
                console.log(`🚨 GHOST FOUND: ${employeeId} has a face in Rekognition but NO record in database.`);
                console.log(`🗑️ Deleting Ghost Face ${face.FaceId} for ${employeeId}...`);
                
                await rekognitionClient.send(new DeleteFacesCommand({
                    CollectionId: COLLECTION_ID,
                    FaceIds: [face.FaceId]
                }));
                console.log(`✅ Ghost Face Deleted.`);
            } else {
                console.log(`✅ Valid: ${employeeId} exists in database.`);
            }
        }

        console.log("\n✨ Verification complete.");

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

verifyFaces();
