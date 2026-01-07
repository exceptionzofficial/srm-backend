/**
 * Branch Routes - CRUD endpoints for branch/location management
 */

const express = require('express');
const router = express.Router();
const Branch = require('../models/Branch');

/**
 * Get all branches
 * GET /api/branches
 */
router.get('/', async (req, res) => {
    try {
        const branches = await Branch.getAllBranches();
        res.json({
            success: true,
            branches,
        });
    } catch (error) {
        console.error('Error fetching branches:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching branches',
        });
    }
});

/**
 * Get active branches only
 * GET /api/branches/active
 */
router.get('/active', async (req, res) => {
    try {
        const branches = await Branch.getActiveBranches();
        res.json({
            success: true,
            branches,
        });
    } catch (error) {
        console.error('Error fetching active branches:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching active branches',
        });
    }
});

/**
 * Get branch by ID
 * GET /api/branches/:branchId
 */
router.get('/:branchId', async (req, res) => {
    try {
        const { branchId } = req.params;
        const branch = await Branch.getBranchById(branchId);

        if (!branch) {
            return res.status(404).json({
                success: false,
                message: 'Branch not found',
            });
        }

        res.json({
            success: true,
            branch,
        });
    } catch (error) {
        console.error('Error fetching branch:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching branch',
        });
    }
});

/**
 * Create new branch
 * POST /api/branches
 */
router.post('/', async (req, res) => {
    try {
        const { name, address, latitude, longitude, radiusMeters, isActive, branchType } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Branch name is required',
            });
        }

        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required',
            });
        }

        if (radiusMeters && (radiusMeters < 10 || radiusMeters > 10000)) {
            return res.status(400).json({
                success: false,
                message: 'Radius must be between 10 and 10000 meters',
            });
        }

        const branch = await Branch.createBranch({
            name,
            address,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            radiusMeters: parseInt(radiusMeters) || 100,
            isActive,
            branchType,
        });

        res.status(201).json({
            success: true,
            message: 'Branch created successfully',
            branch,
        });
    } catch (error) {
        console.error('Error creating branch:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating branch',
        });
    }
});

/**
 * Update branch
 * PUT /api/branches/:branchId
 */
router.put('/:branchId', async (req, res) => {
    try {
        const { branchId } = req.params;
        const updates = req.body;

        if (updates.radiusMeters && (updates.radiusMeters < 10 || updates.radiusMeters > 10000)) {
            return res.status(400).json({
                success: false,
                message: 'Radius must be between 10 and 10000 meters',
            });
        }

        if (updates.latitude) updates.latitude = parseFloat(updates.latitude);
        if (updates.longitude) updates.longitude = parseFloat(updates.longitude);
        if (updates.radiusMeters) updates.radiusMeters = parseInt(updates.radiusMeters);

        const branch = await Branch.updateBranch(branchId, updates);

        res.json({
            success: true,
            message: 'Branch updated successfully',
            branch,
        });
    } catch (error) {
        console.error('Error updating branch:', error);
        if (error.message === 'Branch not found') {
            return res.status(404).json({
                success: false,
                message: 'Branch not found',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Error updating branch',
        });
    }
});

/**
 * Delete branch
 * DELETE /api/branches/:branchId
 */
router.delete('/:branchId', async (req, res) => {
    try {
        const { branchId } = req.params;

        const existing = await Branch.getBranchById(branchId);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Branch not found',
            });
        }

        await Branch.deleteBranch(branchId);

        res.json({
            success: true,
            message: 'Branch deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting branch:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting branch',
        });
    }
});

module.exports = router;
