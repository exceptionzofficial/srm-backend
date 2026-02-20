/**
 * TravelSession Model - DynamoDB operations for Employee Travel
 * Tracks the actual execution of an approved BRANCH_TRAVEL request
 */

const { PutCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.DYNAMODB_TRAVEL_SESSION_TABLE || 'srm-travel-session-table';

/**
 * Start a Travel Session
 * @param {Object} data { requestId, employeeId, startLocation: {lat, lng} }
 */
async function startTravelSession(data) {
    const timestamp = new Date().toISOString();
    const item = {
        sessionId: uuidv4(),
        requestId: data.requestId, // Links back to the approved Request
        employeeId: data.employeeId,
        status: 'STARTED', // STARTED, COMPLETED
        startTime: timestamp,
        endTime: null,
        startLocation: data.startLocation || null, // { lat, lng }
        endLocation: null,
        totalDistance: 0,
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
 * End a Travel Session
 * @param {String} sessionId 
 * @param {Object} endLocation { lat, lng }
 * @param {Number} totalDistance (optional, calculated from pings usually)
 */
async function endTravelSession(sessionId, endLocation, totalDistance = 0) {
    const timestamp = new Date().toISOString();

    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { sessionId },
        UpdateExpression: 'SET #status = :status, #endTime = :endTime, #endLocation = :endLoc, #dist = :dist, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#status': 'status',
            '#endTime': 'endTime',
            '#endLocation': 'endLocation',
            '#dist': 'totalDistance',
            '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
            ':status': 'COMPLETED',
            ':endTime': timestamp,
            ':endLoc': endLocation,
            ':dist': totalDistance,
            ':updatedAt': timestamp
        },
        ReturnValues: 'ALL_NEW',
    });

    const response = await docClient.send(command);
    return response.Attributes;
}

/**
 * Get Active Travel Session for Employee
 */
async function getActiveTravelSession(employeeId) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'employeeId = :empId AND #status = :status',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':empId': employeeId,
            ':status': 'STARTED'
        },
    });

    const response = await docClient.send(command);
    return response.Items && response.Items.length > 0 ? response.Items[0] : null;
}

/**
 * Get Travel Session by ID
 */
async function getTravelSessionById(sessionId) {
    // Since we don't have GetCommand by simple key without partition key knowledge if strictly defined,
    // assuming sessionId is partition key.
    // If not, we'd need Scan. But standard practice is ID is partition.
    // However, looking at other files, they often use Scan for flexibility if schema isn't strict.
    // Let's use Scan to be safe as per other files' patterns, or Get if we are sure.
    // In `savePing` uuid is generated. 

    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'sessionId = :sessId',
        ExpressionAttributeValues: {
            ':sessId': sessionId
        },
    });

    const response = await docClient.send(command);
    return response.Items && response.Items.length > 0 ? response.Items[0] : null;
}

/**
 * Get Travel Sessions by Date Range (for Payroll)
 * If employeeId is null, returns for ALL employees
 */
async function getTravelSessionsByDateRange(employeeId, startDate, endDate) {
    let filterExpression = '#status = :status';
    let expressionAttributeValues = {
        ':status': 'COMPLETED'
    };

    if (employeeId) {
        filterExpression += ' AND employeeId = :empId';
        expressionAttributeValues[':empId'] = employeeId;
    }

    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: filterExpression,
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: expressionAttributeValues,
    });

    const response = await docClient.send(command);
    const items = response.Items || [];

    return items.filter(item => {
        const itemDate = item.startTime.split('T')[0];
        return itemDate >= startDate && itemDate <= endDate;
    });
}

/**
 * Add Ping to Travel Session (Update Path and Distance)
 */
async function addPing(sessionId, location) {
    // location: { lat, lng, timestamp }

    // 1. Get current session
    const session = await getTravelSessionById(sessionId);
    if (!session || session.status !== 'STARTED') return null;

    // 2. Calculate Distance from last point
    const prevLocation = session.lastLocation || session.startLocation;
    let distIncrement = 0;

    if (prevLocation && prevLocation.lat && prevLocation.lng) {
        // Simple Haversine implementation
        const R = 6371e3; // metres
        const lat1 = parseFloat(prevLocation.lat);
        const lon1 = parseFloat(prevLocation.lng);
        const lat2 = parseFloat(location.lat);
        const lon2 = parseFloat(location.lng);

        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distIncrement = R * c; // in meters
    }

    const newTotalDistance = (session.totalDistance || 0) + distIncrement;
    const timestamp = new Date().toISOString();

    // 3. Update Session
    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { sessionId },
        UpdateExpression: 'SET #lastLoc = :lastLoc, #dist = :dist, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#lastLoc': 'lastLocation',
            '#dist': 'totalDistance',
            '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
            ':lastLoc': { lat: location.lat, lng: location.lng },
            ':dist': newTotalDistance,
            ':updatedAt': timestamp
        },
        ReturnValues: 'ALL_NEW',
    });

    try {
        const response = await docClient.send(command);
        return response.Attributes;
    } catch (err) {
        console.error('Error updating travel session ping:', err);
        return null;
    }
}

module.exports = {
    startTravelSession,
    endTravelSession,
    getActiveTravelSession,
    getTravelSessionById,
    getTravelSessionsByDateRange,
    addPing
};
