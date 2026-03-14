require('dotenv').config();
const { sendOTPEmail } = require('./utils/emailService');

async function testOTP() {
    console.log('🧪 Testing OTP Email Delivery...');
    console.log('📧 Target Email:', process.env.EMAIL_USER); // Sending to itself for test
    
    try {
        const result = await sendOTPEmail({
            email: 'bharathkumar21cse@gmail.com', // Recipient from user screenshot
            otp: '123456',
            employeeName: 'Test Employee'
        });
        console.log('✅ Success! Result:', result);
    } catch (error) {
        console.error('❌ Failed! Error:', error);
    }
}

testOTP();
