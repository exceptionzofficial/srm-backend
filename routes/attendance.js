const express = require('express');
const router = express.Router();
const multer = require('multer');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const Request = require('../models/Request');
const { searchFace } = require('../utils/rekognition');
const { getGeofenceSettings } = require('../models/Settings');
const { isWithinGeofence } = require('../utils/geofence');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Mark attendance (check-in) with face verification
 * POST /api/attendance/check-in
 */
router.post('/check-in', upload.single('image'), async (req, res) => {
    try {
        const { latitude, longitude, imageBase64, type = 'OFFICE' } = req.body; // type: OFFICE | TRAVEL

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Location is required',
            });
        }

        // Get employee ID first (needed for permission check)
        // We need to parse the image to search face FIRST to know who it is
        let imageBuffer;
        if (req.file) {
            imageBuffer = req.file.buffer;
        } else if (imageBase64) {
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            return res.status(400).json({
                success: false,
                message: 'Image is required',
            });
        }

        // Verify face
        const faceResult = await searchFace(imageBuffer);
        if (!faceResult.success) {
            return res.status(404).json({
                success: false,
                message: 'Face not recognized. Please register first.',
            });
        }
        const employeeId = faceResult.employeeId;
        console.log(`[Check-in] Face recognized for employeeId: "${employeeId}"`);

        // Validate that recognized face matches expected employee (if provided)
        const expectedEmployeeId = req.body.expectedEmployeeId;
        if (expectedEmployeeId && employeeId !== expectedEmployeeId) {
            console.log(`[Check-in] Face mismatch! Expected: "${expectedEmployeeId}", Got: "${employeeId}"`);
            return res.status(403).json({
                success: false,
                message: `Face verification failed. The face recognized belongs to ${employeeId}, but you are logged in as ${expectedEmployeeId}. Please use your own face.`,
            });
        }

        const employee = await Employee.getEmployeeById(employeeId);
        console.log(`[Check-in] Employee lookup result:`, employee ? `Found: ${employee.name}` : 'NOT FOUND');

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: `Employee record not found for ID: ${employeeId}. Please contact admin.`,
            });
        }

        // PERMISSION CHECK FOR TRAVEL MODE
        if (type === 'TRAVEL') {
            const allowedModes = ['FIELD_SALES', 'REMOTE'];
            const employeeMode = employee.workMode || 'OFFICE';
            if (!allowedModes.includes(employeeMode)) {
                return res.status(403).json({
                    success: false,
                    message: 'Restricted: You are not authorized for "On Duty" check-in.',
                });
            }
            // If authorized, we SKIP geofence check
        } else {
            // OFFICE MODE - Enforce Geofence
            const geofence = await getGeofenceSettings();
            if (geofence.isConfigured) {
                const locationCheck = isWithinGeofence(
                    parseFloat(latitude),
                    parseFloat(longitude),
                    geofence.officeLat,
                    geofence.officeLng,
                    geofence.radiusMeters
                );

                if (!locationCheck.isWithin) {
                    return res.status(403).json({
                        success: false,
                        message: `You are too far from the office! Distance: ${locationCheck.distance}m`,
                        withinRange: false,
                    });
                }
            }
        }



        // Face verification handled above

        // Check if currently tracking (already checked in but not checked out)
        // Employee fetched above for permission check

        if (employee.isTracking) {
            return res.status(400).json({
                success: false,
                message: 'Already checked in. Please check out first.',
            });
        }

        // Validate Branch
        const requestBranchId = req.body.branchId;
        if (requestBranchId && employee.branchId && employee.branchId !== requestBranchId) {
            return res.status(403).json({
                success: false,
                message: `You belong to a different branch. Please select the correct branch.`,
            });
        }

        // Create attendance record
        const attendance = await Attendance.createAttendance({
            employeeId,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            type, // Store OFFICE or TRAVEL
        });

        // Start GPS tracking for this employee
        await Employee.updateEmployee(employeeId, {
            isTracking: true,
            lastLatitude: parseFloat(latitude),
            lastLongitude: parseFloat(longitude),
            lastPingTime: new Date().toISOString(),
            trackingStartTime: new Date().toISOString(),
            isInsideGeofence: true, // Employee is inside geofence (passed check)
            outsideGeofenceCount: 0, // Reset counter on fresh check-in
        });

        res.json({
            success: true,
            message: `Good morning, ${employee.name}! Check-in successful.`,
            attendance,
            employee: {
                employeeId: employee.employeeId,
                name: employee.name,
                department: employee.department,
            },
            tracking: true, // Signal to mobile app to start background tracking
        });
    } catch (error) {
        console.error('Error checking in:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error marking attendance',
        });
    }
});

