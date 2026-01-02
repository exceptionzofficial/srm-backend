const { GetCommand, PutCommand, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');

const TABLE_NAME = process.env.DYNAMODB_EMPLOYEE_TABLE || 'srm-employee-table';

/**
 * Get employee by ID
 */
async function getEmployeeById(employeeId) {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { employeeId },
    });

    const response = await docClient.send(command);
    return response.Item;
}

/**
 * Check if employee exists
 */
async function employeeExists(employeeId) {
    const employee = await getEmployeeById(employeeId);
    return !!employee;
}

/**
 * Create new employee
 */
async function createEmployee(employeeData) {
    const timestamp = new Date().toISOString();
    const item = {
        ...employeeData,
        faceId: null,
        status: employeeData.status || 'active',
        workMode: employeeData.workMode || 'OFFICE', // Default to OFFICE
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
 * Update employee
 */
async function updateEmployee(employeeId, updates) {
    const timestamp = new Date().toISOString();

    // Build update expression dynamically
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'employeeId') {
            updateExpressions.push(`#${key} = :${key}`);
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = value;
        }
    });

    // Always update updatedAt
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = timestamp;

    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { employeeId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
    });

    const response = await docClient.send(command);
    return response.Attributes;
}

/**
 * Update employee's face ID
 */
async function updateEmployeeFaceId(employeeId, faceId) {
    return updateEmployee(employeeId, { faceId });
}

/**
 * Get all employees
 */
async function getAllEmployees() {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
    });

    const response = await docClient.send(command);
    return response.Items || [];
}

/**
 * Delete employee
 */
async function deleteEmployee(employeeId) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { employeeId },
    });

    await docClient.send(command);
    return { success: true };
}

module.exports = {
    getEmployeeById,
    employeeExists,
    createEmployee,
    updateEmployee,
    updateEmployeeFaceId,
    getAllEmployees,
    deleteEmployee,
};
