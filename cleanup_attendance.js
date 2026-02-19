require('dotenv').config();
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('./config/aws');

const ATTENDANCE_TABLE = process.env.DYNAMODB_ATTENDANCE_TABLE || 'srm-attendance-table';
const EMPLOYEE_ID = 'SRM001';

async function cleanupAttendance() {
    console.log(`Cleaning up duplicate sessions for ${EMPLOYEE_ID}...`);

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

        // Find all active records for today
        const activeRecords = records.filter(r => r.date === today && !r.checkOutTime);
        console.log(`Found ${activeRecords.length} active sessions.`);

        if (activeRecords.length <= 1) {
            console.log('No duplicates to clean up.');
            return;
        }

        // Sort by checkInTime (oldest first)
        activeRecords.sort((a, b) => new Date(a.checkInTime) - new Date(b.checkInTime));

        // Delete all except the latest one
        // (Assuming the latest one is the valid current session)
        const toDelete = activeRecords.slice(0, activeRecords.length - 1);

        for (const record of toDelete) {
            console.log(`Deleting stale session: ${record.attendanceId} (${record.checkInTime})`);
            await docClient.send(new DeleteCommand({
                TableName: ATTENDANCE_TABLE,
                Key: { attendanceId: record.attendanceId }
            }));
        }

        console.log('✅ Cleanup complete. Stale sessions removed.');
        console.log('The timer should now run at normal speed.');

    } catch (error) {
        console.error('Error cleaning up:', error);
    }
}

cleanupAttendance();
