const { GetCommand, PutCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.DYNAMODB_ATTENDANCE_TABLE || 'srm-attendance-table';

/**
 * Create attendance record (check-in)
 */
async function createAttendance(attendanceData) {
    const timestamp = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const item = {
        attendanceId: uuidv4(),
        employeeId: attendanceData.employeeId,
        date: today,
        checkInTime: timestamp,
        checkOutTime: null,
        checkInLat: attendanceData.latitude,
        checkInLng: attendanceData.longitude,
        verificationMethod: 'face_recognition',
        status: determineStatus(new Date()),
        createdAt: timestamp,
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
    });

    await docClient.send(command);
    return item;
}

/**
 * Get today's attendance for employee (latest unchecked-out session)
 */
async function getTodayAttendance(employeeId) {
    const today = new Date().toISOString().split('T')[0];

    // Using scan with filter since we may not have GSI
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
    const items = response.Items || [];

    // Sort by checkInTime descending (latest first)
    items.sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime));

    console.log(`[Attendance] getTodayAttendance for ${employeeId} on ${today}: Found ${items.length} records`);

    // Return the latest session without checkout, or the latest session if all are checked out
    const activeSession = items.find(item => !item.checkOutTime);
    return activeSession || (items.length > 0 ? items[0] : null);
}

/**
 * Get all today's attendance records for employee (for multiple sessions)
 */
async function getAllTodayAttendance(employeeId) {
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
    const items = response.Items || [];

    // Sort by checkInTime descending (latest first)
    return items.sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime));
}

/**
 * Close all active sessions for an employee (checkout without checkout time)
 */
async function closeAllActiveSessions(employeeId) {
    const allRecords = await getAllTodayAttendance(employeeId);
    const activeRecords = allRecords.filter(r => !r.checkOutTime);

    const timestamp = new Date().toISOString();

    for (const record of activeRecords) {
        const updated = {
            ...record,
            checkOutTime: timestamp,
        };

        const putCommand = new PutCommand({
            TableName: TABLE_NAME,
            Item: updated,
        });

        await docClient.send(putCommand);
    }

    return activeRecords.length;
}

/**
 * Update attendance for checkout
 */
async function checkOut(attendanceId) {
    const timestamp = new Date().toISOString();

    // Get existing record first
    const getCommand = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'attendanceId = :attId',
        ExpressionAttributeValues: {
            ':attId': attendanceId,
        },
    });

    const existingResponse = await docClient.send(getCommand);
    if (!existingResponse.Items || existingResponse.Items.length === 0) {
        throw new Error('Attendance record not found');
    }

    const existing = existingResponse.Items[0];
    const updated = {
        ...existing,
        checkOutTime: timestamp,
    };

    const putCommand = new PutCommand({
        TableName: TABLE_NAME,
        Item: updated,
    });

    await docClient.send(putCommand);
    return updated;
}

/**
 * Get attendance history for employee
 */
async function getAttendanceHistory(employeeId, limit = 30) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'employeeId = :empId',
        ExpressionAttributeValues: {
            ':empId': employeeId,
        },
    });

    const response = await docClient.send(command);
    const items = response.Items || [];

    // Sort by date descending and limit
    return items
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, limit);
}

/**
 * Get all attendance records for a date
 */
async function getAttendanceByDate(date) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#date = :date',
        ExpressionAttributeNames: {
            '#date': 'date',
        },
        ExpressionAttributeValues: {
            ':date': date,
        },
    });

    const response = await docClient.send(command);
    return response.Items || [];
}

/**
 * Determine attendance status based on check-in time
 */
function determineStatus(checkInTime) {
    const hours = checkInTime.getHours();
    const minutes = checkInTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    // Assuming office hours start at 9:00 AM (540 minutes)
    // Late if after 9:15 AM (555 minutes)
    // Half-day if after 12:00 PM (720 minutes)

    if (timeInMinutes <= 555) {
        return 'present';
    } else if (timeInMinutes <= 720) {
        return 'late';
    } else {
        return 'half-day';
    }
}

/**
 * Update attendance record (admin)
 */
async function updateAttendance(attendanceId, updates) {
    // First find the record
    const scanCommand = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'attendanceId = :attId',
        ExpressionAttributeValues: {
            ':attId': attendanceId,
        },
    });

    const response = await docClient.send(scanCommand);
    if (!response.Items || response.Items.length === 0) {
        return null;
    }

    const existing = response.Items[0];
    const updated = {
        ...existing,
        ...updates,
    };

    const putCommand = new PutCommand({
        TableName: TABLE_NAME,
        Item: updated,
    });

    await docClient.send(putCommand);
    return updated;
}

module.exports = {
    createAttendance,
    getTodayAttendance,
    getAllTodayAttendance,
    closeAllActiveSessions,
    checkOut,
    getAttendanceHistory,
    getAttendanceByDate,
    updateAttendance,
};
