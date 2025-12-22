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

module.exports = router;
