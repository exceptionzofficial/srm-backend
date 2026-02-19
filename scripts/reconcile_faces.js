const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { ListFacesCommand, DeleteFacesCommand } = require('@aws-sdk/client-rekognition');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { rekognitionClient, docClient } = require('../config/aws');

const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID || 'srm-employees-faces';
const TABLE_NAME = process.env.DYNAMODB_EMPLOYEE_TABLE || 'srm-employee-table';

async function reconcile() {
    try {
        console.log('🔄 Starting Face Reconciliation...');

        // 1. Get all employees from DynamoDB
        console.log(`\n📥 Scanning DynamoDB Table: ${TABLE_NAME}...`);
        const empCommand = new ScanCommand({
            TableName: TABLE_NAME,
            ProjectionExpression: 'employeeId'
        });
        const empResponse = await docClient.send(empCommand);
        const validEmployeeIds = new Set((empResponse.Items || []).map(e => e.employeeId));
        console.log(`✅ Found ${validEmployeeIds.size} valid employees in DB.`);

        // 2. Get all faces from AWS Rekognition
        console.log(`\n📥 Scanning AWS Rekognition Collection: ${COLLECTION_ID}...`);
        let paginationToken = null;
        let allFaces = [];

        do {
            const listCommand = new ListFacesCommand({
                CollectionId: COLLECTION_ID,
                MaxResults: 1000,
                NextToken: paginationToken
            });
            const listResponse = await rekognitionClient.send(listCommand);
            paginationToken = listResponse.NextToken;
            allFaces = allFaces.concat(listResponse.Faces);
        } while (paginationToken);
        console.log(`✅ Found ${allFaces.length} total faces in AWS.`);

        // 3. Identify Ghosts
        const ghostFaceIds = [];
        const ghostExternalIds = new Set();

        allFaces.forEach(face => {
            const externalId = face.ExternalImageId;
            if (!validEmployeeIds.has(externalId)) {
                ghostFaceIds.push(face.FaceId);
                ghostExternalIds.add(externalId);
                console.log(`👻 GHOST DETECTED: ${externalId} (FaceId: ${face.FaceId})`);
            }
        });

        if (ghostFaceIds.length === 0) {
            console.log('\n✨ Database and AWS are in sync! No ghost faces found.');
            return;
        }

        console.log(`\n⚠️ Found ${ghostFaceIds.length} ghost faces for ${ghostExternalIds.size} unknown employees.`);
        console.log('Employees to be cleaned:', Array.from(ghostExternalIds).join(', '));

        // 4. Delete Ghosts
        console.log('\nUsing DeleteFacesCommand to clean up...');

        // AWS limits batch delete to 1000, but safer to do chunks of 100
        const chunkSize = 100;
        for (let i = 0; i < ghostFaceIds.length; i += chunkSize) {
            const batch = ghostFaceIds.slice(i, i + chunkSize);
            const deleteCommand = new DeleteFacesCommand({
                CollectionId: COLLECTION_ID,
                FaceIds: batch
            });
            await rekognitionClient.send(deleteCommand);
            console.log(`🗑️ Deleted batch of ${batch.length} faces.`);
        }

        console.log('\n🎉 Reconciliation Complete: All ghost faces deleted.');

    } catch (error) {
        console.error('❌ Error during reconciliation:', error);
    }
}

reconcile();
