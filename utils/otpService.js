const crypto = require('crypto');
const OTPModel = require('../models/OTP'); // Import DynamoDB Model

/**
 * Generate a random 6-digit OTP
 * @returns {string} 6-digit OTP
 */
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

/**
 * Store OTP for an email/phone with rate limiting
 * @param {string} identifier - Email or phone number
 * @param {string} otp - Generated OTP
 * @param {number} expiryMinutes - OTP expiry time in minutes
 * @returns {Object} Status object with success/error
 */
async function storeOTP(identifier, otp, expiryMinutes = 10) {
    const normalizedId = identifier.toLowerCase();
    const now = Date.now();

    // Fetch existing OTP data to check rate limits
    const existingData = await OTPModel.getOTP(normalizedId);

    // Check if rate limited (max 2 sends per hour)
    if (existingData && existingData.sendAttempts) {
        const hourAgo = now - 60 * 60 * 1000; // 1 hour ago

        // Filter send attempts within last hour
        const recentSends = existingData.sendAttempts.filter(time => time > hourAgo);

        // If already sent 2 times in last hour, block
        if (recentSends.length >= 2) {
            const oldestSend = Math.min(...recentSends);
            const cooldownEndsAt = oldestSend + 60 * 60 * 1000; // 1 hour from oldest send
            const remainingMinutes = Math.ceil((cooldownEndsAt - now) / (60 * 1000));

            return {
                success: false,
                rateLimited: true,
                message: `Too many OTP requests. Please try again after ${remainingMinutes} minute(s).`,
                retryAfter: cooldownEndsAt
            };
        }
    }

    const expiresAt = now + expiryMinutes * 60 * 1000;

    // Calculate new send attempts history
    const previousAttempts = existingData?.sendAttempts || [];
    const recentAttempts = previousAttempts.filter(time => time > now - 60 * 60 * 1000);
    const newSendAttempts = [...recentAttempts, now];

    // Store in DynamoDB
    const otpData = {
        identifier: normalizedId,
        otp,
        expiresAt,
        sendAttempts: newSendAttempts,
        attempts: 0,
        verified: false
    };

    const result = await OTPModel.storeOTP(otpData);

    if (!result.success) {
        return { success: false, message: 'Database error storing OTP' };
    }

    const sendCount = newSendAttempts.length;
    console.log(`Stored OTP for ${identifier} (send ${sendCount}/2), expires at: ${new Date(expiresAt).toISOString()}`);

    return {
        success: true,
        sendCount,
        remainingSends: 2 - sendCount
    };
}

/**
 * Verify OTP for an email/phone
 * @param {string} identifier - Email or phone
 * @param {string} otp - OTP to verify
 * @returns {Object} Verification result
 */
async function verifyOTP(identifier, otp) {
    const normalizedId = identifier.toLowerCase();
    const otpData = await OTPModel.getOTP(normalizedId);

    if (!otpData) {
        return {
            success: false,
            message: 'No OTP found. Please request a new OTP.',
        };
    }

    // Check expiry
    if (Date.now() > otpData.expiresAt) {
        // await OTPModel.deleteOTP(normalizedId); // Optional: clear expired
        return {
            success: false,
            message: 'OTP has expired. Please request a new OTP.',
        };
    }

    // Check attempts (limit to 5 attempts)
    if ((otpData.attempts || 0) >= 5) {
        // await OTPModel.deleteOTP(normalizedId);
        return {
            success: false,
            message: 'Too many failed attempts. Please request a new OTP.',
        };
    }

    // Verify OTP
    // Ensure both are strings for comparison
    if (String(otpData.otp).trim() !== String(otp).trim()) {
        // Increment attempts
        otpData.attempts = (otpData.attempts || 0) + 1;
        await OTPModel.storeOTP(otpData); // Update stats

        return {
            success: false,
            message: `Invalid OTP. ${5 - otpData.attempts} attempts remaining.`,
        };
    }

    // Mark as verified
    otpData.verified = true;
    await OTPModel.storeOTP(otpData);

    console.log(`OTP verified successfully for ${identifier}`);

    return {
        success: true,
        message: 'Verified successfully.',
    };
}

/**
 * Check if an email/phone is verified
 * @param {string} identifier 
 * @returns {boolean} True if verified
 */
async function isEmailVerified(identifier) {
    const normalizedId = identifier.toLowerCase();
    const otpData = await OTPModel.getOTP(normalizedId);

    if (!otpData) {
        console.log(`isEmailVerified: No OTP data found for ${normalizedId}`);
        return false;
    }

    if (otpData.verified !== true) {
        console.log(`isEmailVerified: OTP found but not verified for ${normalizedId}. Verified status: ${otpData.verified}`);
    }

    return otpData.verified === true;
}

/**
 * Clear verification (after employee is created)
 * @param {string} identifier 
 */
async function clearVerification(identifier) {
    const normalizedId = identifier.toLowerCase();
    await OTPModel.deleteOTP(normalizedId);
    console.log(`Cleared verification for ${identifier}`);
}

/**
 * Get OTP info for debugging
 * @param {string} identifier 
 */
async function getOTPInfo(identifier) {
    const normalizedId = identifier.toLowerCase();
    const otpData = await OTPModel.getOTP(normalizedId);

    if (!otpData) {
        return null;
    }

    return {
        exists: true,
        expiresAt: new Date(otpData.expiresAt).toISOString(),
        attempts: otpData.attempts,
        verified: otpData.verified,
        isExpired: Date.now() > otpData.expiresAt,
    };
}

module.exports = {
    generateOTP,
    storeOTP,
    verifyOTP,
    isEmailVerified,
    clearVerification,
    getOTPInfo,
};
