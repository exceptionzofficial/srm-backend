const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const Chat = require('../models/Chat');
const { s3Client, S3_EMPLOYEE_PHOTOS_BUCKET } = require('../config/aws');
const { db, admin } = require('../config/firebase');

// Configure multer for memory storage (chat media)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit for chat media
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only image, video, and PDF files are allowed'), false);
        }
    },
});

// Helper to upload chat file to S3
const uploadChatFileToS3 = async (file, groupId) => {
    const fileExtension = file.originalname.split('.').pop();
    const key = `chat/${groupId}/${uuidv4()}.${fileExtension}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: S3_EMPLOYEE_PHOTOS_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
    }));

    return `https://${S3_EMPLOYEE_PHOTOS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

// Helper: Send push notification to group members
const sendPushToGroupMembers = async (groupId, senderId, senderName, messagePreview) => {
    try {
        const group = await Chat.getGroupById(groupId);
        if (!group || !group.members) return;

        // Get FCM tokens for all members except sender
        const memberIds = group.members.filter(id => id !== senderId);
        const tokens = [];

        for (const memberId of memberIds) {
            const tokenDoc = await db.collection('fcm_tokens').doc(memberId).get();
            if (tokenDoc.exists && tokenDoc.data().token) {
                tokens.push(tokenDoc.data().token);
            }
        }

        if (tokens.length === 0) return;

        const message = {
            tokens,
            notification: {
                title: `${senderName} in ${group.name}`,
                body: messagePreview.substring(0, 100),
            },
            data: {
                groupId: groupId,
                groupName: group.name || '',
                type: 'chat_message',
            },
            android: {
                priority: 'high',
                notification: {
                    channelId: 'chat_messages',
                    sound: 'default',
                },
            },
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`Push sent: ${response.successCount} success, ${response.failureCount} failed`);

        // Clean up invalid tokens
        response.responses.forEach((resp, idx) => {
            if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
                const invalidToken = tokens[idx];
                // Find and remove the invalid token
                memberIds.forEach(async (memberId) => {
                    const tokenDoc = await db.collection('fcm_tokens').doc(memberId).get();
                    if (tokenDoc.exists && tokenDoc.data().token === invalidToken) {
                        await db.collection('fcm_tokens').doc(memberId).delete();
                    }
                });
            }
        });
    } catch (error) {
        console.error('Error sending push notifications:', error.message);
    }
};

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
 * Get single group by ID
 */
router.get('/groups/details/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await Chat.getGroupById(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        res.json({
            success: true,
            data: group
        });
    } catch (error) {
        console.error('Error fetching group:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching group'
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
        });
    }
});

/**
 * Update a group (for tasks, pinned task, timeline, etc.)
 */
router.put('/groups/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const updates = req.body;

        // Get the group first to ensure it exists
        const group = await Chat.getGroupById(groupId);
        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        // Update the group in Firestore
        const groupRef = db.collection('chat_groups').doc(groupId);
        await groupRef.update({
            ...updates,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            success: true,
            message: 'Group updated successfully'
        });
    } catch (error) {
        console.error('Error updating group:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating group'
        });
    }
});

/**
 * Send a message (with optional file upload)
 */
router.post('/groups/:groupId/messages', upload.single('file'), async (req, res) => {
    try {
        const { groupId } = req.params;
        let messageData = { ...req.body };

        // Handle file upload if present
        if (req.file) {
            const fileUrl = await uploadChatFileToS3(req.file, groupId);
            messageData.fileUrl = fileUrl;
            messageData.fileName = req.file.originalname;
            messageData.fileType = req.file.mimetype;

            // Determine message type based on file
            if (req.file.mimetype.startsWith('image/')) {
                messageData.type = 'image';
                messageData.content = messageData.content || 'Sent an image';
            } else if (req.file.mimetype.startsWith('video/')) {
                messageData.type = 'video';
                messageData.content = messageData.content || 'Sent a video';
            } else {
                messageData.type = 'file';
                messageData.content = messageData.content || `Sent a file: ${req.file.originalname}`;
            }
        }

        const message = await Chat.sendMessage(groupId, messageData);

        // Send push notification to other group members
        const preview = messageData.content || 'Sent a media file';
        sendPushToGroupMembers(groupId, messageData.senderId, messageData.senderName || 'Someone', preview);

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

/**
 * Mark messages as read
 */
router.post('/groups/:groupId/read', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        await Chat.markAsRead(groupId, userId);
        res.json({
            success: true,
            message: 'Messages marked as read'
        });
    } catch (error) {
        console.error('Error marking as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking messages as read'
        });
    }
});

/**
 * Vote on a poll
 */
router.post('/groups/:groupId/messages/:messageId/vote', async (req, res) => {
    try {
        const { userId, optionIndex } = req.body;
        const result = await Chat.votePoll(req.params.groupId, req.params.messageId, userId, optionIndex);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Error voting on poll:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Register FCM token for push notifications
 */
router.post('/register-fcm-token', async (req, res) => {
    try {
        const { employeeId, token } = req.body;

        if (!employeeId || !token) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID and token are required'
            });
        }

        await db.collection('fcm_tokens').doc(employeeId).set({
            token,
            employeeId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            success: true,
            message: 'FCM token registered successfully'
        });
    } catch (error) {
        console.error('Error registering FCM token:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering FCM token'
        });
    }
});

module.exports = router;