/**
 * Check-out
 * POST /api/attendance/check-out
 */
router.post('/check-out', upload.single('image'), async (req, res) => {
    try {
        const { imageBase64 } = req.body;

        // Get image buffer
        let imageBuffer;
        if (req.file) {
            imageBuffer = req.file.buffer;
        } else if (imageBase64) {
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            return res.status(400).json({
                success: false,
                message: 'Image is required',
            });
        }

        // Verify face
        const faceResult = await searchFace(imageBuffer);
        if (!faceResult.success) {
            return res.status(404).json({
                success: false,
                message: 'Face not recognized',
            });
        }

        const employeeId = faceResult.employeeId;

        // Validate that recognized face matches expected employee (if provided)
        const expectedEmployeeId = req.body.expectedEmployeeId;
        if (expectedEmployeeId && employeeId !== expectedEmployeeId) {
            console.log(`[Check-out] Face mismatch! Expected: "${expectedEmployeeId}", Got: "${employeeId}"`);
            return res.status(403).json({
                success: false,
                message: `Face verification failed. The face recognized belongs to ${employeeId}, but you are logged in as ${expectedEmployeeId}. Please use your own face.`,
            });
        }

        // Get any open session (not just today)
        const attendance = await Attendance.getOpenSession(employeeId);
        if (!attendance) {
            console.log(`[Checkout Error] No open session found for ${employeeId}`);
            return res.status(400).json({
                success: false,
                message: `No active check-in session found for employee: ${employeeId}`,
            });
        }

        if (attendance.checkOutTime) {
            return res.status(400).json({
                success: false,
                message: 'Already checked out today',
            });
        }

        // Update with checkout
        const updated = await Attendance.checkOut(attendance.attendanceId);
        const employee = await Employee.getEmployeeById(employeeId);

        // Stop GPS tracking for this employee
        await Employee.updateEmployee(employeeId, {
            isTracking: false,
            trackingEndTime: new Date().toISOString(),
        });

        res.json({
            success: true,
            message: `Goodbye, ${employee.name}! Check-out successful.`,
            attendance: updated,
            tracking: false, // Signal to mobile app to stop background tracking
        });
    } catch (error) {
        console.error('Error checking out:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error checking out',
        });
    }
});

/**
 * Get attendance history for employee
 * GET /api/attendance/:employeeId
 */
router.get('/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { limit } = req.query;

        const history = await Attendance.getAttendanceHistory(
            employeeId,
            limit ? parseInt(limit) : 30
        );

        res.json({
            success: true,
            history,
        });
    } catch (error) {
        console.error('Error fetching attendance history:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching attendance history',
        });
    }
});

/**
 * Get all attendance for a date (admin)
 * GET /api/attendance/date/:date
 */
router.get('/date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const records = await Attendance.getAttendanceByDate(date);

        res.json({
            success: true,
            date,
            records,
        });
    } catch (error) {
        console.error('Error fetching attendance by date:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching attendance records',
        });
    }
});

/**
 * Update attendance record (admin)
 * PUT /api/attendance/:attendanceId
 */
router.put('/:attendanceId', async (req, res) => {
    try {
        const { attendanceId } = req.params;
        const { checkInTime, checkOutTime, status } = req.body;

        const updates = {};
        if (checkInTime) updates.checkInTime = checkInTime;
        if (checkOutTime) updates.checkOutTime = checkOutTime;
        if (status) updates.status = status;

        const attendance = await Attendance.updateAttendance(attendanceId, updates);

        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: 'Attendance record not found',
            });
        }

        res.json({
            success: true,
            message: 'Attendance updated successfully',
            attendance,
        });
    } catch (error) {
        console.error('Error updating attendance:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating attendance record',
        });
    }
});

/**
 * Reset tracking status (for fixing stuck state)
 * POST /api/attendance/reset-tracking/:employeeId
 */
