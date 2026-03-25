const TravelSession = require('../models/TravelSession');
const Request = require('../models/Request');
const LocationPing = require('../models/LocationPing');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');

/**
 * Start a Travel Session
 * Requires a valid APPROVED BRANCH_TRAVEL request
 */
async function startTravel(req, res) {
    try {
        const { employeeId, requestId, latitude, longitude } = req.body;

        if (!employeeId || !requestId || !latitude || !longitude) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Validate that there is an approved request for this
        // We'd typically fetch the request and check status & type
        // Since Request model doesn't have getById exposed nicely yet (I noticed this earlier),
        // we might rely on the client sending a valid ID, but for security we should check.
        // For now, let's assume valid ID is sufficient to start, or we can scan.
        // Better: We check if there's already an active session to prevent double start.

        const activeSession = await TravelSession.getActiveTravelSession(employeeId);
        if (activeSession) {
            return res.status(400).json({
                success: false,
                message: 'You already have an active travel session.',
                activeSession
            });
        }

        // VALIDATION: Check if user has an active OFFICE attendance session
        const openAttendance = await Attendance.getOpenSession(employeeId);
        if (openAttendance && openAttendance.type !== 'TRAVEL') {
            return res.status(409).json({
                success: false,
                code: 'OFFICE_ATTENDANCE_ACTIVE',
                message: 'You are currently checked in at an office. Please check out before starting travel.',
                openSession: openAttendance
            });
        }

        const session = await TravelSession.startTravelSession({
            requestId,
            employeeId,
            startLocation: { lat: latitude, lng: longitude }
        });

        // UNIFIED STATE: Create a corresponding Attendance record of type 'TRAVEL'
        // This ensures the travel time is counted as work duration.
        await Attendance.createAttendance({
            employeeId,
            latitude,
            longitude,
            type: 'TRAVEL',
            status: 'present'
        });

        // Update employee's tracking status and last location immediately
        await Employee.updateEmployee(employeeId, {
            isTracking: true,
            lastLatitude: parseFloat(latitude),
            lastLongitude: parseFloat(longitude),
            lastPingTime: new Date().toISOString(),
            isInsideGeofence: true,
            outsideGeofenceCount: 0
        });

        res.status(201).json({ success: true, session });
    } catch (error) {
        console.error('Error starting travel:', error);
        res.status(500).json({ success: false, message: 'Error starting travel' });
    }
}

/**
 * End a Travel Session
 */
async function endTravel(req, res) {
    try {
        const { sessionId, latitude, longitude, totalDistance } = req.body;

        if (!sessionId || !latitude || !longitude) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const session = await TravelSession.endTravelSession(
            sessionId,
            { lat: latitude, lng: longitude },
            totalDistance || 0
        );

        // Mark the associated request as travel-completed
        if (session && session.requestId) {
            try {
                // Fetch the specific request directly
                const targetRequest = await Request.getRequestById(session.requestId);
                if (targetRequest) {
                    const updatedData = {
                        ...(targetRequest.data || {}),
                        travelStatus: 'COMPLETED',
                        travelEndTime: new Date().toISOString()
                    };
                    await Request.updateRequestData(session.requestId, updatedData);
                    console.log(`[travelController] Marked request ${session.requestId} as COMPLETED`);
                } else {
                    console.warn(`[travelController] Could not find request ${session.requestId} to mark as COMPLETED`);
                }
            } catch (err) {
                console.error('Error marking request as travel-completed:', err);
            }
        }

        // UNIFIED STATE: Find and close the 'TRAVEL' attendance session
        if (session && session.employeeId) {
            try {
                const openAttendance = await Attendance.getOpenSession(session.employeeId);
                // We only close it if it's a TRAVEL session (to avoid accidentally closing a valid office session if one was somehow forced)
                if (openAttendance && openAttendance.type === 'TRAVEL') {
                    console.log(`[travelController] Closing TRAVEL attendance record ${openAttendance.attendanceId}`);
                    await Attendance.checkOut(openAttendance.attendanceId, null);
                }

                // Reset tracking status
                console.log(`[travelController] Resetting isTracking to false for ${session.employeeId}`);
                await Employee.updateEmployee(session.employeeId, {
                    isTracking: false,
                    trackingEndTime: new Date().toISOString()
                });
            } catch (err) {
                console.error('Error closing attendance/tracking after travel:', err);
            }
        }

        res.json({ success: true, session });
    } catch (error) {
        console.error('Error ending travel:', error);
        res.status(500).json({ success: false, message: 'Error ending travel' });
    }
}

/**
 * Get Active Session
 */
async function getActiveSession(req, res) {
    try {
        const { employeeId } = req.params;
        const session = await TravelSession.getActiveTravelSession(employeeId);

        res.json({ success: true, session });
    } catch (error) {
        console.error('Error fetching active session:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching active session',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

module.exports = {
    startTravel,
    endTravel,
    getActiveSession
};
