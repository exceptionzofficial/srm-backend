const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');

/**
 * Create a new group
 */
router.post('/groups', async (req, res) => {
    try {
        const group = await Chat.createGroup(req.body);
        res.status(201).json({
            success: true,
            data: group
        });
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating group'
        });
    }
});

/**
 * Get user groups
 */
router.get('/groups/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const groups = await Chat.getUserGroups(userId);
        res.json({
            success: true,
            data: groups
        });
    } catch (error) {
        console.error('Error fetching user groups:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user groups'
        });
    }
});

/**
 * Delete a group
 */
router.delete('/groups/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        await Chat.deleteGroup(groupId);
        res.json({
            success: true,
            message: 'Group deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting group'
        });
    }
});

/**
 * Send a message
 */
router.post('/groups/:groupId/messages', async (req, res) => {
    try {
        const { groupId } = req.params;
        const message = await Chat.sendMessage(groupId, req.body);
        res.status(201).json({
            success: true,
            data: message
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending message'
        });
    }
});

/**
 * Get messages for a group
 */
router.get('/groups/:groupId/messages', async (req, res) => {
    try {
        const { groupId } = req.params;
        const messages = await Chat.getMessages(groupId);
        res.json({
            success: true,
            data: messages
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching messages'
        });
    }
});

module.exports = router;
