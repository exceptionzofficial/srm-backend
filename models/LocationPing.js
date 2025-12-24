/**
 * LocationPing Model - DynamoDB operations for GPS location tracking
 * Stores location pings from employees for real-time tracking
 */

const { GetCommand, PutCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.DYNAMODB_LOCATION_PINGS_TABLE || 'srm-location-pings-table';

/**
 * Save a location ping from an employee
 */
async function savePing(pingData) {
    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0]; // YYYY-MM-DD

    const item = {
        pingId: uuidv4(),
        employeeId: pingData.employeeId,
        branchId: pingData.branchId || null,
        latitude: pingData.latitude,
        longitude: pingData.longitude,
        isInsideGeofence: pingData.isInsideGeofence,
        distance: pingData.distance || null,
        timestamp: timestamp,
        date: date,
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
    });

    await docClient.send(command);
    return item;
}

/**
 * Get latest ping for an employee
 */
async function getLatestPing(employeeId) {
    const today = new Date().toISOString().split('T')[0];

    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'employeeId = :empId AND #date = :today',
        ExpressionAttributeNames: {
            '#date': 'date',
        },
        ExpressionAttributeValues: {
            ':empId': employeeId,
            ':today': today,
        },
    });

    const response = await docClient.send(command);
    const pings = response.Items || [];

    // Sort by timestamp descending and return latest
    pings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return pings[0] || null;
}

/**
 * Get all pings for an employee on a specific date
 */
async function getPingsForDate(employeeId, date) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'employeeId = :empId AND #date = :date',
        ExpressionAttributeNames: {
            '#date': 'date',
        },
        ExpressionAttributeValues: {
            ':empId': employeeId,
            ':date': date,
        },
    });

    const response = await docClient.send(command);
    const pings = response.Items || [];

    // Sort by timestamp ascending
    pings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return pings;
}

/**
 * Get all employees' latest pings (for admin map)
 */
async function getAllLatestPings() {
    const today = new Date().toISOString().split('T')[0];

    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#date = :today',
        ExpressionAttributeNames: {
            '#date': 'date',
        },
        ExpressionAttributeValues: {
            ':today': today,
        },
    });

    const response = await docClient.send(command);
    const pings = response.Items || [];

    // Group by employee and get latest for each
    const latestPings = {};
    pings.forEach(ping => {
        const existing = latestPings[ping.employeeId];
        if (!existing || new Date(ping.timestamp) > new Date(existing.timestamp)) {
            latestPings[ping.employeeId] = ping;
        }
    });

    return Object.values(latestPings);
}

/**
 * Calculate work minutes inside geofence for a date
 * Counts consecutive pings where isInsideGeofence is true
 * Each ping represents approximately 1 minute
 */
async function calculateWorkMinutes(employeeId, date) {
    const pings = await getPingsForDate(employeeId, date);

    let workMinutes = 0;

    for (const ping of pings) {
        if (ping.isInsideGeofence) {
            workMinutes += 1; // Each ping = 1 minute interval
        }
    }

    return workMinutes;
}

/**
 * Get work summary for an employee on a date
 */
async function getWorkSummary(employeeId, date) {
    const pings = await getPingsForDate(employeeId, date);
    const workMinutes = pings.filter(p => p.isInsideGeofence).length;

    const hours = Math.floor(workMinutes / 60);
    const minutes = workMinutes % 60;

    return {
        employeeId,
        date,
        totalPings: pings.length,
        pingsInside: pings.filter(p => p.isInsideGeofence).length,
        pingsOutside: pings.filter(p => !p.isInsideGeofence).length,
        workMinutes,
        formattedDuration: `${hours}h ${minutes}m`,
    };
}

module.exports = {
    savePing,
    getLatestPing,
    getPingsForDate,
    getAllLatestPings,
    calculateWorkMinutes,
    getWorkSummary,
};
