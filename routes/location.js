const express = require('express');
const router = express.Router();
const { getGeofenceSettings } = require('../models/Settings');
const { isWithinGeofence } = require('../utils/geofence');

// Validate if location is within geo-fence
router.post('/validate', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required',
            });
        }

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
            parseFloat(latitude),
            parseFloat(longitude),
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
