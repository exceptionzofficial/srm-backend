const { CreateTableCommand } = require('@aws-sdk/client-dynamodb');
require('dotenv').config();
const { dynamoClient: client } = require('./config/aws');

const TABLE_NAME = process.env.DYNAMODB_MANAGER_TABLE || 'srm-manager-table';

async function createTable() {
    const params = {
        TableName: TABLE_NAME,
        KeySchema: [
            { AttributeName: 'managerId', KeyType: 'HASH' }, // Partition key
        ],
        AttributeDefinitions: [
            { AttributeName: 'managerId', AttributeType: 'S' },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
        },
    };

    try {
        const command = new CreateTableCommand(params);
        const response = await client.send(command);
        console.log('Table Created Successfully:', response.TableDescription.TableName);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`Table "${TABLE_NAME}" already exists.`);
        } else {
            console.error('Error creating table:', error);
        }
    }
}

createTable();
