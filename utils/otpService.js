const crypto = require('crypto');

// In-memory storage for OTPs (for production, use Redis or DynamoDB)
const otpStore = new Map();

// Cleanup interval (run every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of otpStore.entries()) {
        if (data.expiresAt < now) {
            otpStore.delete(key);
            console.log(`Cleaned up expired OTP for: ${key}`);
        }
    }
}, 5 * 60 * 1000);

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
function storeOTP(identifier, otp, expiryMinutes = 10) {
    const normalizedId = identifier.toLowerCase();
    const now = Date.now();
    const existingData = otpStore.get(normalizedId);

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

    // Store OTP with send attempt tracking
    otpStore.set(normalizedId, {
        otp,
        expiresAt,
        attempts: 0,
        verified: false,
        sendAttempts: existingData?.sendAttempts
            ? [...existingData.sendAttempts.filter(time => time > now - 60 * 60 * 1000), now]
            : [now]
    });

    const sendCount = otpStore.get(normalizedId).sendAttempts.length;
    console.log(`Stored OTP for ${identifier} (send ${sendCount}/2), expires at: ${new Date(expiresAt).toISOString()}`);

    return {
        success: true,
        sendCount,
        remainingSends: 2 - sendCount
    };
}

/**
 * Verify OTP for an email
 * @param {string} email - Email address
 * @param {string} otp - OTP to verify
 * @returns {Object} Verification result
 */
function verifyOTP(email, otp) {
    const normalizedEmail = email.toLowerCase();
    const otpData = otpStore.get(normalizedEmail);

    if (!otpData) {
        return {
            success: false,
            message: 'No OTP found for this email. Please request a new OTP.',
        };
    }

    // Check expiry
    if (Date.now() > otpData.expiresAt) {
        otpStore.delete(normalizedEmail);
        return {
            success: false,
            message: 'OTP has expired. Please request a new OTP.',
        };
    }

    // Check attempts (limit to 5 attempts)
    if (otpData.attempts >= 5) {
        otpStore.delete(normalizedEmail);
        return {
            success: false,
            message: 'Too many failed attempts. Please request a new OTP.',
        };
    }

    // Verify OTP
    if (otpData.otp !== otp) {
        otpData.attempts++;
        return {
            success: false,
            message: `Invalid OTP. ${5 - otpData.attempts} attempts remaining.`,
        };
    }

    // Mark as verified
    otpData.verified = true;
    console.log(`OTP verified successfully for ${email}`);

    return {
        success: true,
        message: 'Email verified successfully.',
    };
}

/**
 * Check if an email is verified
 * @param {string} email - Email address
 * @returns {boolean} True if verified
 */
function isEmailVerified(email) {
    const normalizedEmail = email.toLowerCase();
    const otpData = otpStore.get(normalizedEmail);

    if (!otpData) {
        return false;
    }

    // Check if verified and not expired
    return otpData.verified && Date.now() <= otpData.expiresAt;
}

/**
 * Clear verification for an email (after employee is created)
 * @param {string} email - Email address
 */
function clearVerification(email) {
    const normalizedEmail = email.toLowerCase();
    otpStore.delete(normalizedEmail);
    console.log(`Cleared verification for ${email}`);
}

/**
 * Get OTP info for debugging (do not use in production for security)
 * @param {string} email - Email address
 * @returns {Object} OTP info (without the actual OTP)
 */
function getOTPInfo(email) {
    const normalizedEmail = email.toLowerCase();
    const otpData = otpStore.get(normalizedEmail);

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