router.post('/reset-tracking/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;

        // Reset tracking to false
        await Employee.updateEmployee(employeeId, {
            isTracking: false,
            trackingEndTime: new Date().toISOString(),
        });

        res.json({
            success: true,
            message: 'Tracking status reset. You can now check in again.',
        });
    } catch (error) {
        console.error('Error resetting tracking:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting tracking status',
        });
    }
});

/**
 * Get current attendance status for an employee
 * GET /api/attendance/status/:employeeId
 */
router.get('/status/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;

        let employee = await Employee.getEmployeeById(employeeId);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        const todayAttendance = await Attendance.getTodayAttendance(employeeId);
        const allTodaySessions = await Attendance.getAllTodayAttendance(employeeId); // NEW: Get all sessions
        const openSession = await Attendance.getOpenSession(employeeId); // Any open session regardless of date
        const now = new Date();
        let isTracking = employee.isTracking || false;
        let autoCheckedOut = false;

        // CHECK FOR INACTIVITY (Auto-Checkout Logic)
        if (isTracking && employee.lastPingTime) {
            const lastPing = new Date(employee.lastPingTime);
            const diffMinutes = (now - lastPing) / (1000 * 60);

            if (diffMinutes > 10) {
                console.log(`[Auto-Checkout] User ${employee.name} inactive for ${Math.round(diffMinutes)} mins. stopping tracking.`);

                // Auto-stop tracking
                await Employee.updateEmployee(employeeId, {
                    isTracking: false,
                    lastPingTime: employee.lastPingTime // Keep original ping time for resume logic
                });

                employee = await Employee.getEmployeeById(employeeId); // Refresh
                isTracking = false;
                autoCheckedOut = true;
            }
        }

        // Check if eligible for Resume
        // Condition: Not tracking, Has open attendance today, Last ping was within 20 mins (or just allows resume if open?)
        // User requested: "rejoin option withi 10 minutes"
        let canResume = false;
        if (!isTracking && todayAttendance && !todayAttendance.checkOutTime) {
            if (employee.lastPingTime) {
                const lastPing = new Date(employee.lastPingTime);
                const diffMinutes = (now - lastPing) / (1000 * 60);
                // Allow resume if inactive for less than 30 mins (10 min auto-checkout + 20 min grace)
                if (diffMinutes < 30) {
                    canResume = true;
                }
            } else {
                // Fallback if no ping time but open session?
                canResume = true;
            }
        }

        // --- DURATION CALCULATION (Attendance + Permissions) ---
        const todayDateStr = now.toISOString().split('T')[0];

        // 1. Calculate Attendance Duration (from all sessions today)
        let attendanceDurationMinutes = 0;
        allTodaySessions.forEach(session => {
            if (session.checkInTime) {
                const start = new Date(session.checkInTime);
                const end = session.checkOutTime ? new Date(session.checkOutTime) : new Date();
                const durationMs = end - start;
                attendanceDurationMinutes += durationMs / (1000 * 60);
            }
        });

        // 2. Fetch Approved Permissions for Today
        let permissionDurationMinutes = 0;
        try {
            const permissions = await Request.getApprovedPermissions(employeeId, todayDateStr);
            permissions.forEach(perm => {
                // Assuming perm.data.duration is in MINUTES as per plan/requirement? 
                // Plan said: "duration (e.g., 2 hours, 30 mins)" -> We should standardize to minutes in Frontend.
                // Creating helper to parse if it's string, or expect number.
                // Let's assume it's stored as Number (minutes) or String.
                let duration = 0;
                if (perm.data && perm.data.duration) {
                    // Try to parse if string "2 hours" etc? Or rely on frontend sending minutes?
                    // Let's rely on frontend sending `durationMinutes` or `duration` (number).
                    // If it's a string like "2 hours", we might fail here.
                    // IMPORTANT: I will enforce frontend to send `duration` as Number of minutes or I'll try to parse simple numbers.
                    duration = parseFloat(perm.data.duration) || 0;
                }
                permissionDurationMinutes += duration;
            });
        } catch (e) {
            console.error('Error fetching permissions for duration:', e);
        }

        const totalWorkDurationMinutes = attendanceDurationMinutes + permissionDurationMinutes;

        res.json({
            success: true,
            employee: {
                employeeId: employee.employeeId,
                name: employee.name,
                department: employee.department,
                designation: employee.designation,
                branchId: employee.branchId,
                faceId: employee.faceId,
                isTracking: isTracking,
                // Documents
                panNumber: employee.panNumber,
                aadharNumber: employee.aadharNumber,
                photoUrl: employee.photoUrl,
                // Statutory
                uan: employee.uan,
                esicIP: employee.esicIP,
                // Bank
                bankAccount: employee.bankAccount,
                ifscCode: employee.ifscCode,
                paymentMode: employee.paymentMode,
                joinedDate: employee.joinedDate,
                fixedSalary: employee.fixedSalary || 0
            },
            status: {
                isTracking: isTracking,
                autoCheckedOut: autoCheckedOut,
                canResume: canResume,
                hasCheckedInToday: !!todayAttendance,
                hasCheckedOutToday: !!(todayAttendance?.checkOutTime),
                hasOpenSession: !!openSession, // Any incomplete session regardless of date
                canCheckIn: !isTracking && !canResume && !openSession,
                canCheckOut: isTracking || canResume || !!openSession, // Can checkout if any open session
                attendanceRecords: allTodaySessions, // Return full list

                // Duration Info
                attendanceDurationMinutes: Math.round(attendanceDurationMinutes),
                permissionDurationMinutes: Math.round(permissionDurationMinutes),
                totalWorkDurationMinutes: Math.round(totalWorkDurationMinutes),

                openSession: openSession ? {
                    attendanceId: openSession.attendanceId,
                    checkInTime: openSession.checkInTime,
                    date: openSession.date,
                } : null,
                todayAttendance: todayAttendance ? {
                    attendanceId: todayAttendance.attendanceId,
                    checkInTime: todayAttendance.checkInTime,
                    checkOutTime: todayAttendance.checkOutTime,
                } : null,
            },
        });
    } catch (error) {
        console.error('Error getting attendance status:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting attendance status',
        });
    }
});

