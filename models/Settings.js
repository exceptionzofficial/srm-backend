const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');

const TABLE_NAME = process.env.DYNAMODB_SETTINGS_TABLE || 'srm-settings-table';
const GEOFENCE_SETTING_ID = 'geo-fence-config';
const ATTENDANCE_SETTING_ID = 'attendance-config';

/**
 * Get geo-fence settings
 */
async function getGeofenceSettings() {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { settingId: GEOFENCE_SETTING_ID },
    });

    const response = await docClient.send(command);

    // Return default if not found
    if (!response.Item) {
        return {
            settingId: GEOFENCE_SETTING_ID,
            officeLat: 0,
            officeLng: 0,
            radiusMeters: 100,
            officeAddress: 'Not configured',
            isConfigured: false,
        };
    }

    return { ...response.Item, isConfigured: true };
}

/**
 * Update geo-fence settings
 */
async function updateGeofenceSettings(settings) {
    const timestamp = new Date().toISOString();

    const item = {
        settingId: GEOFENCE_SETTING_ID,
        officeLat: settings.officeLat,
        officeLng: settings.officeLng,
        radiusMeters: settings.radiusMeters,
        officeAddress: settings.officeAddress || '',
        updatedBy: settings.updatedBy || 'admin',
        updatedAt: timestamp,
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
    });

    await docClient.send(command);
    return { ...item, isConfigured: true };
}

/**
 * Get attendance settings (late threshold, half-day threshold)
 */
async function getAttendanceSettings() {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { settingId: ATTENDANCE_SETTING_ID },
    });

    const response = await docClient.send(command);

    // Return defaults if not found
    // lateThresholdMinutes: Minutes from midnight when late status applies (default 9:15 AM = 555)
    // halfDayThresholdMinutes: Minutes from midnight when half-day applies (default 12:00 PM = 720)
    if (!response.Item) {
        return {
            settingId: ATTENDANCE_SETTING_ID,
            lateThresholdMinutes: 555,  // 9:15 AM
            halfDayThresholdMinutes: 720, // 12:00 PM
            workStartTime: '09:00',
            workEndTime: '18:00',
            isConfigured: false,
        };
    }

    return { ...response.Item, isConfigured: true };
}

/**
 * Update attendance settings
 */
async function updateAttendanceSettings(settings) {
    const timestamp = new Date().toISOString();

    const item = {
        settingId: ATTENDANCE_SETTING_ID,
        lateThresholdMinutes: settings.lateThresholdMinutes || 555,
        halfDayThresholdMinutes: settings.halfDayThresholdMinutes || 720,
        workStartTime: settings.workStartTime || '09:00',
        workEndTime: settings.workEndTime || '18:00',
        updatedBy: settings.updatedBy || 'admin',
        updatedAt: timestamp,
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
    });

    await docClient.send(command);
    return { ...item, isConfigured: true };
}

module.exports = {
    getGeofenceSettings,
    updateGeofenceSettings,
    getAttendanceSettings,
    updateAttendanceSettings,
    getEmployeeRules,
    updateEmployeeRules,
};

const RULES_SETTING_ID = 'employee-rules-config';

/**
 * Get employee rules
 */
async function getEmployeeRules() {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { settingId: RULES_SETTING_ID },
    });

    const response = await docClient.send(command);

    if (!response.Item) {
        return {
            settingId: RULES_SETTING_ID,
            rules: "1. Office timing is 9:00 AM to 6:00 PM.\n2. Please wear formal attire.\n3. Mark attendance daily.",
            updatedAt: new Date().toISOString(),
        };
    }
    return response.Item;
}

/**
 * Update employee rules
 */
async function updateEmployeeRules(rulesText, updatedBy) {
    const timestamp = new Date().toISOString();
    const item = {
        settingId: RULES_SETTING_ID,
        rules: rulesText,
        updatedBy: updatedBy || 'admin',
        updatedAt: timestamp,
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
    });

    await docClient.send(command);
    return item;
}

