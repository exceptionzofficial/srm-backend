const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { RekognitionClient } = require('@aws-sdk/client-rekognition');
const { S3Client } = require('@aws-sdk/client-s3');

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

// S3 Client (for employee photo uploads)
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// S3 bucket name (reusing existing liveness bucket for employee photos)
const S3_EMPLOYEE_PHOTOS_BUCKET = process.env.AWS_LIVENESS_S3_BUCKET || 'srm-face-liveness-images';

module.exports = {
    dynamoClient,
    docClient,
    rekognitionClient,
    s3Client,
    S3_EMPLOYEE_PHOTOS_BUCKET,
};