/**
 * Resume Session (Rejoin)
 * POST /api/attendance/resume-session
 */
router.post('/resume-session', async (req, res) => {
    try {
        const { employeeId } = req.body;

        const employee = await Employee.getEmployeeById(employeeId);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        // Re-enable tracking
        await Employee.updateEmployee(employeeId, {
            isTracking: true,
            lastPingTime: new Date().toISOString(),
            trackingStartTime: new Date().toISOString(), // Optional: reset start time or keep original? Keeping original is better logic usually, but here we just restart tracking.
        });

        res.json({
            success: true,
            message: 'Session resumed successfully',
            tracking: true
        });

    } catch (error) {
        console.error('Error resuming session:', error);
        res.status(500).json({ success: false, message: 'Error resuming session' });
    }
});

/**
 * Verify Identity for View-Only Access
 * POST /api/attendance/verify-view-access
 */
router.post('/verify-view-access', upload.single('image'), async (req, res) => {
    try {
        const { imageBase64, employeeId } = req.body;

        // Get image buffer
        let imageBuffer;
        if (req.file) {
            imageBuffer = req.file.buffer;
        } else if (imageBase64) {
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            return res.status(400).json({ success: false, message: 'Image is required' });
        }

        // Verify face
        const faceResult = await searchFace(imageBuffer);
        if (!faceResult.success) {
            return res.status(404).json({ success: false, message: 'Face not recognized' });
        }

        // Optional: Ensure the recognized face matches the requested employeeId (if provided)
        if (employeeId && faceResult.employeeId !== employeeId) {
            return res.status(403).json({ success: false, message: 'Face does not match the provided Employee ID' });
        }

        res.json({
            success: true,
            message: 'Verification successful',
            employeeId: faceResult.employeeId
        });

    } catch (error) {
        console.error('Error verification:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

/**
 * Close all active sessions and reset tracking (complete cleanup)
 * POST /api/attendance/close-all-sessions/:employeeId
 */
router.post('/close-all-sessions/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;

        // Close all attendance sessions without checkout
        const closedCount = await Attendance.closeAllActiveSessions(employeeId);

        // Reset tracking status
        await Employee.updateEmployee(employeeId, {
            isTracking: false,
            trackingEndTime: new Date().toISOString(),
        });

        res.json({
            success: true,
            message: `Closed ${closedCount} active session(s). You can now check in again.`,
            closedSessions: closedCount,
        });
    } catch (error) {
        console.error('Error closing sessions:', error);
        res.status(500).json({
            success: false,
            message: 'Error closing active sessions',
        });
    }
});

module.exports = router;
