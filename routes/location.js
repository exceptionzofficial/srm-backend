const express = require('express');
const router = express.Router();
const { getGeofenceSettings } = require('../models/Settings');
const Branch = require('../models/Branch');
const { isWithinGeofence } = require('../utils/geofence');

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
