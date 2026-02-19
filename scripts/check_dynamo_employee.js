const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');

const TABLE_NAME = process.env.DYNAMODB_EMPLOYEE_TABLE || 'srm-employee-table';

async function checkFaces() {
    try {
        console.log(`Scanning table: ${TABLE_NAME}...`);

        const command = new ScanCommand({
            TableName: TABLE_NAME,
            ProjectionExpression: 'employeeId, #name, faceId',
            ExpressionAttributeNames: {
                '#name': 'name' // 'name' might be reserved
            }
        });

        const response = await docClient.send(command);
        const employees = response.Items || [];

        console.log('--- Employee Face Registration Status (DynamoDB) ---');
        if (employees.length === 0) {
            console.log('No employees found.');
        }

        const target = employees.find(e => e.employeeId === 'SRMC001');
        if (target) {
            console.log(`FOUND SRMC001: ${target.name}, FaceId: ${target.faceId ? target.faceId : 'NULL'}`);
        } else {
            console.log('SRMC001 NOT FOUND in DynamoDB');
        }

        employees.forEach(e => {
            const hasFace = e.faceId && e.faceId.trim().length > 0;
            console.log(`${e.employeeId} (${e.name}): ${hasFace ? '✅ Registered (' + e.faceId + ')' : '❌ Not Registered'}`);
        });

    } catch (error) {
        console.error('Error scanning DynamoDB:', error);
    }
}

checkFaces();
