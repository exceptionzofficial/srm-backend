const express = require('express');
const router = express.Router();
const multer = require('multer');
const Employee = require('../models/Employee');
const { indexFace, searchFace } = require('../utils/rekognition');
const { getGeofenceSettings } = require('../models/Settings');
const { isWithinGeofence } = require('../utils/geofence');

// Configure multer for handling image uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

/**
 * Register face for employee
 * POST /api/face/register
 * Body: employeeId, latitude, longitude, image (base64 or file)
 */
router.post('/register', upload.single('image'), async (req, res) => {
    try {
        const { employeeId, latitude, longitude, imageBase64 } = req.body;

        // Validate required fields
        if (!employeeId) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required',
            });
        }

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Location is required',
            });
        }

        // Verify employee exists and doesn't have face registered
        const employee = await Employee.getEmployeeById(employeeId);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        if (employee.faceId) {
            return res.status(400).json({
                success: false,
                message: 'Face already registered for this employee',
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
                    message: `You are too far from the office! Distance: ${locationCheck.distance}m (Allowed: ${locationCheck.allowedRadius}m)`,
                    distance: locationCheck.distance,
                    allowedRadius: locationCheck.allowedRadius,
                    withinRange: false,
                });
            }
        }

        // Get image buffer
        let imageBuffer;
        if (req.file) {
            imageBuffer = req.file.buffer;
        } else if (imageBase64) {
            // Remove data URL prefix if present
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            return res.status(400).json({
                success: false,
                message: 'Image is required',
            });
        }

        // Index face with Rekognition
        const faceResult = await indexFace(imageBuffer, employeeId);

        // Update employee with face ID
        await Employee.updateEmployeeFaceId(employeeId, faceResult.faceId);

        res.json({
            success: true,
            message: 'Face registered successfully!',
            faceId: faceResult.faceId,
            confidence: faceResult.confidence,
        });
    } catch (error) {
        console.error('Error registering face:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error registering face',
        });
    }
});

/**
 * Verify face for attendance
 * POST /api/face/verify
 * Body: latitude, longitude, image (base64 or file)
 */
router.post('/verify', upload.single('image'), async (req, res) => {
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
                    message: `You are too far from the office! Distance: ${locationCheck.distance}m (Allowed: ${locationCheck.allowedRadius}m)`,
                    distance: locationCheck.distance,
                    allowedRadius: locationCheck.allowedRadius,
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

        // Search face in Rekognition
        const searchResult = await searchFace(imageBuffer);

        if (!searchResult.success) {
            return res.status(404).json({
                success: false,
                message: searchResult.message || 'Face not recognized',
            });
        }

        // Get employee details
        const employee = await Employee.getEmployeeById(searchResult.employeeId);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found for this face',
            });
        }

        res.json({
            success: true,
            message: 'Face verified successfully',
            employee: {
                employeeId: employee.employeeId,
                name: employee.name,
                department: employee.department,
                designation: employee.designation,
            },
            similarity: searchResult.similarity,
        });
    } catch (error) {
        console.error('Error verifying face:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error verifying face',
        });
    }
});

module.exports = router;
