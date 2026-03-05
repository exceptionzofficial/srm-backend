/**
 * Clusters Routes
 */

const express = require('express');
const router = express.Router();
const Cluster = require('../models/Cluster');

// GET all clusters
router.get('/', async (req, res) => {
    try {
        const clusters = await Cluster.getAllClusters();
        res.json({ success: true, clusters });
    } catch (error) {
        console.error('Error fetching clusters:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET clusters by manager ID
router.get('/manager/:managerId', async (req, res) => {
    try {
        const clusters = await Cluster.getClustersByManager(req.params.managerId);
        res.json({ success: true, clusters });
    } catch (error) {
        console.error('Error fetching clusters by manager:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET cluster by ID
router.get('/:id', async (req, res) => {
    try {
        const cluster = await Cluster.getClusterById(req.params.id);
        if (!cluster) {
            return res.status(404).json({ success: false, message: 'Cluster not found' });
        }
        res.json({ success: true, cluster });
    } catch (error) {
        console.error('Error fetching cluster:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST create cluster
router.post('/', async (req, res) => {
    try {
        const cluster = await Cluster.createCluster(req.body);
        res.status(201).json({ success: true, cluster });
    } catch (error) {
        console.error('Error creating cluster:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT update cluster
router.put('/:id', async (req, res) => {
    try {
        const cluster = await Cluster.updateCluster(req.params.id, req.body);
        res.json({ success: true, cluster });
    } catch (error) {
        console.error('Error updating cluster:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE cluster
router.delete('/:id', async (req, res) => {
    try {
        await Cluster.deleteCluster(req.params.id);
        res.json({ success: true, message: 'Cluster deleted successfully' });
    } catch (error) {
        console.error('Error deleting cluster:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET cluster details (managers and requests)
router.get('/:id/details', async (req, res) => {
    try {
        const cluster = await Cluster.getClusterDetails(req.params.id);
        if (!cluster) {
            return res.status(404).json({ success: false, message: 'Cluster not found' });
        }
        res.json({ success: true, cluster });
    } catch (error) {
        console.error('Error fetching cluster details:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
