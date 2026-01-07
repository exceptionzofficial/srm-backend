require('dotenv').config();

console.log('Checking Environment Variables:');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'Loaded' : 'MISSING');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'Loaded' : 'MISSING');
console.log('AWS_REGION:', process.env.AWS_REGION ? 'Loaded' : 'MISSING');
console.log('DYNAMODB_REQUEST_TABLE:', process.env.DYNAMODB_REQUEST_TABLE ? 'Loaded (' + process.env.DYNAMODB_REQUEST_TABLE + ')' : 'MISSING');
