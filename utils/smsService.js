const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// Initialize SNS Client
const snsClient = new SNSClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

/**
 * Send OTP via SMS using AWS SNS
 * @param {string} phone - Mobile number with country code (e.g., +919876543210)
 * @param {string} otp - 6-digit OTP
 * @param {string} employeeName - Name of the employee (optional)
 */
async function sendOTPSMS({ phone, otp, employeeName = 'Employee' }) {
    try {
        // Format phone number - ensure it starts with +91 for India
        let formattedPhone = phone.replace(/[^0-9+]/g, '');
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = formattedPhone.startsWith('91')
                ? `+${formattedPhone}`
                : `+91${formattedPhone}`;
        }

        // Create SMS message
        const message = `Dear ${employeeName}, Your OTP for SRM Sweets employee verification is ${otp}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. Do not share this with anyone. - SRM Sweets`;

        // SMS attributes for better delivery
        const params = {
            Message: message,
            PhoneNumber: formattedPhone,
            MessageAttributes: {
                'AWS.SNS.SMS.SenderID': {
                    DataType: 'String',
                    StringValue: 'SRMSWT' // Your sender ID (6 chars max)
                },
                'AWS.SNS.SMS.SMSType': {
                    DataType: 'String',
                    StringValue: 'Transactional' // Transactional for OTP (higher priority)
                }
            }
        };

        // Send SMS via SNS
        const command = new PublishCommand(params);
        const response = await snsClient.send(command);

        console.log('AWS SNS SMS sent successfully:', response.MessageId);
        return {
            success: true,
            messageId: response.MessageId
        };
    } catch (error) {
        console.error('Error sending SMS via AWS SNS:', error);
        throw new Error(`Failed to send SMS: ${error.message}`);
    }
}

/**
 * Configure SNS SMS preferences (call this once during setup)
 * Sets default SMS type and spending limit
 */
async function configureSNSPreferences() {
    const { SNSClient, SetSMSAttributesCommand } = require('@aws-sdk/client-sns');

    try {
        const params = {
            attributes: {
                'DefaultSMSType': 'Transactional', // Transactional (higher priority) or Promotional
                'DefaultSenderID': 'SRMSWT', // Your sender ID
                'MonthlySpendLimit': '10' // Monthly spend limit in USD (adjust as needed)
            }
        };

        const command = new SetSMSAttributesCommand(params);
        await snsClient.send(command);

        console.log('SNS SMS preferences configured successfully');
        return { success: true };
    } catch (error) {
        console.error('Error configuring SNS preferences:', error);
        throw error;
    }
}

module.exports = {
    sendOTPSMS,
    configureSNSPreferences
};
