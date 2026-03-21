/**
 * Designation Routes - CRUD endpoints for designations
 */

const express = require('express');
const router = express.Router();
const Designation = require('../models/Designation');

/**
 * Get all designations
 * GET /api/designations
 */
router.get('/', async (req, res) => {
    try {
        const designations = await Designation.getAllDesignations();
        res.json({
            success: true,
            designations,
        });
    } catch (error) {
        console.error('Error fetching designations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching designations',
        });
    }
});

/**
 * Create new designation
 * POST /api/designations
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, isActive } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Designation name is required',
            });
        }

        const designation = await Designation.createDesignation({
            name,
            description,
            isActive,
        });

        res.status(201).json({
            success: true,
            message: 'Designation created successfully',
            designation,
        });
    } catch (error) {
        console.error('Error creating designation:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating designation',
        });
    }
});

/**
 * Delete designation
 * DELETE /api/designations/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await Designation.deleteDesignation(id);

        res.json({
            success: true,
            message: 'Designation deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting designation:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting designation',
        });
    }
});

module.exports = router;
