const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { RekognitionClient } = require('@aws-sdk/client-rekognition');

// DynamoDB Client
const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// DynamoDB Document Client (higher-level abstraction)
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: {
        removeUndefinedValues: true,
    },
});

// Rekognition Client
const rekognitionClient = new RekognitionClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

module.exports = {
    dynamoClient,
    docClient,
    rekognitionClient,
};
