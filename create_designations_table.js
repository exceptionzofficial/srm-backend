/**
 * Script to create Designations table in DynamoDB
 */
require('dotenv').config();
const { CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { dynamoClient } = require('./config/aws');

const TABLE_NAME = process.env.DYNAMODB_DESIGNATIONS_TABLE || 'srm-designations-table';

async function createTable() {
    const params = {
        TableName: TABLE_NAME,
        KeySchema: [
            { AttributeName: 'designationId', KeyType: 'HASH' }, // Partition key
        ],
        AttributeDefinitions: [
            { AttributeName: 'designationId', AttributeType: 'S' },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
        },
    };

    try {
        const command = new CreateTableCommand(params);
        const data = await dynamoClient.send(command);
        console.log('Table Created:', data);
    } catch (err) {
        if (err.name === 'ResourceInUseException') {
            console.log('Table already exists');
        } else {
            console.error('Error creating table:', err);
        }
    }
}

createTable();
