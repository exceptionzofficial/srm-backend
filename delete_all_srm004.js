require('dotenv').config();
const { ListFacesCommand, DeleteFacesCommand } = require('@aws-sdk/client-rekognition');
const { rekognitionClient } = require('./config/aws');

const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID || 'srm-employees-faces';
const TARGET = 'SRM004';

async function deleteAll() {
    console.log(`Searching for ALL faces of ${TARGET}...`);
    let paginationToken = null;
    let foundIds = [];

    do {
        const command = new ListFacesCommand({
            CollectionId: COLLECTION_ID,
            MaxResults: 1000,
            NextToken: paginationToken
        });

        const response = await rekognitionClient.send(command);
        paginationToken = response.NextToken;

        const matches = response.Faces.filter(f => f.ExternalImageId === TARGET);
        matches.forEach(m => foundIds.push(m.FaceId));

    } while (paginationToken);

    if (foundIds.length > 0) {
        console.log(`FOUND ${foundIds.length} faces. Deleting...`);
        console.log(foundIds.join(', '));

        const deleteCommand = new DeleteFacesCommand({
            CollectionId: COLLECTION_ID,
            FaceIds: foundIds
        });

        await rekognitionClient.send(deleteCommand);
        console.log(`🎉 Successfully deleted ALL ${foundIds.length} faces for ${TARGET}.`);
    } else {
        console.log(`✅ No faces found for ${TARGET}. Clean.`);
    }
}

deleteAll();
