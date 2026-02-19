require('dotenv').config();
const { ListFacesCommand } = require('@aws-sdk/client-rekognition');
const { rekognitionClient } = require('./config/aws');

const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID || 'srm-employees-faces';
const TARGET = 'SRM004';

async function findTarget() {
    console.log(`Searching for ${TARGET}...`);
    let paginationToken = null;
    let found = [];

    do {
        const command = new ListFacesCommand({
            CollectionId: COLLECTION_ID,
            MaxResults: 1000,
            NextToken: paginationToken
        });

        const response = await rekognitionClient.send(command);
        paginationToken = response.NextToken;

        const matches = response.Faces.filter(f => f.ExternalImageId === TARGET);
        if (matches.length > 0) {
            matches.forEach(m => found.push(m.FaceId));
        }

    } while (paginationToken);

    if (found.length > 0) {
        console.log(`FOUND ${found.length} faces for ${TARGET}:`);
        console.log(found.join(', '));
    } else {
        console.log(`NOT FOUND: ${TARGET} is not in the collection.`);
    }
}

findTarget();
