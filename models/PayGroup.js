/**
 * PayGroup Model - DynamoDB operations for pay groups
 */

const { GetCommand, PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.DYNAMODB_PAYGROUPS_TABLE || 'srm-paygroups-table';

/**
 * Get all pay groups
 */
async function getAllPayGroups() {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
    });

    const response = await docClient.send(command);
    return response.Items || [];
}

/**
 * Get pay group by ID
 */
async function getPayGroupById(payGroupId) {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { payGroupId },
    });

    const response = await docClient.send(command);
    return response.Item;
}

/**
 * Create new pay group
 */
async function createPayGroup(data) {
    const timestamp = new Date().toISOString();

    const item = {
        payGroupId: uuidv4(),
        name: data.name,
        description: data.description || '',
        isActive: data.isActive !== false,
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
 * Update pay group
 */
async function updatePayGroup(payGroupId, updates) {
    const existing = await getPayGroupById(payGroupId);
    if (!existing) {
        throw new Error('Pay Group not found');
    }

    const timestamp = new Date().toISOString();
    const updated = {
        ...existing,
        ...updates,
        payGroupId, // Ensure ID doesn't change
        updatedAt: timestamp,
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: updated,
    });

    await docClient.send(command);
    return updated; // Return the full updated object
}

/**
 * Delete pay group
 */
async function deletePayGroup(payGroupId) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { payGroupId },
    });

    await docClient.send(command);
    return { success: true };
}

module.exports = {
    getAllPayGroups,
    getPayGroupById,
    createPayGroup,
    updatePayGroup,
    deletePayGroup,
};
