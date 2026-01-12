const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Create a new group (Admin)
router.post('/groups', chatController.createGroup);

// Get groups for a user
router.get('/groups/:userId', chatController.getUserGroups);

// Delete a group
router.delete('/groups/:groupId', chatController.deleteGroup);

// Send message
router.post('/groups/:groupId/messages', chatController.sendMessage);

// Get messages
router.get('/groups/:groupId/messages', chatController.getMessages);

module.exports = router;
