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
        const isKiosk = req.body.isKiosk === true || req.body.isKiosk === 'true';

        console.log(`[Face Register] Request received for Employee: ${employeeId}`);
        console.log(`[Face Register] Details - Lat: ${latitude}, Lng: ${longitude}, Kiosk: ${isKiosk}`);
        console.log(`[Face Register] Image Info - Base64 provided: ${!!imageBase64}, File provided: ${!!req.file}`);



        // Validate required fields
        if (!employeeId) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required',
            });
        }


        // if ((!latitude || !longitude) && req.body.isKiosk !== true) {
        //     return res.status(400).json({
        //         success: false,
        //         message: 'Location is required',
        //     });
        // }

        // Verify employee exists and doesn't have face registered
        const employee = await Employee.getEmployeeById(employeeId);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        if (employee.faceId) {
            console.log(`[Face Register] Error: Face already registered for ${employeeId} (${employee.faceId})`);
            return res.status(400).json({
                success: false,
                message: 'Face already registered for this employee',
            });
        }

        // Fetch location if provided, but don't enforce geofence for registration
        console.log(`[Face Register] Processing registration for ${employeeId}${isKiosk ? ' (Kiosk)' : ''}`);

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

        // CLEANUP: Remove ANY existing faces for this employee (even if DB is out of sync)
        // This ensures the new face is the ONLY face for this ID.
        const { deleteFacesByEmployeeId } = require('../utils/rekognition');
        try {
            await deleteFacesByEmployeeId(employeeId);
        } catch (cleanupError) {
            console.warn(`[Face Register] Warning: Cleanup failed for ${employeeId}:`, cleanupError.message);
            // We continue, as it might be a new user or connection glitch
        }

        // Index face with Rekognition
        console.log(`[Face Register] Calling Rekognition IndexFace for ${employeeId}...`);
        const faceResult = await indexFace(imageBuffer, employeeId);
        console.log(`[Face Register] IndexFace Result:`, JSON.stringify(faceResult, null, 2));

        // Update employee with face ID
        await Employee.updateEmployeeFaceId(employeeId, faceResult.faceId);

        res.json({
            success: true,
            message: 'Face registered successfully!',
            faceId: faceResult.faceId,
            confidence: faceResult.confidence,
        });
    } catch (error) {
        console.error('[Face Register] CRITICAL ERROR:', error);
        if (error.name) console.error(`[Face Register] Error Name: ${error.name}`);
        if (error.message) console.error(`[Face Register] Error Message: ${error.message}`);
        if (error.stack) console.error(`[Face Register] Error Stack: ${error.stack}`);

        res.status(500).json({
            success: false,
            message: error.message || 'Error registering face',
            error: process.env.NODE_ENV === 'development' ? error : undefined
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

        if ((!latitude || !longitude) && req.body.isKiosk !== true) {
            return res.status(400).json({
                success: false,
                message: 'Location is required',
            });
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

        // Search face in Rekognition
        const searchResult = await searchFace(imageBuffer);
        console.log('[DEBUG] Search Result:', JSON.stringify(searchResult, null, 2));

        if (!searchResult.success) {
            return res.status(404).json({
                success: false,
                message: searchResult.message || 'Face not recognized',
            });
        }

        // Get employee details
        console.log(`[DEBUG] Looking up employee: ${searchResult.employeeId}`);
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

        if (isConfigured && req.body.isKiosk !== true) {
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

        // Check if expectedEmployeeId is provided and matches
        const { expectedEmployeeId } = req.body;
        let verified = true;

        if (expectedEmployeeId && searchResult.employeeId !== expectedEmployeeId) {
            console.log(`[Face Verify] Mismatch! Expected: ${expectedEmployeeId}, Found: ${searchResult.employeeId}`);
            return res.json({
                success: true,
                verified: false,
                message: 'Face does not match the provided Employee ID',
                employee: { employeeId: searchResult.employeeId }
            });
        }

        res.json({
            success: true,
            verified: true,
            message: 'Face verified successfully',
            employee: {
                employeeId: employee.employeeId,
                name: employee.name,
                department: employee.department,
                designation: employee.designation,
                branchId: employee.branchId,
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

/**
 * Delete face registration (Reset face)
 * DELETE /api/face/:employeeId
 */
router.delete('/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;

        const employee = await Employee.getEmployeeById(employeeId);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        if (!employee.faceId) {
            return res.status(400).json({ success: false, message: 'No face registered for this employee' });
        }

        // Delete from Rekognition
        try {
            const { deleteFace } = require('../utils/rekognition');
            await deleteFace(employee.faceId);
            console.log(`[Face Delete] Removed face ${employee.faceId} from Rekognition`);
        } catch (rekError) {
            console.warn(`[Face Delete] Warning: Failed to delete from Rekognition (might already be gone):`, rekError.message);
            // Continue to clear DB even if Rekognition fails
        }

        // Clear from Database
        await Employee.updateEmployeeFaceId(employeeId, null);

        res.json({
            success: true,
            message: 'Face registration reset successfully. Employee can now register again.',
        });

    } catch (error) {
        console.error('Error deleting face:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error deleting face registration',
        });
    }
});

module.exports = router;
