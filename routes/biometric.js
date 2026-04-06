const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');

/**
 * eSSL / ZKTeco ADMS Push Protocol Handshake
 * GET /iclock/cdata
 */
router.get('/cdata', (req, res) => {
    const { SN } = req.query;
    console.log(`[Biometric] Handshake from Device SN: ${SN}`);
    
    // Standard response for ADMS handshake
    res.send('OK');
});

/**
 * eSSL / ZKTeco ADMS Data Push (Logs)
 * POST /iclock/cdata
 */
router.post('/cdata', async (req, res) => {
    const { SN, table } = req.query;
    const rawData = req.body;

    if (table !== 'ATTLOG') {
        console.log(`[Biometric] Ignoring table: ${table} from SN: ${SN}`);
        return res.send('OK');
    }

    console.log(`[Biometric] Received logs from SN: ${SN}`);
    
    // The data is usually sent as plain text with newlines
    // Format: UserId Date Time VerifyMethod Status WorkCode
    // Example: 178 2026-04-06 17:15:00 1 0 0
    const records = rawData.toString().split('\n').filter(line => line.trim() !== '');

    for (const record of records) {
        const parts = record.split(/[\s\t]+/); // Split by space or tab
        if (parts.length < 3) continue;

        const biometricId = parts[0];
        const dateStr = parts[1];
        const timeStr = parts[2];
        const status = parts[4] || '0'; // 0: Check-In, 1: Check-Out (usually)

        console.log(`[Biometric] Processing Log: User=${biometricId}, Time=${dateStr} ${timeStr}, Status=${status}`);

        try {
            // 1. Find employee by biometricId
            const employee = await Employee.getEmployeeByBiometricId(biometricId);
            if (!employee) {
                console.warn(`[Biometric] No employee found with Biometric ID: ${biometricId}`);
                continue;
            }

            // 2. Map Status (0 is Check-In, 1 is Check-Out in standard eSSL)
            // If the device doesn't send status or we want to auto-toggle:
            const isCheckOut = status === '1';

            if (isCheckOut) {
                // Check if they have an open session
                const openSession = await Attendance.getOpenSession(employee.employeeId);
                if (openSession) {
                    await Attendance.checkOut(openSession.attendanceId);
                    console.log(`[Biometric] Checked OUT employee: ${employee.name}`);
                } else {
                    console.log(`[Biometric] Check-out received but no open session for: ${employee.name}. Creating new session.`);
                    await Attendance.createAttendance({
                        employeeId: employee.employeeId,
                        type: 'BIOMETRIC',
                        verificationMethod: 'biometric',
                        latitude: 0,
                        longitude: 0
                    });
                }
            } else {
                // Check if already checked in today
                const todayAttendance = await Attendance.getTodayAttendance(employee.employeeId);
                if (!todayAttendance || todayAttendance.checkOutTime) {
                    await Attendance.createAttendance({
                        employeeId: employee.employeeId,
                        type: 'BIOMETRIC',
                        verificationMethod: 'biometric',
                        latitude: 0,
                        longitude: 0 // Biometric device has fixed location
                    });
                    console.log(`[Biometric] Checked IN employee: ${employee.name}`);
                } else {
                    console.log(`[Biometric] Employee ${employee.name} already checked in. Ignoring duplicate.`);
                }
            }
        } catch (error) {
            console.error(`[Biometric] Error processing record: ${record}`, error);
        }
    }

    // Always return OK so the device clears its buffer
    res.send('OK');
});

/**
 * eSSL Options / GetConfig
 * GET /iclock/getrequest
 */
router.get('/getrequest', (req, res) => {
    res.send('OK');
});

module.exports = router;
