const path = require('path');
// Load env vars BEFORE requiring aws config
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');

const TABLE_NAME = process.env.DYNAMODB_EMPLOYEE_TABLE || 'srm-employee-table';

async function clearAllEmployees() {
    try {
        console.log('AWS_REGION:', process.env.AWS_REGION);
        // Do not log secrets in production, but for debug:
        console.log('AWS Key Loaded:', !!process.env.AWS_ACCESS_KEY_ID);

        console.log('Scanning all employees...');
        const scanCommand = new ScanCommand({
            TableName: TABLE_NAME,
        });

        const response = await docClient.send(scanCommand);
        const employees = response.Items || [];

        console.log(`Found ${employees.length} employees. Deleting...`);

        for (const employee of employees) {
            console.log(`Deleting employee: ${employee.employeeId} (${employee.name})`);
            const deleteCommand = new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { employeeId: employee.employeeId },
            });
            await docClient.send(deleteCommand);
        }

        console.log('All employees cleared successfully.');
    } catch (error) {
        console.error('Error clearing employees:', error);
    }
}

// Check if running directly
if (require.main === module) {
    clearAllEmployees();
}

module.exports = clearAllEmployees;
