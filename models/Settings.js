const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');

const TABLE_NAME = process.env.DYNAMODB_SETTINGS_TABLE || 'srm-settings-table';
const GEOFENCE_SETTING_ID = 'geo-fence-config';

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

module.exports = {
    getGeofenceSettings,
    updateGeofenceSettings,
};
