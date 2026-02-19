require('dotenv').config();
const { CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { dynamoClient: client } = require('./config/aws');

const TABLE_NAME = process.env.DYNAMODB_OTP_TABLE || 'srm-otp-table';

async function createOTPTable() {
    console.log(`Creating table: ${TABLE_NAME}...`);
    const params = {
        TableName: TABLE_NAME,
        KeySchema: [
            { AttributeName: 'identifier', KeyType: 'HASH' } // Partition key (email or phone)
        ],
        AttributeDefinitions: [
            { AttributeName: 'identifier', AttributeType: 'S' }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        const command = new CreateTableCommand(params);
        const response = await client.send(command);
        console.log('✅ OTP table created successfully:', response.TableDescription.TableName);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`⚠️ Table "${TABLE_NAME}" already exists.`);
        } else {
            console.error('❌ Error creating OTP table:', error);
        }
    }
}

createOTPTable();
