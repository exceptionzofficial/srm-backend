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
        travelSessionId: pingData.travelSessionId || null, // Link to Travel Session if active
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

/**
 * Get chronological list of branch visits and their durations
 */
async function getDetailedBranchSummary(employeeId, date) {
    const pings = await getPingsForDate(employeeId, date);
    const Branch = require('./Branch');
    const TravelSession = require('./TravelSession');
    const Request = require('./Request');
    const branches = await Branch.getAllBranches();
    const branchMap = {};
    branches.forEach(b => branchMap[b.branchId] = b.name);

    const travelSessions = await TravelSession.getSessionsByEmployeeAndDate(employeeId, date);
    const permissions = await Request.getApprovedPermissions(employeeId, date);
    
    const summary = [];
    let currentSession = null;

    // Process pings for branch visits
    pings.forEach((ping) => {
        const branchId = ping.branchId;
        const isInside = ping.isInsideGeofence;

        if (isInside && branchId) {
            // Check if we can merge with current session (same branch, < 5 min gap)
            if (currentSession && currentSession.branchId === branchId) {
                const gapMinutes = (new Date(ping.timestamp) - new Date(currentSession.endTime)) / (1000 * 60);
                if (gapMinutes <= 5) {
                    currentSession.endTime = ping.timestamp;
                    currentSession.count += 1;
                    return;
                }
            }
            
            // Otherwise, start new or switch branch
            if (!currentSession || currentSession.branchId !== branchId) {
                currentSession = {
                    type: 'BRANCH',
                    branchId,
                    branchName: branchMap[branchId] || 'Unknown Branch',
                    startTime: ping.timestamp,
                    endTime: ping.timestamp,
                    count: 1
                };
                summary.push(currentSession);
            } else {
                currentSession.endTime = ping.timestamp;
                currentSession.count += 1;
            }
        }
    });

    // Merge travel sessions
    travelSessions.forEach(ts => {
        summary.push({
            type: 'TRAVEL',
            branchName: `Travel to ${ts.destination || ts.requestId || 'Unknown'}`,
            destination: ts.destination,
            startTime: ts.startTime,
            endTime: ts.endTime,
            durationMinutes: ts.durationMinutes || 0,
            status: ts.status
        });
    });

    // Merge approved permissions
    permissions.forEach(p => {
        const pStartTime = p.data?.startTime ? `${date}T${p.data.startTime}:00Z` : p.createdAt;
        const pEndTime = p.data?.endTime ? `${date}T${p.data.endTime}:00Z` : p.createdAt;
        
        summary.push({
            type: 'PERMISSION',
            branchName: 'Permission / Partial Leave (Approved)',
            reason: p.data?.reason,
            startTime: pStartTime,
            endTime: pEndTime,
            durationMinutes: p.data?.duration || 60, // Default fallback
            status: 'APPROVED'
        });
    });

    // Sort chronologically
    summary.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    return summary.map(s => {
        const start = new Date(s.startTime);
        const end = s.endTime ? new Date(s.endTime) : null;
        
        let duration = s.durationMinutes;
        
        // Use clock time for BRANCH types if duration not provided
        if (s.type === 'BRANCH' && !duration && end) {
            duration = Math.round((end - start) / (1000 * 60));
        } else if (!duration) {
            duration = s.count || 0;
        }

        return {
            ...s,
            formattedDuration: duration >= 60 
                ? `${Math.floor(duration / 60)}h ${duration % 60}m`
                : `${duration} mins`
        };
    });
}

module.exports = {
    savePing,
    getLatestPing,
    getPingsForDate,
    getAllLatestPings,
    calculateWorkMinutes,
    getWorkSummary,
    getDetailedBranchSummary,
};
