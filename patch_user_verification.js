require('dotenv').config();
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('./config/aws');

const EMPLOYEE_TABLE = process.env.DYNAMODB_EMPLOYEE_TABLE || 'srm-employee-table';
const EMAIL_TO_PATCH = 'harigsy2003@gmail.com';

async function patchUser() {
    console.log(`Patching user verification for: ${EMAIL_TO_PATCH}...`);

    try {
        // 1. Find the user
        const scanCommand = new ScanCommand({
            TableName: EMPLOYEE_TABLE,
            FilterExpression: 'personalEmail = :email OR email = :email',
            ExpressionAttributeValues: {
                ':email': EMAIL_TO_PATCH
            }
        });

        const scanRes = await docClient.send(scanCommand);
        const employee = scanRes.Items && scanRes.Items[0];

        if (!employee) {
            console.log('❌ Employee not found.');
            return;
        }

        console.log(`Found employee: ${employee.name} (${employee.employeeId})`);

        // 2. Update with isEmailVerified = true
        await docClient.send(new UpdateCommand({
            TableName: EMPLOYEE_TABLE,
            Key: { employeeId: employee.employeeId },
            UpdateExpression: 'SET isEmailVerified = :verified',
            ExpressionAttributeValues: {
                ':verified': true
            }
        }));

        console.log('✅ Success! User marked as isEmailVerified = true.');
        console.log('You can now log in/register without OTP issues.');

    } catch (error) {
        console.error('❌ Error patching user:', error);
    }
}

patchUser();
