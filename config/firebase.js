const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin with service account
try {
    let serviceAccount;

    // 1. Check for environment variables (Production/Vercel)
    // Priority: FIREBASE_SERVICE_ACCOUNT -> GCP_SERVICE_ACCOUNT -> GCP_SERVICE
    const envVar = process.env.FIREBASE_SERVICE_ACCOUNT ||
        process.env.GCP_SERVICE_ACCOUNT ||
        process.env.GCP_SERVICE;

    if (envVar) {
        try {
            serviceAccount = JSON.parse(envVar);
        } catch (e) {
            console.error('Error parsing service account env var:', e);
        }
    }

    // 2. Fallback to local file (Development) if env var is missing/failed
    if (!serviceAccount) {
        try {
            // Look for the service account file in the root directory
            serviceAccount = require('../srm-attendance-482409-72c8f04e23b8.json');
        } catch (e) {
            console.warn('Local service account file not found. If running on Vercel, ensure GCP_SERVICE_ACCOUNT env var is set.');
        }
    }

    if (serviceAccount) {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('Firebase Admin Initialized successfully');
        }
    } else {
        console.error('CRITICAL: Failed to initialize Firebase Admin. No credentials found in Env Vars or Local File.');
    }

} catch (error) {
    console.error('Error initializing Firebase Admin:', error);
}

// Export db safely - if init failed, this might throw, but at least we logged why above.
const db = admin.firestore();

module.exports = { db, admin };
