const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');

// Get geo-fence settings
router.get('/geofence', async (req, res) => {
    try {
        const settings = await Settings.getGeofenceSettings();
        res.json({
            success: true,
            settings,
        });
    } catch (error) {
        console.error('Error fetching geo-fence settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching geo-fence settings',
        });
    }
});

// Update geo-fence settings (admin only)
router.put('/geofence', async (req, res) => {
    try {
        const { officeLat, officeLng, radiusMeters, officeAddress, updatedBy } = req.body;

        if (officeLat === undefined || officeLng === undefined || radiusMeters === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Office location and radius are required',
            });
        }

        if (radiusMeters < 10 || radiusMeters > 10000) {
            return res.status(400).json({
                success: false,
                message: 'Radius must be between 10 and 10000 meters',
            });
        }

        const settings = await Settings.updateGeofenceSettings({
            officeLat: parseFloat(officeLat),
            officeLng: parseFloat(officeLng),
            radiusMeters: parseInt(radiusMeters),
            officeAddress,
            updatedBy,
        });

        res.json({
            success: true,
            message: 'Geo-fence settings updated successfully',
            settings,
        });
    } catch (error) {
        console.error('Error updating geo-fence settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating geo-fence settings',
        });
    }
});

// Get attendance settings (late threshold, work hours)
router.get('/attendance', async (req, res) => {
    try {
        const settings = await Settings.getAttendanceSettings();
        res.json({
            success: true,
            settings,
        });
    } catch (error) {
        console.error('Error fetching attendance settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching attendance settings',
        });
    }
});

// Update attendance settings (admin only)
router.put('/attendance', async (req, res) => {
    try {
        const { lateThresholdMinutes, halfDayThresholdMinutes, workStartTime, workEndTime, updatedBy } = req.body;

        const settings = await Settings.updateAttendanceSettings({
            lateThresholdMinutes: lateThresholdMinutes ? parseInt(lateThresholdMinutes) : 555,
            halfDayThresholdMinutes: halfDayThresholdMinutes ? parseInt(halfDayThresholdMinutes) : 720,
            workStartTime: workStartTime || '09:00',
            workEndTime: workEndTime || '18:00',
            updatedBy,
        });

        res.json({
            success: true,
            message: 'Attendance settings updated successfully',
            settings,
        });
    } catch (error) {
        console.error('Error updating attendance settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating attendance settings',
        });
    }
});

// Get employee rules
router.get('/rules', async (req, res) => {
    try {
        const rules = await Settings.getEmployeeRules();
        res.json({
            success: true,
            rules,
        });
    } catch (error) {
        console.error('Error fetching employee rules:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching employee rules',
        });
    }
});

// Update employee rules (admin only)
router.put('/rules', async (req, res) => {
    try {
        const { rules, updatedBy } = req.body;

        if (!rules) {
            return res.status(400).json({
                success: false,
                message: 'Rules text is required',
            });
        }

        const updatedRules = await Settings.updateEmployeeRules(rules, updatedBy);

        res.json({
            success: true,
            message: 'Employee rules updated successfully',
            rules: updatedRules,
        });
    } catch (error) {
        console.error('Error updating employee rules:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating employee rules',
        });
    }
});

module.exports = router;

