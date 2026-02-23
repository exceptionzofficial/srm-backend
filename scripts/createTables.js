require('dotenv').config();
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const tables = [
    {
        TableName: process.env.DYNAMODB_TRAVEL_SESSION_TABLE || 'srm-travel-session-table',
        AttributeDefinitions: [{ AttributeName: 'sessionId', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'sessionId', KeyType: 'HASH' }],
    },
    {
        TableName: process.env.DYNAMODB_LOCATION_PINGS_TABLE || 'srm-location-pings-table',
        AttributeDefinitions: [{ AttributeName: 'pingId', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'pingId', KeyType: 'HASH' }],
    }
];

async function createTable(tableParams) {
    try {
        console.log(`Checking if table ${tableParams.TableName} exists...`);
        await client.send(new DescribeTableCommand({ TableName: tableParams.TableName }));
        console.log(`Table ${tableParams.TableName} already exists.\n`);
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            console.log(`Creating table ${tableParams.TableName}...`);
            const command = new CreateTableCommand({
                ...tableParams,
                BillingMode: 'PAY_PER_REQUEST'
            });
            await client.send(command);
            console.log(`Table ${tableParams.TableName} created successfully.\n`);
        } else {
            console.error(`Error with table ${tableParams.TableName}:`, error.message);
        }
    }
}

async function run() {
    for (const table of tables) {
        await createTable(table);
    }
    console.log('Setup complete.');
}

run();
