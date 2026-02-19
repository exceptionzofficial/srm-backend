require('dotenv').config();
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('./config/aws');

const ATTENDANCE_TABLE = process.env.DYNAMODB_ATTENDANCE_TABLE || 'srm-attendance-table';
const EMPLOYEE_ID = 'SRM001'; // Assuming this is the user's ID from previous logs

async function checkAttendance() {
    console.log(`Checking attendance records for ${EMPLOYEE_ID} for today...`);

    // Get today's date YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    try {
        const command = new ScanCommand({
            TableName: ATTENDANCE_TABLE,
            FilterExpression: 'employeeId = :eid',
            ExpressionAttributeValues: {
                ':eid': EMPLOYEE_ID
            }
        });

        const response = await docClient.send(command);
        const records = response.Items || [];

        const todayRecords = records.filter(r => r.date === today);

        console.log(`\nFound ${todayRecords.length} records for today (${today}):`);

        let activeCount = 0;
        todayRecords.forEach((r, index) => {
            const isActive = !r.checkOutTime;
            if (isActive) activeCount++;
            console.log(`\nRecord #${index + 1}:`);
            console.log(`  ID: ${r.attendanceId}`);
            console.log(`  Check In: ${r.checkInTime}`);
            console.log(`  Check Out: ${r.checkOutTime || '(ACTIVE)'}`);
            console.log(`  Status: ${isActive ? 'OPEN SESSION' : 'Closed'}`);
        });

        if (activeCount > 1) {
            console.log(`\n⚠️ ISSUE DETECTED: ${activeCount} active sessions found!`);
            console.log('This explains the "double speed" timer. The app is summing up multiple open sessions.');
        } else {
            console.log('\n✅ No obvious duplicate active sessions found.');
        }

    } catch (error) {
        console.error('Error scanning attendance:', error);
    }
}

checkAttendance();
