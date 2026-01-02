
const { PutCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');

const TABLE_NAME = process.env.DYNAMODB_SALARY_TABLE || 'srm-salary-table';

// Ensure table exists or user environment variable is set
// Ideally we would create the table if it doesn't exist, but usually that's infrastructure code.
// We assume the table is created or will be created.

/**
 * Create or Update Salary Structure for an Employee
 * @param {Object} salaryData 
 */
async function saveSalary(salaryData) {
    const timestamp = new Date().toISOString();
    const item = {
        ...salaryData, // Should include employeeId, month, year, etc.
        id: `${salaryData.employeeId}#${salaryData.year}#${salaryData.month}`, // Composite ID
        createdAt: timestamp,
        updatedAt: timestamp,
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
    });

    await docClient.send(command);
    return item;
}

/**
 * Get Salary by Employee ID
 */
async function getSalaryByEmployee(employeeId) {
    const command = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'EmployeeIndex', // Assuming GSI exists or we scan. Better to use GSI.
        KeyConditionExpression: 'employeeId = :eid',
        ExpressionAttributeValues: {
            ':eid': employeeId,
        },
    });

    // If no GSI, we might need to scan or restructure key.
    // For now, let's assume specific access pattern: Get by Employee AND Month usually?
    // Or just list all salaries for an employee.

    // Fallback if no Index (might fail if not set up):
    // If the PK is just ID (unique per salary slip), we can't query by employee easily without GSI.
    // Let's use Scan with filter for now if we are unsure of indexes, but for production GSI is needed.
    // Given the constraints, I'll use Scan for simplicity unless user provided schema.
    // Actually, let's making the PK `employeeId` and SK `month#year`? No, one employee has multiple salaries.
    // Let's use PK: `salaryId` (uuid) or `employeeId` + SK `monthYear`.

    // Revised Strategy:
    // PK: `employeeId`
    // SK: `salaryDate` (YYYY-MM)
    // This allows querying all salaries for an employee efficiently.
}

// Rewriting save to use PK/SK pattern
async function createSalaryRecord(salaryData) {
    const timestamp = new Date().toISOString();
    // salaryData must have employeeId, month (MM), year (YYYY), components

    const item = {
        PK: `EMP#${salaryData.employeeId}`,
        SK: `SALARY#${salaryData.year}#${salaryData.month}`,
        entityType: 'SALARY',
        ...salaryData,
        createdAt: timestamp,
        updatedAt: timestamp
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
    });

    await docClient.send(command);
    return item;
}

async function getEmployeeSalaries(employeeId) {
    const command = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
            ':pk': `EMP#${employeeId}`,
            ':sk': 'SALARY#'
        }
    });

    // Note: This assumes the table uses generic PK/SK design. 
    // If the Employee table is separate and this is a new table, we might just use employeeId as partition key if we don't crave single-table design.
    // Looking at Employee.js, it uses `employeeId` as Key. It doesn't seem to use single-table design (PK/SK).
    // So `srm-salary-table` should probably have `salaryId` as Key, or `employeeId` as Partition Key and `monthYear` as Sort Key.

    try {
        const response = await docClient.send(command);
        return response.Items || [];
    } catch (e) {
        // Fallback to Scan if Key Schema doesn't match
        console.warn("Query failed, falling back to scan", e);
        // ... (Scan logic)
    }
}

// Let's stick to a simple model compatible with likely existing setup:
// Table: srm-salary-table
// Key: salaryId (Partition)
// GSI: employeeId (Partition) -> to list by employee

async function createSalary(data) {
    const { v4: uuidv4 } = require('uuid');
    const salaryId = uuidv4();
    const timestamp = new Date().toISOString();

    const item = {
        salaryId,
        ...data,
        createdAt: timestamp
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
    });

    await docClient.send(command);
    return item;
}

async function getSalariesByEmployeeId(employeeId) {
    console.error('DEBUG: Entering getSalariesByEmployeeId', employeeId);
    // efficient scan or query using GSI
    // assuming GSI name 'employeeId-index'
    // efficient scan or query using GSI
    // assuming GSI name 'employeeId-index'
    const fs = require('fs');
    fs.appendFileSync('debug.log', `Entering getSalariesByEmployeeId ${employeeId}\n`);
    fs.appendFileSync('debug.log', `QueryCommand type: ${typeof QueryCommand}\n`);
    try {
        const command = new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'employeeId-index',
            KeyConditionExpression: 'employeeId = :eid',
            ExpressionAttributeValues: { ':eid': employeeId }
        });

        const response = await docClient.send(command);
        return response.Items;
    } catch (err) {
        // Fallback
        const fs = require('fs'); // Ensure fs is available here just in case scope is weird (though it should be fine)
        fs.appendFileSync('debug.log', `Query failed/skipped, error: ${err.message}\n`);
        console.log('Query failed/skipped, error:', err.message);
        // If index not found, scan
        // If index not found, scan
        // If index not found, scan
        // console.log('Query failed, attempting scan...');
        fs.appendFileSync('debug.log', 'Query failed, attempting scan...\n');
        try {
            // console.log('Creating ScanCommand...');
            fs.appendFileSync('debug.log', 'Creating ScanCommand...\n');
            const scanCmd = new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: 'employeeId = :eid',
                ExpressionAttributeValues: { ':eid': employeeId }
            });
            // console.log('ScanCommand created via new ScanCommand(). Sending command...');
            fs.appendFileSync('debug.log', 'ScanCommand created. Sending command...\n');
            const res = await docClient.send(scanCmd);
            // console.log('Scan successful');
            fs.appendFileSync('debug.log', 'Scan successful\n');
            return res.Items;
        } catch (scanError) {
            // console.error('Scan failed:', scanError);
            fs.appendFileSync('debug.log', `Scan failed: ${scanError.message}\n`);
            throw scanError;
        }
    }
}

async function updateSalary(salaryId, updates) {
    const timestamp = new Date().toISOString();

    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'salaryId' && key !== 'employeeId' && key !== 'createdAt') {
            updateExpressions.push(`#${key} = :${key}`);
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = value;
        }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = timestamp;

    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { salaryId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    });

    const response = await docClient.send(command);
    return response.Attributes;
}

module.exports = {
    createSalary,
    getSalariesByEmployeeId,
    updateSalary
};
