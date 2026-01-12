const { GetCommand, PutCommand, ScanCommand, UpdateCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const GROUPS_TABLE = process.env.DYNAMODB_CHAT_GROUPS_TABLE || 'srm-chat-groups';
const MESSAGES_TABLE = process.env.DYNAMODB_CHAT_MESSAGES_TABLE || 'srm-chat-messages';

/**
 * Create a new chat group
 */
async function createGroup(groupData) {
    const timestamp = new Date().toISOString();
    const groupId = groupData.id || uuidv4();

    // Ensure admin is in members
    const members = groupData.members || [];
    if (!members.includes('hr-admin-1')) {
        members.push('hr-admin-1');
    }

    const item = {
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

    const command = new PutCommand({
        TableName: GROUPS_TABLE,
        Item: item,
    });

    await docClient.send(command);
    return item;
}

/**
 * Get groups for a specific user
 */
async function getUserGroups(userId) {
    // START: Inefficient Scan (Improve with GSI later)
    // Scanning all groups and filtering by member inclusion
    const command = new ScanCommand({
        TableName: GROUPS_TABLE,
    });

    const response = await docClient.send(command);
    const allGroups = response.Items || [];

    // Filter groups where userId is in members
    return allGroups.filter(group => Array.isArray(group.members) && group.members.includes(userId));
}

/**
 * Get a single group by ID
 */
async function getGroupById(groupId) {
    const command = new GetCommand({
        TableName: GROUPS_TABLE,
        Key: { id: groupId },
    });

    const response = await docClient.send(command);
    return response.Item;
}

/**
 * Delete a group
 */
async function deleteGroup(groupId) {
    const command = new DeleteCommand({
        TableName: GROUPS_TABLE,
        Key: { id: groupId },
    });

    await docClient.send(command);
    return { success: true };
}

/**
 * Send a message
 */
async function sendMessage(groupId, messageData) {
    const timestamp = new Date().toISOString(); // DynamoDB stores as string usually
    const messageId = uuidv4();

    const messageItem = {
        id: messageId,
        groupId: groupId,
        senderId: messageData.senderId,
        senderName: messageData.senderName,
        content: messageData.content,
        timestamp: timestamp,
        // Some frontends expect _seconds (Firebase style), but we'll stick to ISO for Dynamo and convert on retrieval if needed
        // Or we can store epoch seconds if that's what the frontend expects.
        // The frontend code showed `timestamp._seconds`.
        // We'll store standard ISO string for now, but return object with _seconds if needed.
    };

    const command = new PutCommand({
        TableName: MESSAGES_TABLE,
        Item: messageItem,
    });

    await docClient.send(command);

    // Update group's last message
    const updateGroupCommand = new UpdateCommand({
        TableName: GROUPS_TABLE,
        Key: { id: groupId },
        UpdateExpression: 'SET lastMessage = :msg, lastMessageTime = :time, lastMessageSender = :sender',
        ExpressionAttributeValues: {
            ':msg': messageData.content,
            ':time': timestamp,
            ':sender': messageData.senderName
        }
    });

    await docClient.send(updateGroupCommand);

    return messageItem;
}

/**
 * Get messages for a group
 */
async function getMessages(groupId) {
    // Assuming GSI on groupId for messages table
    // If no GSI, we have to Scan (bad practice but works for small data)
    // Let's assume Scan with Filter for now to be safe without schema knowledge

    // BETTER: Query if Partition Key is groupId (or if using GSI)
    // If MESSAGES_TABLE has PK as id, we can't Query by groupId easily without GSI.
    // We will use Scan with Filter for simplicity in this "fix".

    const command = new ScanCommand({
        TableName: MESSAGES_TABLE,
        FilterExpression: 'groupId = :gid',
        ExpressionAttributeValues: {
            ':gid': groupId
        }
    });

    const response = await docClient.send(command);
    const items = response.Items || [];

    // Sort by timestamp
    return items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

module.exports = {
    createGroup,
    getUserGroups,
    getGroupById,
    deleteGroup,
    sendMessage,
    getMessages
};
