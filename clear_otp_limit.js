require('dotenv').config(); // Load environment variables
const { DeleteCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('./config/aws');

const OTP_TABLE = 'srm-otp-table';
const EMPLOYEE_TABLE = process.env.DYNAMODB_EMPLOYEE_TABLE || 'srm-employee-table';
const EMAIL_TO_CLEAR = 'harigsy2003@gmail.com';

async function fixUserAccount() {
    console.log(`Starting fix for user: ${EMAIL_TO_CLEAR}...`);

    try {
        // 1. Clear OTP Rate Limit
        console.log('1. Clearing OTP rate limit...');
        await docClient.send(new DeleteCommand({
            TableName: OTP_TABLE,
            Key: { identifier: EMAIL_TO_CLEAR }
        }));
        console.log('✅ OTP limit cleared.');

        // 2. Clear Face Registration
        console.log('2. checking for employee record to reset face...');

        // Scan for employee by personalEmail
        const scanCommand = new ScanCommand({
            TableName: EMPLOYEE_TABLE,
            FilterExpression: 'personalEmail = :email OR email = :email',
            ExpressionAttributeValues: {
                ':email': EMAIL_TO_CLEAR
            }
        });

        const scanRes = await docClient.send(scanCommand);
        const employee = scanRes.Items && scanRes.Items[0];

        if (employee) {
            console.log(`Found employee: ${employee.name} (${employee.employeeId})`);
            if (employee.faceId) {
                console.log(`Resetting faceId: ${employee.faceId}`);
                await docClient.send(new UpdateCommand({
                    TableName: EMPLOYEE_TABLE,
                    Key: { employeeId: employee.employeeId },
                    UpdateExpression: 'REMOVE faceId'
                }));
                console.log('✅ Face registration reset.');
            } else {
                console.log('ℹ️ No face registered for this employee.');
            }
        } else {
            console.log('❌ Employee not found in database.');
        }

        console.log('\n🎉 ALL FIXES APPLIED SUCCESSFULLY! You can now login.');

    } catch (error) {
        console.error('❌ Error applying fixes:', error);
    }
}

fixUserAccount();
