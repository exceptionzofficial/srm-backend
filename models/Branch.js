/**
 * Branch Model - DynamoDB operations for branch/location management
 */

const { GetCommand, PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.DYNAMODB_BRANCHES_TABLE || 'srm-branches-table';

/**
 * Get all branches
 */
async function getAllBranches() {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
    });

    const response = await docClient.send(command);
    return response.Items || [];
}

/**
 * Get branch by ID
 */
async function getBranchById(branchId) {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { branchId },
    });

    const response = await docClient.send(command);
    return response.Item;
}

/**
 * Get all active branches
 */
async function getActiveBranches() {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'isActive = :active',
        ExpressionAttributeValues: {
            ':active': true,
        },
    });

    const response = await docClient.send(command);
    return response.Items || [];
}

/**
 * Create new branch
 */
async function createBranch(branchData) {
    const timestamp = new Date().toISOString();

    const item = {
        branchId: uuidv4(),
        name: branchData.name,
        address: branchData.address || '',
        latitude: branchData.latitude,
        longitude: branchData.longitude,
        radiusMeters: branchData.radiusMeters || 100,
        isActive: branchData.isActive !== false,
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
 * Update branch
 */
async function updateBranch(branchId, updates) {
    const existing = await getBranchById(branchId);
    if (!existing) {
        throw new Error('Branch not found');
    }

    const timestamp = new Date().toISOString();
    const updated = {
        ...existing,
        ...updates,
        branchId, // Ensure ID doesn't change
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
 * Delete branch
 */
async function deleteBranch(branchId) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { branchId },
    });

    await docClient.send(command);
    return { success: true };
}

module.exports = {
    getAllBranches,
    getBranchById,
    getActiveBranches,
    createBranch,
    updateBranch,
    deleteBranch,
};
