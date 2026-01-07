// test_fail.js
require('dotenv').config();
const { getRequestsByEmployee } = require('./models/Request');

async function testSafe() {
    try {
        console.log('Testing getRequestsByEmployee...');
        const res = await getRequestsByEmployee('TEST_EMP');
        console.log('Success:', res);
    } catch (e) {
        console.error('CRASH:', e);
    }
}
testSafe();
