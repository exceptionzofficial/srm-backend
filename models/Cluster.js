/**
 * Cluster Model - DynamoDB operations for cluster management
 */

const { GetCommand, PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.DYNAMODB_CLUSTERS_TABLE || 'srm-clusters-table';

/**
 * Get all clusters
 */
async function getAllClusters() {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
    });

    const response = await docClient.send(command);
    return response.Items || [];
}

/**
 * Get cluster by ID
 */
async function getClusterById(clusterId) {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { clusterId },
    });

    const response = await docClient.send(command);
    return response.Item;
}

/**
 * Create new cluster
 */
async function createCluster(clusterData) {
    const timestamp = new Date().toISOString();

    const item = {
        clusterId: uuidv4(),
        name: clusterData.name,
        branchIds: clusterData.branchIds || [], // Array of branch IDs assigned to this cluster
        managerId: clusterData.managerId || null, // Manager assigned to this cluster
        isActive: clusterData.isActive !== false,
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
 * Update cluster
 */
async function updateCluster(clusterId, updates) {
    const existing = await getClusterById(clusterId);
    if (!existing) {
        throw new Error('Cluster not found');
    }

    const timestamp = new Date().toISOString();
    const updated = {
        ...existing,
        ...updates,
        clusterId, // Ensure ID doesn't change
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
 * Delete cluster
 */
async function deleteCluster(clusterId) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { clusterId },
    });

    await docClient.send(command);
    return { success: true };
}

/**
 * Get clusters assigned to a specific manager
 */
async function getClustersByManager(managerId) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'managerId = :mid',
        ExpressionAttributeValues: {
            ':mid': managerId,
        },
    });

    const response = await docClient.send(command);
    return response.Items || [];
}

/**
 * Get cluster details including assigned managers and branch requests
 */
async function getClusterDetails(clusterId) {
    const cluster = await getClusterById(clusterId);
    if (!cluster) return null;

    const branchIds = cluster.branchIds || [];
    if (branchIds.length === 0) {
        return {
            ...cluster,
            assignedManagers: [],
            branchRequests: []
        };
    }

    // Fetch all managers and filter by branchId
    const Manager = require('./Manager');
    const allManagers = await Manager.getAllManagers();
    const assignedManagers = allManagers.filter(m => branchIds.includes(m.branchId));

    // Fetch all requests and filter by branchId
    const Request = require('./Request');
    const allRequests = await Request.getAllRequests();

    // We need to fetch employee details for each request to get their branchId
    // Optimization: In a real High-Volume DB logic, we would use a more efficient query.
    // However, following the pattern in RequestController, we filter by employee's branch.
    const Employee = require('./Employee');
    const branchRequests = await Promise.all(allRequests.map(async (req) => {
        const employee = await Employee.getEmployeeById(req.employeeId);
        if (employee && branchIds.includes(employee.branchId)) {
            return {
                ...req,
                employeeName: employee.name || `${employee.firstName} ${employee.lastName}`,
                branchId: employee.branchId
            };
        }
        return null;
    }));

    return {
        ...cluster,
        assignedManagers,
        branchRequests: branchRequests.filter(r => r !== null)
    };
}

module.exports = {
    getAllClusters,
    getClusterById,
    createCluster,
    updateCluster,
    deleteCluster,
    getClustersByManager,
    getClusterDetails,
};
