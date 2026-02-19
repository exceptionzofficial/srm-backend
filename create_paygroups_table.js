require('dotenv').config();
const { CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { dynamoClient: client } = require('./config/aws');

const TABLE_NAME = process.env.DYNAMODB_PAYGROUPS_TABLE || 'srm-paygroups-table';

async function createPayGroupsTable() {
    const params = {
        TableName: TABLE_NAME,
        KeySchema: [
            { AttributeName: 'payGroupId', KeyType: 'HASH' } // Partition key
        ],
        AttributeDefinitions: [
            { AttributeName: 'payGroupId', AttributeType: 'S' }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        const command = new CreateTableCommand(params);
        const response = await client.send(command);
        console.log('✅ Pay Groups table created successfully:', response.TableDescription.TableName);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`⚠️ Table "${TABLE_NAME}" already exists.`);
        } else {
            console.error('❌ Error creating Pay Groups table:', error);
        }
    }
}

createPayGroupsTable();
