const express = require('express');
const router = express.Router();
const multer = require('multer');
const Employee = require('../models/Employee');
const Branch = require('../models/Branch');
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
        let targetLat, targetLng, targetRadius;
        let isConfigured = false;

        // 1. Try to get Employee's Branch
        if (employee.branchId) {
            const branch = await Branch.getBranchById(employee.branchId);
            if (branch && branch.latitude && branch.longitude) {
                targetLat = branch.latitude;
                targetLng = branch.longitude;
                targetRadius = branch.radiusMeters || 100;
                isConfigured = true;
                console.log(`[Face Register] Validating against Branch: ${branch.name}`);
            }
        }

        // 2. Fallback to Global Settings
        if (!isConfigured) {
            const globalSettings = await getGeofenceSettings();
            if (globalSettings.isConfigured) {
                targetLat = globalSettings.officeLat;
                targetLng = globalSettings.officeLng;
                targetRadius = globalSettings.radiusMeters;
                isConfigured = true;
                console.log('[Face Register] Validating against Global Office');
            }
        }

        console.log('--- Geofence Debug (Register) ---');
        console.log('User Location:', { latitude, longitude });
        console.log('Target:', { targetLat, targetLng, targetRadius });

        if (isConfigured) {
            const locationCheck = isWithinGeofence(
                parseFloat(latitude),
                parseFloat(longitude),
                targetLat,
                targetLng,
                targetRadius
            );

            console.log('Check Result:', locationCheck);

            if (!locationCheck.isWithin) {
                console.log('❌ Geofence Failed');
                return res.status(403).json({
                    success: false,
                    message: `Unable to register: You are too far from the office! Distance: ${locationCheck.distance}m (Allowed: ${locationCheck.allowedRadius}m)`,
                    distance: locationCheck.distance,
                    allowedRadius: locationCheck.allowedRadius,
                    withinRange: false,
                });
            }
            console.log('✅ Geofence Passed');
        } else {
            console.log('⚠️ Geofence NOT Configured - Skipping check');
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

        // --- Geofence Check (Post-Identity) ---
        let targetLat, targetLng, targetRadius;
        let isConfigured = false;

        // 1. Try Employee Branch
        if (employee.branchId) {
            const branch = await Branch.getBranchById(employee.branchId);
            if (branch && branch.latitude && branch.longitude) {
                targetLat = branch.latitude;
                targetLng = branch.longitude;
                targetRadius = branch.radiusMeters || 100;
                isConfigured = true;
            }
        }

        // 2. Fallback
        if (!isConfigured) {
            const globalSettings = await getGeofenceSettings();
            if (globalSettings.isConfigured) {
                targetLat = globalSettings.officeLat;
                targetLng = globalSettings.officeLng;
                targetRadius = globalSettings.radiusMeters;
                isConfigured = true;
            }
        }

        if (isConfigured) {
            const locationCheck = isWithinGeofence(
                parseFloat(latitude),
                parseFloat(longitude),
                targetLat,
                targetLng,
                targetRadius
            );

            if (!locationCheck.isWithin) {
                console.log(`[Face Verify] Geofence Failed for ${employee.name}`);
                return res.status(403).json({
                    success: false,
                    message: `You are too far from the office! Distance: ${locationCheck.distance}m (Allowed: ${locationCheck.allowedRadius}m)`,
                    distance: locationCheck.distance,
                    allowedRadius: locationCheck.allowedRadius,
                    withinRange: false,
                });
            }
        }
        // --------------------------------------

        res.json({
            success: true,
            message: 'Face verified successfully',
            employee: {
                employeeId: employee.employeeId,
                name: employee.name,
                department: employee.department,
                designation: employee.designation,
                branchId: employee.branchId, // Useful for frontend
            },
            similarity: searchResult.similarity,
            // Include location check details if useful
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
