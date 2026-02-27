
const axios = require('axios');

async function testCalculation() {
    const employeeId = 'SRM001'; // Use a known employee ID for testing
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    console.log(`Testing salary calculation for ${employeeId}`);

    try {
        // 1. Check current month (should be 0 or previous advance EMI, but NOT a new one from this month)
        const res1 = await axios.get(`http://localhost:3001/api/salary/calculate/${employeeId}?month=${currentMonth}&year=${currentYear}`);
        console.log(`Current Month (${currentMonth}/${currentYear}) Deduction:`, res1.data.deductions.advance);

        // 2. Check next month (should show EMI if an advance was taken this month)
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
        const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
        const res2 = await axios.get(`http://localhost:3001/api/salary/calculate/${employeeId}?month=${nextMonth}&year=${nextYear}`);
        console.log(`Next Month (${nextMonth}/${nextYear}) Deduction:`, res2.data.deductions.advance);

    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

// Note: This requires the backend to be running locally.
// testCalculation();
