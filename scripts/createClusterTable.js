require('dotenv').config();
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const tableName = process.env.DYNAMODB_CLUSTERS_TABLE || 'srm-clusters-table';

const tableParams = {
    TableName: tableName,
    AttributeDefinitions: [
        { AttributeName: 'clusterId', AttributeType: 'S' }
    ],
    KeySchema: [
        { AttributeName: 'clusterId', KeyType: 'HASH' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
};

async function createTable() {
    try {
        console.log(`Checking if table ${tableName} exists...`);
        await client.send(new DescribeTableCommand({ TableName: tableName }));
        console.log(`Table ${tableName} already exists.\n`);
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            console.log(`Creating table ${tableName}...`);
            const command = new CreateTableCommand(tableParams);
            await client.send(command);
            console.log(`Table ${tableName} created successfully.\n`);
        } else {
            console.error(`Error with table ${tableName}:`, error.message);
        }
    }
}

createTable().then(() => console.log('Setup complete.'));
