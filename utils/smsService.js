const axios = require('axios');

/**
 * Send OTP via SMS using MSG91
 * @param {string} phone - Mobile number with country code (e.g., 919876543210)
 * @param {string} otp - 6-digit OTP
 * @param {string} employeeName - Name of the employee (optional)
 */
async function sendOTPSMS({ phone, otp, employeeName = 'Employee' }) {
    try {
        // Remove any spaces, dashes, or special characters from phone
        const cleanPhone = phone.replace(/[^0-9]/g, '');

        // Ensure phone starts with country code (91 for India)
        const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

        // MSG91 API endpoint for sending SMS
        const url = 'https://control.msg91.com/api/v5/flow/';

        const payload = {
            template_id: process.env.MSG91_TEMPLATE_ID || '', // You need to create template in MSG91
            short_url: '0',
            recipients: [
                {
                    mobiles: formattedPhone,
                    var1: otp, // OTP variable
                    var2: employeeName, // Employee name variable
                    var3: process.env.OTP_EXPIRY_MINUTES || '10' // Expiry time
                }
            ]
        };

        const response = await axios.post(url, payload, {
            headers: {
                'authkey': process.env.MSG91_AUTH_KEY,
                'content-type': 'application/json'
            }
        });

        console.log('SMS OTP sent successfully:', response.data);
        return { success: true, messageId: response.data.message_id };
    } catch (error) {
        console.error('Error sending SMS OTP:', error.response?.data || error.message);
        throw new Error('Failed to send SMS OTP');
    }
}

/**
 * Alternative: Send OTP using MSG91 SendOTP API (simpler, no template needed)
 * @param {string} phone - Mobile number
 * @param {string} otp - 6-digit OTP
 */
async function sendOTPSimple({ phone, otp }) {
    try {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

        const url = `https://control.msg91.com/api/v5/otp?template_id=${process.env.MSG91_TEMPLATE_ID || 'default'}&mobile=${formattedPhone}&authkey=${process.env.MSG91_AUTH_KEY}&otp=${otp}`;

        const response = await axios.get(url);

        console.log('SMS OTP sent successfully (simple):', response.data);
        return { success: true, messageId: response.data.request_id };
    } catch (error) {
        console.error('Error sending SMS OTP (simple):', error.response?.data || error.message);
        throw new Error('Failed to send SMS OTP');
    }
}

/**
 * Send OTP using MSG91's promotional SMS route (no template required)
 * This is useful for testing without setting up templates
 * @param {string} phone - Mobile number
 * @param {string} otp - 6-digit OTP
 * @param {string} employeeName - Name of the employee
 */
async function sendOTPDirect({ phone, otp, employeeName = 'Employee' }) {
    try {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

        const message = `Dear ${employeeName}, Your OTP for SRM Sweets employee verification is ${otp}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. Do not share this with anyone. - SRM Sweets`;

        const url = 'https://control.msg91.com/api/v5/flow/';

        // Using direct message sending
        const payload = {
            sender: process.env.MSG91_SENDER_ID || 'SRMSWT',
            route: '4', // Promotional route (4) - for testing
            country: '91',
            sms: [
                {
                    message: message,
                    to: [formattedPhone]
                }
            ]
        };

        const response = await axios.post(url, payload, {
            headers: {
                'authkey': process.env.MSG91_AUTH_KEY,
                'content-type': 'application/json'
            }
        });

        console.log('Direct SMS OTP sent successfully:', response.data);
        return { success: true, messageId: response.data.request_id };
    } catch (error) {
        console.error('Error sending direct SMS OTP:', error.response?.data || error.message);
        throw new Error('Failed to send SMS OTP');
    }
}

module.exports = {
    sendOTPSMS,
    sendOTPSimple,
    sendOTPDirect
};
