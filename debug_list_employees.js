require('dotenv').config();
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const run = async () => {
    try {
        const command = new ScanCommand({
            TableName: 'srm-employee-table',
        });
        const response = await client.send(command);
        const items = response.Items.map(item => unmarshall(item));

        console.log('--- ALL EMPLOYEES ---');
        items.forEach(e => {
            console.log(`Name: ${e.name}, ID: "${e.employeeId}", BranchID: "${e.branchId}"`);
        });
        console.log('---------------------');
    } catch (e) {
        console.error(e);
    }
};

run();
