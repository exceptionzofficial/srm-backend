const { GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');

const TABLE_NAME = process.env.DYNAMODB_OTP_TABLE || 'srm-otp-table';

/**
 * Store OTP
 * @param {Object} otpData
 * @param {string} otpData.identifier - Email or Phone
 * @param {string} otpData.otp - The OTP code
 * @param {number} otpData.expiresAt - Timestamp
 * @param {Array} otpData.sendAttempts - Array of timestamps
 */
async function storeOTP(otpData) {
    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            identifier: otpData.identifier, // Partition Key
            otp: otpData.otp,
            expiresAt: otpData.expiresAt,
            sendAttempts: otpData.sendAttempts || [],
            attempts: 0,
            verified: false,
            // TTL for DynamoDB to auto-delete after 24 hours (or whenever)
            // But we handle logic manually for now.
            createdAt: Date.now()
        }
    });

    try {
        await docClient.send(command);
        return { success: true };
    } catch (error) {
        console.error('DynamoDB Error storeOTP:', error);
        return { success: false, error };
    }
}

/**
 * Get OTP Data
 * @param {string} identifier 
 */
async function getOTP(identifier) {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { identifier }
    });

    try {
        const response = await docClient.send(command);
        return response.Item;
    } catch (error) {
        console.error('DynamoDB Error getOTP:', error);
        return null;
    }
}

/**
 * Update OTP Status (e.g. increment attempts or mark verified)
 * @param {string} identifier 
 * @param {Object} updates 
 */
async function updateOTP(identifier, updates) {
    // For simplicity, we can just re-put the item since we usually have the full object
    // But update is better for concurrency.
    // However, storeOTP covers the 'create/overwrite' case.
    // Let's implement a simple overwrite for now using storeOTP logic for updates too,
    // or just use storeOTP if we have the full object.

    // Actually, let's just use PutCommand for everything to keep it simple 
    // since we don't have partial updates effectively without more code.
    // But wait, if we want to update just 'verified', we should use UpdateCommand or Put with full item.
    // Let's stick to get -> modify -> put pattern for simplicity in this migration, 
    // unless race conditions are high (unlikely for OTP).

    // Or better, let's just export saveOTP which does a Put.
    // But wait, `storeOTP` above works for creating/overwriting.
    // I'll add a specific method to mark verified.
}

/**
 * Delete OTP
 * @param {string} identifier 
 */
async function deleteOTP(identifier) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { identifier }
    });

    try {
        await docClient.send(command);
        return { success: true };
    } catch (error) {
        console.error('DynamoDB Error deleteOTP:', error);
        return { success: false, error };
    }
}

module.exports = {
    storeOTP,
    getOTP,
    deleteOTP,
    TABLE_NAME
};
