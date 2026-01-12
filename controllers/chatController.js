const { db, admin } = require('../utils/firestore');
const { v4: uuidv4 } = require('uuid');

// Create a new chat group
exports.createGroup = async (req, res) => {
    try {
        const { name, members, createdBy } = req.body;

        if (!name || !members || !Array.isArray(members)) {
            return res.status(400).json({ success: false, message: 'Invalid group data' });
        }

        // Ensure creator is in the group
        const allMembers = [...new Set([...members, createdBy])];

        const groupData = {
            name,
            members: allMembers,
            createdBy,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastMessage: null,
            lastMessageTime: null
        };

        const groupRef = await db.collection('chat_groups').add(groupData);

        res.status(201).json({
            success: true,
            data: { id: groupRef.id, ...groupData }
        });
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get groups for a user
exports.getUserGroups = async (req, res) => {
    try {
        const { userId } = req.params;

        const snapshot = await db.collection('chat_groups')
            .where('members', 'array-contains', userId)
            .orderBy('lastMessageTime', 'desc')
            .get();

        const groups = [];
        snapshot.forEach(doc => {
            groups.push({ id: doc.id, ...doc.data() });
        });

        res.json({ success: true, data: groups });
    } catch (error) {
        // If index is missing for orderBy, fallback to no order or handle error
        if (error.code === 9) { // FAILED_PRECONDITION (Index missing)
            const snapshot = await db.collection('chat_groups')
                .where('members', 'array-contains', userId)
                .get();
            const groups = [];
            snapshot.forEach(doc => {
                groups.push({ id: doc.id, ...doc.data() });
            });
            // Sort manually
            groups.sort((a, b) => (b.lastMessageTime?._seconds || 0) - (a.lastMessageTime?._seconds || 0));
            return res.json({ success: true, data: groups });
        }

        console.error('Error fetching groups:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Send a message
exports.sendMessage = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { senderId, senderName, content } = req.body;

        if (!content) {
            return res.status(400).json({ success: false, message: 'Message content required' });
        }

        const messageData = {
            senderId,
            senderName,
            content,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const groupRef = db.collection('chat_groups').doc(groupId);

        // Run as transaction to update last message on group
        await db.runTransaction(async (t) => {
            const groupDoc = await t.get(groupRef);
            if (!groupDoc.exists) {
                throw new Error('Group not found');
            }

            const messageRef = groupRef.collection('messages').doc();
            t.set(messageRef, messageData);

            t.update(groupRef, {
                lastMessage: content,
                lastMessageTime: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        res.status(201).json({ success: true, message: 'Message sent' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get messages for a group
exports.getMessages = async (req, res) => {
    try {
        const { groupId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const snapshot = await db.collection('chat_groups')
            .doc(groupId)
            .collection('messages')
            .orderBy('timestamp', 'asc') // or desc based on UI
            .limit(limit)
            .get();

        const messages = [];
        snapshot.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
        });

        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a group
exports.deleteGroup = async (req, res) => {
    try {
        const { groupId } = req.params;

        // Note: This only deletes the group document. Subcollections (messages) are NOT automatically deleted in Firestore.
        // For production, use recursive delete tools or cloud functions.
        // For now, we will delete the group doc, which hides it from the UI list effectively.

        await db.collection('chat_groups').doc(groupId).delete();

        res.json({ success: true, message: 'Group deleted' });
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
