const express = require('express');
const router = express.Router();
const { getGeofenceSettings } = require('../models/Settings');
const Branch = require('../models/Branch');
const LocationPing = require('../models/LocationPing');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const { isWithinGeofence } = require('../utils/geofence');

// Auto-checkout threshold: 5 consecutive pings outside geofence (5 minutes)
const OUTSIDE_GEOFENCE_CHECKOUT_THRESHOLD = 5;

/**
 * POST /ping - Receive location ping from mobile app
 * Called every minute by background service
 */
router.post('/ping', async (req, res) => {
    try {
        const { employeeId, latitude, longitude } = req.body;

        if (!employeeId || !latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'employeeId, latitude, and longitude are required',
            });
        }

        const userLat = parseFloat(latitude);
        const userLng = parseFloat(longitude);

        // Get employee to find their assigned branch
        const employee = await Employee.getEmployeeById(employeeId);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        // Check if employee is currently tracking (tracked after check-in)
        if (!employee.isTracking) {
            return res.json({
                success: true,
                message: 'Employee is not currently tracking (not checked in)',
                tracking: false,
            });
        }

        // Get all active branches and find closest
        const branches = await Branch.getActiveBranches();
        let closestBranch = null;
        let isInsideAnyBranch = false;
        let minDistance = Infinity;

        for (const branch of branches) {
            const result = isWithinGeofence(
                userLat,
                userLng,
                branch.latitude,
                branch.longitude,
                branch.radiusMeters
            );

            if (result.distance < minDistance) {
                minDistance = result.distance;
                closestBranch = {
                    branchId: branch.branchId,
                    name: branch.name,
                    distance: result.distance,
                };
            }

            if (result.isWithin) {
                isInsideAnyBranch = true;
            }
        }

        // Track consecutive pings outside geofence for auto-checkout
        let outsideGeofenceCount = employee.outsideGeofenceCount || 0;
        let autoCheckedOut = false;
        let shouldContinueTracking = true;

        if (!isInsideAnyBranch) {
            // Increment outside counter
            outsideGeofenceCount += 1;
            console.log(`[Location] ${employeeId} outside geofence. Count: ${outsideGeofenceCount}/${OUTSIDE_GEOFENCE_CHECKOUT_THRESHOLD}`);

            // Check if threshold reached - trigger auto-checkout
            if (outsideGeofenceCount >= OUTSIDE_GEOFENCE_CHECKOUT_THRESHOLD) {
                console.log(`[Auto-Checkout] ${employeeId} has been outside geofence for ${outsideGeofenceCount} minutes. Triggering auto-checkout.`);

                // Get open attendance session and close it
                const openSession = await Attendance.getOpenSession(employeeId);
                if (openSession) {
                    await Attendance.checkOut(openSession.attendanceId);
                    console.log(`[Auto-Checkout] Closed attendance session ${openSession.attendanceId}`);
                }

                // Stop tracking
                await Employee.updateEmployee(employeeId, {
                    isTracking: false,
                    outsideGeofenceCount: 0,
                    autoCheckedOutAt: new Date().toISOString(),
                    autoCheckoutReason: 'outside_geofence',
                    lastLatitude: userLat,
                    lastLongitude: userLng,
                    lastPingTime: new Date().toISOString(),
                });

                autoCheckedOut = true;
                shouldContinueTracking = false;
            }
        } else {
            // Reset counter when inside geofence
            outsideGeofenceCount = 0;
        }

        // Save the ping
        const ping = await LocationPing.savePing({
            employeeId,
            branchId: closestBranch?.branchId || null,
            latitude: userLat,
            longitude: userLng,
            isInsideGeofence: isInsideAnyBranch,
            distance: minDistance,
        });

        // Update employee's tracking status (if not auto-checked out)
        if (shouldContinueTracking) {
            await Employee.updateEmployee(employeeId, {
                lastLatitude: userLat,
                lastLongitude: userLng,
                lastPingTime: new Date().toISOString(),
                isInsideGeofence: isInsideAnyBranch,
                outsideGeofenceCount: outsideGeofenceCount,
            });
        }

        // Get today's work summary
        const today = new Date().toISOString().split('T')[0];
        const workSummary = await LocationPing.getWorkSummary(employeeId, today);

        res.json({
            success: true,
            ping: {
                pingId: ping.pingId,
                isInsideGeofence: isInsideAnyBranch,
                distance: minDistance,
                closestBranch: closestBranch?.name,
            },
            workMinutes: workSummary.workMinutes,
            formattedDuration: workSummary.formattedDuration,
            autoCheckedOut: autoCheckedOut,
            tracking: shouldContinueTracking,
            outsideGeofenceCount: isInsideAnyBranch ? 0 : outsideGeofenceCount,
        });
    } catch (error) {
        console.error('Error saving location ping:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving location ping',
        });
    }
});


