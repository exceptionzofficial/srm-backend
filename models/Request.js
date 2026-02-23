const { PutCommand, QueryCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.DYNAMODB_REQUEST_TABLE || 'srm-request-table';

/**
 * Create a new Request
 * @param {Object} requestData { employeeId, type, data, ... }
 */
async function createRequest(requestData) {
    const timestamp = new Date().toISOString();
    const item = {
        requestId: uuidv4(),
        employeeId: requestData.employeeId,
        type: requestData.type, // 'ADVANCE', 'LEAVE', 'PERMISSION'
        status: 'PENDING', // 'PENDING', 'APPROVED', 'REJECTED'
        data: requestData.data || {}, // { amount, reason, date, duration, etc. }
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
 * Get Request by ID
 */
async function getRequestById(requestId) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'requestId = :reqId',
        ExpressionAttributeValues: {
            ':reqId': requestId,
        },
    });

    const response = await docClient.send(command);
    return response.Items && response.Items.length > 0 ? response.Items[0] : null;
}

/**
 * Get Requests by Employee ID
 */
async function getRequestsByEmployee(employeeId) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'employeeId = :empId',
        ExpressionAttributeValues: {
            ':empId': employeeId,
        },
    });

    const response = await docClient.send(command);
    // Sort by createdAt desc
    const items = response.Items || [];
    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Get All Requests (Optional: Filter by Status)
 */
async function getAllRequests(status = null) {
    let command;
    if (status) {
        command = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: '#status = :status',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': status,
            },
        });
    } else {
        command = new ScanCommand({
            TableName: TABLE_NAME,
        });
    }

    const response = await docClient.send(command);
    const items = response.Items || [];
    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Update Request Status (Approve/Reject)
 * Supports multi-stage approval: PENDING_MANAGER -> PENDING_HR -> APPROVED
 */
async function updateRequestStatus(requestId, status, actionBy, rejectionReason = null) {
    const timestamp = new Date().toISOString();

    const updateExpression = ['#status = :status', '#updatedAt = :updatedAt'];
    const expressionAttributeNames = {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues = {
        ':status': status,
        ':updatedAt': timestamp,
    };

    // Generic "Action By" recording
    // If it's a Manager Action
    if (status === 'PENDING_HR' || status === 'REJECTED') {
        updateExpression.push('#managerActionBy = :actionBy', '#managerActionAt = :now');
        expressionAttributeNames['#managerActionBy'] = 'managerActionBy';
        expressionAttributeNames['#managerActionAt'] = 'managerActionAt';
        expressionAttributeValues[':actionBy'] = actionBy;
        expressionAttributeValues[':now'] = timestamp;
    }

    // If it's an HR Action (Final Approval or Rejection by HR)
    if (status === 'APPROVED' || (status === 'REJECTED' && !expressionAttributeNames['#managerActionBy'])) {
        // Note: If Manager rejected, we already set managerActionBy. 
        // If HR rejects, we set hrActionBy. 
        // Simple heuristic: If status is APPROVED, it's HR.
        updateExpression.push('#hrActionBy = :actionBy', '#hrActionAt = :now');
        expressionAttributeNames['#hrActionBy'] = 'hrActionBy';
        expressionAttributeNames['#hrActionAt'] = 'hrActionAt';
        expressionAttributeValues[':actionBy'] = actionBy;
        expressionAttributeValues[':now'] = timestamp;
    }

    if (rejectionReason) {
        updateExpression.push('#rejectionReason = :reason');
        expressionAttributeNames['#rejectionReason'] = 'rejectionReason';
        expressionAttributeValues[':reason'] = rejectionReason;
    }

    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { requestId },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
    });

    const response = await docClient.send(command);
    return response.Attributes;
}

/**
 * Get Approved Permissions for an Employee on a specific Date
 * Used for calculating Total Work Duration
 */
async function getApprovedPermissions(employeeId, date) {
    // Permission requests usually have a date in `data.date`
    // Since `data` is a map, we can't easily query index it. 
    // We'll scan for approvals for this employee and filter in code.
    // Optimization: In real prod, we'd duplicate the date to a top-level attribute.

    // For now, let's fetch all APPROVED PERMISSIONS for the employee
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'employeeId = :empId AND #type = :type AND #status = :status',
        ExpressionAttributeNames: {
            '#type': 'type',
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':empId': employeeId,
            ':type': 'PERMISSION',
            ':status': 'APPROVED'
        }
    });

    const response = await docClient.send(command);
    const items = response.Items || [];

    // Filter by date match in data.date (assuming data.date is YYYY-MM-DD or similar standard format)
    return items.filter(item => item.data && item.data.date === date);
}

/**
 * Get all approved requests (LEAVE or PERMISSION) for a specific date across ALL employees
 * Optimized for daily report generation
 */
async function getApprovedRequestsByDate(date) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'APPROVED'
        }
    });

    const response = await docClient.send(command);
    const items = response.Items || [];

    // Filter by date match in data.date
    // Also include requests that span a date range if applicable (future enhancement)
    // For now, assuming single date in data.date
    return items.filter(item => {
        if (!item.data || !item.data.date) return false;
        return item.data.date === date;
    });
}

/**
 * Get approved requests for a date range
 */
async function getApprovedRequestsByDateRange(startDate, endDate) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'APPROVED'
        }
    });

    const response = await docClient.send(command);
    const items = response.Items || [];

    return items.filter(item => {
        if (!item.data || !item.data.date) return false;
        return item.data.date >= startDate && item.data.date <= endDate;
    });
}

/**
 * Get ALL requests for a date range (regardless of status)
 */
async function getRequestsByDateRange(startDate, endDate) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        // No FilterExpression for status, just get everything. 
        // We filter by date in code because date is nested in `data`.
    });

    const response = await docClient.send(command);
    const items = response.Items || [];

    return items.filter(item => {
        // Priority: data.date -> createdAt
        let itemDate = item.data?.date;
        if (!itemDate && item.createdAt) {
            itemDate = item.createdAt.split('T')[0];
        }

        if (!itemDate) return false;
        return itemDate >= startDate && itemDate <= endDate;
    });
}

/**
 * Update Request Data (Internal metadata updates)
 */
async function updateRequestData(requestId, newData) {
    const timestamp = new Date().toISOString();
    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { requestId },
        UpdateExpression: 'SET #data = :data, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#data': 'data',
            '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
            ':data': newData,
            ':updatedAt': timestamp,
        },
        ReturnValues: 'ALL_NEW',
    });

    const response = await docClient.send(command);
    return response.Attributes;
}

module.exports = {
    createRequest,
    getRequestById,
    getRequestsByEmployee,
    getAllRequests,
    updateRequestStatus,
    updateRequestData, // Exporting new method
    getApprovedPermissions,
    getApprovedRequestsByDate,
    getApprovedRequestsByDateRange,
    getRequestsByDateRange
};
