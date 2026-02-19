const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, S3_EMPLOYEE_PHOTOS_BUCKET } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

/**
 * Upload a file buffer to S3
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Folder path in bucket (e.g., 'attendance/123')
 * @param {string} contentType - Mime type (default: image/jpeg)
 * @returns {Promise<string>} - Public URL of the uploaded file
 */
async function uploadFile(buffer, folder, contentType = 'image/jpeg') {
    try {
        const filename = `${uuidv4()}.jpg`;
        const key = `${folder}/${filename}`;

        const command = new PutObjectCommand({
            Bucket: S3_EMPLOYEE_PHOTOS_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            // ACL: 'public-read' // Only if bucket allows ACLs, otherwise use bucket policy
        });

        await s3Client.send(command);

        // Construct public URL (assuming bucket is public or behind CloudFront)
        // Adjust based on your actual S3 setup (Virtual-hosted-style vs Path-style)
        return `https://${S3_EMPLOYEE_PHOTOS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    } catch (error) {
        console.error('Error uploading to S3:', error);
        throw new Error('Failed to upload image to storage');
    }
}

module.exports = {
    uploadFile
};
