const express = require('express');
const router = express.Router();
const multer = require('multer');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
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
        const { latitude, longitude, imageBase64 } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Location is required',
            });
        }

        // Check geo-fence
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
                message: 'Face not recognized. Please register first.',
            });
        }

        const employeeId = faceResult.employeeId;

        // Check if currently tracking (already checked in but not checked out)
        const employee = await Employee.getEmployeeById(employeeId);
        if (employee.isTracking) {
            return res.status(400).json({
                success: false,
                message: 'Already checked in. Please check out first.',
            });
        }

        // Create attendance record
        const attendance = await Attendance.createAttendance({
            employeeId,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
        });

        // Start GPS tracking for this employee
        await Employee.updateEmployee(employeeId, {
            isTracking: true,
            lastLatitude: parseFloat(latitude),
            lastLongitude: parseFloat(longitude),
            lastPingTime: new Date().toISOString(),
            trackingStartTime: new Date().toISOString(),
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

        // Get today's attendance
        const attendance = await Attendance.getTodayAttendance(employeeId);
        if (!attendance) {
            return res.status(400).json({
                success: false,
                message: 'No check-in record found for today',
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

        const employee = await Employee.getEmployeeById(employeeId);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        const todayAttendance = await Attendance.getTodayAttendance(employeeId);

        res.json({
            success: true,
            status: {
                isTracking: employee.isTracking || false,
                hasCheckedInToday: !!todayAttendance,
                hasCheckedOutToday: !!(todayAttendance?.checkOutTime),
                canCheckIn: !employee.isTracking,
                canCheckOut: employee.isTracking && todayAttendance && !todayAttendance.checkOutTime,
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
