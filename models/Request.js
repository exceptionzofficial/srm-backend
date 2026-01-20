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
 */
async function updateRequestStatus(requestId, status, hrId, rejectionReason = null) {
    const timestamp = new Date().toISOString();

    const updateExpression = ['#status = :status', '#updatedAt = :updatedAt', '#hrActionBy = :hrId', '#hrActionAt = :now'];
    const expressionAttributeNames = {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#hrActionBy': 'hrActionBy',
        '#hrActionAt': 'hrActionAt'
    };
    const expressionAttributeValues = {
        ':status': status,
        ':updatedAt': timestamp,
        ':hrId': hrId,
        ':now': timestamp
    };

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

module.exports = {
    createRequest,
    getRequestsByEmployee,
    getAllRequests,
    updateRequestStatus,
    getApprovedPermissions,
    getApprovedRequestsByDate,
    getApprovedRequestsByDateRange
};
