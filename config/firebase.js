const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin with service account
try {
    let serviceAccount;

    // 1. Check for environment variable (Production/Vercel)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch (e) {
            console.error('Error parsing FIREBASE_SERVICE_ACCOUNT env var:', e);
        }
    }

    // 2. Fallback to local file (Development) if env var is missing or failed
    if (!serviceAccount) {
        try {
            // Look for the service account file in the root directory
            serviceAccount = require('../srm-attendance-482409-72c8f04e23b8.json');
        } catch (e) {
            console.warn('Local service account file not found. If running on Vercel, ensure FIREBASE_SERVICE_ACCOUNT env var is set.');
        }
    }

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin Initialized successfully');
    } else {
        console.error('Failed to initialize Firebase Admin: No credentials found.');
    }

} catch (error) {
    console.error('Error initializing Firebase Admin:', error);
}

const db = admin.firestore();

module.exports = { db, admin };
