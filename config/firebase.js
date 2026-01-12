const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin with service account
try {
    // Look for the service account file in the root directory
    // The user provided filenames like srm-attendance-482409-72c8f04e23b8.json
    // We'll trust the specific filename we saw earlier or look for it
    const serviceAccount = require('../srm-attendance-482409-72c8f04e23b8.json');

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    console.log('Firebase Admin Initialized successfully');
} catch (error) {
    console.error('Error initializing Firebase Admin:', error);
}

const db = admin.firestore();

module.exports = { db, admin };
