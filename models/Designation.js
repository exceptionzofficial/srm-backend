/**
 * Designation Model - DynamoDB operations for designations
 */

const { GetCommand, PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.DYNAMODB_DESIGNATIONS_TABLE || 'srm-designations-table';

/**
 * Get all designations
 */
async function getAllDesignations() {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
    });

    const response = await docClient.send(command);
    return response.Items || [];
}

/**
 * Get designation by ID
 */
async function getDesignationById(designationId) {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { designationId },
    });

    const response = await docClient.send(command);
    return response.Item;
}

/**
 * Create new designation
 */
async function createDesignation(data) {
    const timestamp = new Date().toISOString();

    const item = {
        designationId: uuidv4(),
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
 * Update designation
 */
async function updateDesignation(designationId, updates) {
    const existing = await getDesignationById(designationId);
    if (!existing) {
        throw new Error('Designation not found');
    }

    const timestamp = new Date().toISOString();
    const updated = {
        ...existing,
        ...updates,
        designationId, // Ensure ID doesn't change
        updatedAt: timestamp,
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: updated,
    });

    await docClient.send(command);
    return updated;
}

/**
 * Delete designation
 */
async function deleteDesignation(designationId) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { designationId },
    });

    await docClient.send(command);
    return { success: true };
}

module.exports = {
    getAllDesignations,
    getDesignationById,
    createDesignation,
    updateDesignation,
    deleteDesignation,
};