/**
 * GET /employees - Get all employees' latest locations for admin map
 */
router.get('/employees', async (req, res) => {
    try {
        // Get all employees
        const employees = await Employee.getAllEmployees();

        // Try to get latest pings (may fail if table doesn't exist)
        let latestPings = [];
        try {
            latestPings = await LocationPing.getAllLatestPings();
        } catch (pingError) {
            console.log('LocationPings table may not exist yet, returning employees without ping data');
        }

        // Create a map of employeeId -> latest ping
        const pingMap = {};
        latestPings.forEach(ping => {
            pingMap[ping.employeeId] = ping;
        });

        // Get all branches for reference
        const branches = await Branch.getAllBranches();
        const branchMap = {};
        branches.forEach(b => {
            branchMap[b.branchId] = b;
        });

        // Combine employee data with location data
        const employeeLocations = employees.map(emp => {
            const ping = pingMap[emp.employeeId];
            const isOnline = ping &&
                (new Date() - new Date(ping.timestamp)) < 5 * 60 * 1000; // 5 min threshold

            return {
                employeeId: emp.employeeId,
                name: emp.name,
                department: emp.department,
                branchId: emp.branchId,
                branchName: branchMap[emp.branchId]?.name || 'Unassigned',
                isTracking: emp.isTracking || false,
                isOnline,
                isInsideGeofence: ping?.isInsideGeofence || false,
                lastLocation: ping ? {
                    latitude: ping.latitude,
                    longitude: ping.longitude,
                    timestamp: ping.timestamp,
                    distance: ping.distance,
                } : null,
            };
        });

        res.json({
            success: true,
            employees: employeeLocations,
            totalTracking: employeeLocations.filter(e => e.isTracking).length,
            totalInside: employeeLocations.filter(e => e.isInsideGeofence).length,
        });
    } catch (error) {
        console.error('Error getting employee locations:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting employee locations',
        });
    }
});

/**
 * GET /work-summary/:employeeId - Get work summary for an employee
 */
router.get('/work-summary/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { date } = req.query;

        const targetDate = date || new Date().toISOString().split('T')[0];
        const summary = await LocationPing.getWorkSummary(employeeId, targetDate);

        res.json({
            success: true,
            summary,
        });
    } catch (error) {
        console.error('Error getting work summary:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting work summary',
        });
    }
});

// Validate if location is within geo-fence (checks all active branches)
router.post('/validate', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required',
            });
        }

        const userLat = parseFloat(latitude);
        const userLng = parseFloat(longitude);

        // First check branches
        const branches = await Branch.getActiveBranches();

        if (branches.length > 0) {
            // Check if within any branch
            let closestBranch = null;
            let minDistance = Infinity;
            let withinAnyBranch = false;

            for (const branch of branches) {
                const result = isWithinGeofence(
                    userLat,
                    userLng,
                    branch.latitude,
                    branch.longitude,
                    branch.radiusMeters
                );

                if (result.distance < minDistance) {
                    minDistance = result.distance;
                    closestBranch = {
                        name: branch.name,
                        distance: result.distance,
                        allowedRadius: result.allowedRadius,
                        isWithin: result.isWithin,
                    };
                }

                if (result.isWithin) {
                    withinAnyBranch = true;
                }
            }

            return res.json({
                success: true,
                withinRange: withinAnyBranch,
                closestBranch,
                distance: closestBranch?.distance,
                allowedRadius: closestBranch?.allowedRadius,
                isConfigured: true,
                message: withinAnyBranch
                    ? `You are within ${closestBranch.name}`
                    : `You are too far! Nearest: ${closestBranch.name} (${closestBranch.distance}m away)`,
            });
        }

        // Fallback to legacy geofence settings
        const geofence = await getGeofenceSettings();

        if (!geofence.isConfigured) {
            return res.json({
                success: true,
                withinRange: true,
                message: 'Geo-fence not configured. All locations allowed.',
                isConfigured: false,
            });
        }

        const result = isWithinGeofence(
            userLat,
            userLng,
            geofence.officeLat,
            geofence.officeLng,
            geofence.radiusMeters
        );

        res.json({
            success: true,
            withinRange: result.isWithin,
            distance: result.distance,
            allowedRadius: result.allowedRadius,
            officeAddress: geofence.officeAddress,
            isConfigured: true,
            message: result.isWithin
                ? 'You are within the allowed range'
                : `You are too far from the office! Distance: ${result.distance}m (Allowed: ${result.allowedRadius}m)`,
        });
    } catch (error) {
        console.error('Error validating location:', error);
        res.status(500).json({
            success: false,
            message: 'Error validating location',
        });
    }
});

module.exports = router;
