const { db, admin } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const COLLECTION_GROUPS = 'chat_groups';
const COLLECTION_MESSAGES = 'chat_messages';

/**
 * Create a new chat group
 */
async function createGroup(groupData) {
    const groupId = groupData.id || uuidv4();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Ensure admin is in members
    const members = groupData.members || [];
    if (!members.includes('hr-admin-1')) {
        members.push('hr-admin-1');
    }

    const groupRef = db.collection(COLLECTION_GROUPS).doc(groupId);

    const groupItem = {
        id: groupId,
        name: groupData.name,
        members: members,
        createdBy: groupData.createdBy,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastMessage: null,
        lastMessageTime: null,
        lastMessageSender: null
    };

    await groupRef.set(groupItem);

    // Return with ID (timestamp won't be resolved yet in return, but that's ok)
    return { ...groupItem, createdAt: new Date() };
}

/**
 * Get groups for a specific user
 */
async function getUserGroups(userId) {
    try {
        const snapshot = await db.collection(COLLECTION_GROUPS)
            .where('members', 'array-contains', userId)
            .orderBy('updatedAt', 'desc')
            .get();

        const groups = [];
        snapshot.forEach(doc => {
            groups.push(doc.data());
        });
        return groups;
    } catch (error) {
        console.error('Error fetching user groups:', error);
        throw error;
    }
}

/**
 * Get a single group by ID
 */
async function getGroupById(groupId) {
    const doc = await db.collection(COLLECTION_GROUPS).doc(groupId).get();
    return doc.exists ? doc.data() : null;
}

/**
 * Delete a group
 */
async function deleteGroup(groupId) {
    await db.collection(COLLECTION_GROUPS).doc(groupId).delete();

    // Optional: Delete messages for this group?
    // Firestore doesn't cascade delete automatically. 
    // For now, we leave messages orphaned or handle via background function.
    return { success: true };
}

/**
 * Send a message
 */
async function sendMessage(groupId, messageData) {
    const messageId = uuidv4();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const messageItem = {
        id: messageId,
        groupId: groupId,
        senderId: messageData.senderId,
        senderName: messageData.senderName,
        content: messageData.content,
        timestamp: timestamp
    };

    const batch = db.batch();

    // 1. Add message
    const messageRef = db.collection(COLLECTION_MESSAGES).doc(messageId);
    batch.set(messageRef, messageItem);

    // 2. Update group last message
    const groupRef = db.collection(COLLECTION_GROUPS).doc(groupId);
    batch.update(groupRef, {
        lastMessage: messageData.content,
        lastMessageTime: timestamp,
        lastMessageSender: messageData.senderName,
        updatedAt: timestamp
    });

    await batch.commit();

    return { ...messageItem, timestamp: new Date() };
}

/**
 * Get messages for a group
 */
async function getMessages(groupId) {
    try {
        const snapshot = await db.collection(COLLECTION_MESSAGES)
            .where('groupId', '==', groupId)
            .orderBy('timestamp', 'asc')
            .get();

        const messages = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Convert Firestore Timestamp to JS Date/Object if needed, 
            // but usually we pass it as is and frontend handles ._seconds
            messages.push(data);
        });
        return messages;
    } catch (error) {
        console.error('Error getting messages:', error);
        throw error;
    }
}

module.exports = {
    createGroup,
    getUserGroups,
    getGroupById,
    deleteGroup,
    sendMessage,
    getMessages
};
