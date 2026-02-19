const express = require('express');
const router = express.Router();
const FundRequest = require('../models/FundRequest');

/**
 * Create Fund Request
 */
router.post('/request', async (req, res) => {
    try {
        const result = await FundRequest.createFundRequest(req.body);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error('Error creating fund request:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * Get Requests for a specific Role (CFO, BRANCH_MANAGER, MD)
 */
router.get('/pending/:role', async (req, res) => {
    try {
        const { role } = req.params;
        const requests = await FundRequest.getRequestsByHandler(role);
        res.json({ success: true, data: requests });
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * Action on Request (Approve/Reject/Forward)
 */
router.post('/action', async (req, res) => {
    try {
        const { id, action, actorRole, notes } = req.body;
        // action: 'APPROVE', 'REJECT', 'FORWARD'

        let updates = {};
        let newStatus = 'PENDING';

        if (action === 'APPROVE') {
            newStatus = 'APPROVED';
            updates.approvedBy = actorRole;
            updates.currentHandler = 'COMPLETED';
        } else if (action === 'REJECT') {
            newStatus = 'REJECTED';
            updates.rejectedBy = actorRole;
            updates.currentHandler = 'COMPLETED';
        } else if (action === 'FORWARD') {
            // Logic to move to next handler
            if (actorRole === 'BRANCH_MANAGER') {
                updates.currentHandler = 'MD';
                updates.forwardedTo = 'MD';
            }
        }

        await FundRequest.updateRequestStatus(id, newStatus, updates);
        res.json({ success: true, message: `Request ${action.toLowerCase()}ed` });

    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
