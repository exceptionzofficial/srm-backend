const { CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { dynamoClient } = require('./config/aws');

const GROUPS_TABLE = process.env.DYNAMODB_CHAT_GROUPS_TABLE || 'srm-chat-groups';
const MESSAGES_TABLE = process.env.DYNAMODB_CHAT_MESSAGES_TABLE || 'srm-chat-messages';

const createGroupsTable = async () => {
    const command = new CreateTableCommand({
        TableName: GROUPS_TABLE,
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' }, // Partition key
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
        },
    });

    try {
        await dynamoClient.send(command);
        console.log(`Created table: ${GROUPS_TABLE}`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`Table ${GROUPS_TABLE} already exists`);
        } else {
            console.error(`Error creating ${GROUPS_TABLE}:`, error);
        }
    }
};

const createMessagesTable = async () => {
    const command = new CreateTableCommand({
        TableName: MESSAGES_TABLE,
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' },
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            // We might want a GSI on groupId later for efficient querying, but skipping for MVP to match model logic
            // The model uses Scan with Filter for now, or we can add GSI here.
            // Let's add a GSI for groupId to make getMessages efficient (Model change would be needed to use Query instead of Scan)
            { AttributeName: 'groupId', AttributeType: 'S' },
            { AttributeName: 'timestamp', AttributeType: 'S' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'GroupIdIndex',
                KeySchema: [
                    { AttributeName: 'groupId', KeyType: 'HASH' },
                    { AttributeName: 'timestamp', KeyType: 'RANGE' }
                ],
                Projection: {
                    ProjectionType: 'ALL',
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5,
                }
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
        },
    });

    try {
        await dynamoClient.send(command);
        console.log(`Created table: ${MESSAGES_TABLE}`);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`Table ${MESSAGES_TABLE} already exists`);
        } else {
            console.error(`Error creating ${MESSAGES_TABLE}:`, error);
        }
    }
};

const main = async () => {
    console.log('Creating Chat Tables...');
    await createGroupsTable();
    await createMessagesTable();
    console.log('Done.');
};

main();
