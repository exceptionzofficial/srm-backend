/**
 * Quick test script for AWS SNS SMS
 * Run: node test_sms.js
 */

require('dotenv').config();
const { sendOTPSMS } = require('./utils/smsService');

async function testSMS() {
    console.log('🧪 Testing AWS SNS SMS...\n');

    // Test phone number (replace with your own)
    const testPhone = '9876543210'; // Replace with your number
    const testOTP = '123456';
    const testName = 'Test User';

    try {
        console.log(`📱 Sending OTP to: ${testPhone}`);
        console.log(`🔢 OTP: ${testOTP}\n`);

        const result = await sendOTPSMS({
            phone: testPhone,
            otp: testOTP,
            employeeName: testName
        });

        console.log('✅ Success!');
        console.log('Message ID:', result.messageId);
        console.log('\n📲 Check your phone for the SMS!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('\nTroubleshooting:');
        console.error('1. Check AWS credentials in .env');
        console.error('2. Verify SNS permissions in IAM');
        console.error('3. Confirm phone number format (+91...)');
    }
}

testSMS();
