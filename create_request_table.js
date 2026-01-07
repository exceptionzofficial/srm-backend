const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
require('dotenv').config();

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const TABLE_NAME = process.env.DYNAMODB_REQUEST_TABLE || 'srm-request-table';

async function createTable() {
    try {
        // Check if exists
        const list = await client.send(new ListTablesCommand({}));
        if (list.TableNames.includes(TABLE_NAME)) {
            console.log(`Table ${TABLE_NAME} already exists.`);
            return;
        }

        console.log(`Creating table ${TABLE_NAME}...`);
        const command = new CreateTableCommand({
            TableName: TABLE_NAME,
            KeySchema: [
                { AttributeName: 'requestId', KeyType: 'HASH' } // Partition Key
            ],
            AttributeDefinitions: [
                { AttributeName: 'requestId', AttributeType: 'S' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        });

        await client.send(command);
        console.log('Table creation initiated. Please wait a moment.');
    } catch (e) {
        console.error('Error creating table:', e);
    }
}

createTable();
