const express = require('express');
const router = express.Router();
const { generateOTP, storeOTP, verifyOTP, isEmailVerified, getOTPInfo } = require('../utils/otpService');
const { sendOTPEmail } = require('../utils/emailService');

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/otp/send
 * Send OTP to email address
 */
router.post('/send', async (req, res) => {
    try {
        const { email, employeeName } = req.body;

        // Validate email
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email address is required',
            });
        }

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email address format',
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES || '10');

        // Store OTP
        storeOTP(email, otp, expiryMinutes);

        // Send email
        try {
            await sendOTPEmail({
                email,
                otp,
                employeeName: employeeName || 'Employee',
            });

            res.json({
                success: true,
                message: `OTP sent successfully to ${email}`,
                expiresIn: `${expiryMinutes} minutes`,
            });
        } catch (emailError) {
            console.error('Error sending OTP email:', emailError);
            res.status(500).json({
                success: false,
                message: 'Failed to send OTP email. Please check the email address and try again.',
                error: process.env.NODE_ENV === 'development' ? emailError.message : undefined,
            });
        }
    } catch (error) {
        console.error('Error in send OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending OTP',
        });
    }
});

/**
 * POST /api/otp/verify
 * Verify OTP for email address
 */
router.post('/verify', async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Validate input
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required',
            });
        }

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email address format',
            });
        }

        // Verify OTP
        const result = verifyOTP(email, otp.toString());

        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                verified: true,
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message,
                verified: false,
            });
        }
    } catch (error) {
        console.error('Error in verify OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP',
        });
    }
});

/**
 * GET /api/otp/status/:email
 * Check OTP status for an email (for debugging)
 */
router.get('/status/:email', async (req, res) => {
    try {
        const { email } = req.params;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email address format',
            });
        }

        const otpInfo = getOTPInfo(email);
        const verified = isEmailVerified(email);

        res.json({
            success: true,
            email,
            verified,
            otpInfo,
        });
    } catch (error) {
        console.error('Error checking OTP status:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking OTP status',
        });
    }
});

module.exports = router;
