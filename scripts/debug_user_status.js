const { docClient } = require('../config/aws');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

const EMPLOYEE_TABLE = process.env.DYNAMODB_EMPLOYEE_TABLE || 'srm-employee-table';
const MANAGER_TABLE = process.env.DYNAMODB_MANAGER_TABLE || 'srm-manager-table';

async function findUser(email) {
    console.log(`Searching for email: "${email}"`);

    // 1. Search Employee Table
    try {
        const empCommand = new ScanCommand({
            TableName: EMPLOYEE_TABLE,
            FilterExpression: 'email = :email OR personalEmail = :email',
            ExpressionAttributeValues: {
                ':email': email
            }
        });
        const empRes = await docClient.send(empCommand);
        if (empRes.Items && empRes.Items.length > 0) {
            console.log('✅ Found in Employee Table:', JSON.stringify(empRes.Items[0], null, 2));
        } else {
            console.log('❌ Not found in Employee Table');
        }
    } catch (err) {
        console.error('Error scanning Employee Table:', err.message);
    }

    // 2. Search Manager Table
    try {
        const mgrCommand = new ScanCommand({
            TableName: MANAGER_TABLE,
            FilterExpression: 'email = :email OR personalEmail = :email',
            ExpressionAttributeValues: {
                ':email': email
            }
        });
        const mgrRes = await docClient.send(mgrCommand);
        if (mgrRes.Items && mgrRes.Items.length > 0) {
            console.log('✅ Found in Manager Table:', JSON.stringify(mgrRes.Items[0], null, 2));
        } else {
            console.log('❌ Not found in Manager Table');
        }
    } catch (err) {
        console.error('Error scanning Manager Table:', err.message);
    }
}

// Run the search
const targetEmail = 'bharathkumar21cse@gmail.com';
findUser(targetEmail);
