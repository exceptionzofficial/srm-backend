/**
 * Test script for OTP Email Verification
 * 
 * This script helps test the OTP email verification system
 * Run: node test_otp_flow.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';
const TEST_EMAIL = 'settlotech@gmail.com'; // Change this to your test email

async function testOTPFlow() {
    console.log('🧪 Testing OTP Email Verification Flow\n');
    console.log('='.repeat(50));

    try {
        // Step 1: Send OTP
        console.log('\n📧 Step 1: Sending OTP to email...');
        const sendResponse = await axios.post(`${API_BASE}/otp/send`, {
            email: TEST_EMAIL,
            employeeName: 'Test Employee',
        });
        console.log('✅ OTP Sent:', sendResponse.data);
        console.log(`   Check your email: ${TEST_EMAIL}`);

        // Step 2: Get OTP from user
        console.log('\n⏳ Step 2: Waiting for OTP input...');
        console.log('   Please check your email and enter the OTP below');

        // Using readline for user input
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const otp = await new Promise((resolve) => {
            readline.question('   Enter OTP: ', (answer) => {
                readline.close();
                resolve(answer);
            });
        });

        // Step 3: Verify OTP
        console.log('\n🔐 Step 3: Verifying OTP...');
        const verifyResponse = await axios.post(`${API_BASE}/otp/verify`, {
            email: TEST_EMAIL,
            otp: otp.trim(),
        });
        console.log('✅ OTP Verified:', verifyResponse.data);

        // Step 4: Check verification status
        console.log('\n📊 Step 4: Checking verification status...');
        const statusResponse = await axios.get(`${API_BASE}/otp/status/${TEST_EMAIL}`);
        console.log('✅ Status:', statusResponse.data);

        console.log('\n' + '='.repeat(50));
        console.log('✅ All tests passed! Email verification is working correctly.');
        console.log('\n💡 Next step: Try creating an employee with this verified email');
        console.log('   The verification will be cleared after employee creation.');

    } catch (error) {
        console.error('\n❌ Test failed:', error.response?.data || error.message);
        console.log('\n💡 Possible issues:');
        console.log('   1. Backend server not running (run: npm start)');
        console.log('   2. Email configuration not set in .env');
        console.log('   3. Invalid Gmail App Password');
        console.log('   4. Incorrect OTP entered');
    }
}

// Run the test
testOTPFlow();
