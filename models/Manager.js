const { GetCommand, PutCommand, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');

const TABLE_NAME = process.env.DYNAMODB_MANAGER_TABLE || 'srm-manager-table';

/**
 * Generate Next Manager ID (Prefix: MGR)
 */
async function generateNextId() {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'managerId',
    });

    const response = await docClient.send(command);
    const items = response.Items || [];

    let maxId = 0;
    items.forEach(item => {
        if (item.managerId && item.managerId.startsWith('MGR')) {
            const numPart = parseInt(item.managerId.replace('MGR', ''), 10);
            if (!isNaN(numPart) && numPart > maxId) {
                maxId = numPart;
            }
        }
    });

    const nextId = maxId + 1;
    return `MGR${String(nextId).padStart(3, '0')}`;
}

/**
 * Get manager by ID
 */
async function getManagerById(managerId) {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { managerId },
    });

    const response = await docClient.send(command);
    return response.Item;
}

/**
 * Get manager by Email
 */
async function getManagerByEmail(email) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'email = :email OR personalEmail = :email',
        ExpressionAttributeValues: {
            ':email': email
        }
    });

    const response = await docClient.send(command);
    return response.Items && response.Items.length > 0 ? response.Items[0] : null;
}

/**
 * Create new manager
 */
async function createManager(managerData) {
    const timestamp = new Date().toISOString();
    const item = {
        ...managerData,
        managerId: managerData.managerId || await generateNextId(),
        role: managerData.role || 'BRANCH_MANAGER',
        status: managerData.status || 'active',
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
 * Update manager
 */
async function updateManager(managerId, updates) {
    const timestamp = new Date().toISOString();

    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'managerId') {
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
        Key: { managerId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
    });

    const response = await docClient.send(command);
    return response.Attributes;
}

/**
 * Delete manager
 */
async function deleteManager(managerId) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { managerId },
    });

    await docClient.send(command);
    return { success: true };
}

/**
 * Get all managers
 */
async function getAllManagers() {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
    });

    const response = await docClient.send(command);
    return response.Items || [];
}

module.exports = {
    getManagerById,
    getManagerByEmail,
    createManager,
    updateManager,
    deleteManager,
    getAllManagers,
    generateNextId,
};
