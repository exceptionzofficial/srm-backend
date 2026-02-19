/**
 * Pay Group Routes - CRUD endpoints for pay groups
 */

const express = require('express');
const router = express.Router();
const PayGroup = require('../models/PayGroup');

/**
 * Get all pay groups
 * GET /api/pay-groups
 */
router.get('/', async (req, res) => {
    try {
        const payGroups = await PayGroup.getAllPayGroups();
        res.json({
            success: true,
            payGroups,
        });
    } catch (error) {
        console.error('Error fetching pay groups:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pay groups',
        });
    }
});

/**
 * Get pay group by ID
 * GET /api/pay-groups/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const payGroup = await PayGroup.getPayGroupById(id);

        if (!payGroup) {
            return res.status(404).json({
                success: false,
                message: 'Pay Group not found',
            });
        }

        res.json({
            success: true,
            payGroup,
        });
    } catch (error) {
        console.error('Error fetching pay group:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pay group',
        });
    }
});

/**
 * Create new pay group
 * POST /api/pay-groups
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, isActive } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Pay Group name is required',
            });
        }

        const payGroup = await PayGroup.createPayGroup({
            name,
            description,
            isActive,
        });

        res.status(201).json({
            success: true,
            message: 'Pay Group created successfully',
            payGroup,
        });
    } catch (error) {
        console.error('Error creating pay group:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating pay group',
        });
    }
});

/**
 * Update pay group
 * PUT /api/pay-groups/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const payGroup = await PayGroup.updatePayGroup(id, updates);

        res.json({
            success: true,
            message: 'Pay Group updated successfully',
            payGroup,
        });
    } catch (error) {
        console.error('Error updating pay group:', error);
        if (error.message === 'Pay Group not found') {
            return res.status(404).json({
                success: false,
                message: 'Pay Group not found',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Error updating pay group',
        });
    }
});

/**
 * Delete pay group
 * DELETE /api/pay-groups/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if exists first
        const existing = await PayGroup.getPayGroupById(id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Pay Group not found',
            });
        }

        await PayGroup.deletePayGroup(id);

        res.json({
            success: true,
            message: 'Pay Group deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting pay group:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting pay group',
        });
    }
});

module.exports = router;
