const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let serviceAccount;

try {
    // Try to load the generic name first
    const keyPath = path.join(__dirname, '../gcp-service-account.json');
    if (fs.existsSync(keyPath)) {
        serviceAccount = require(keyPath);
        console.log('✅ Loaded gcp-service-account.json from file');
    } else {
        console.log('ℹ️ gcp-service-account.json not found, checking environment...');
        if (process.env.GCP_SERVICE_ACCOUNT) {
            // Support Vercel Environment Variable
            console.log('✅ Found GCP_SERVICE_ACCOUNT in environment. Length:', process.env.GCP_SERVICE_ACCOUNT.length);
            try {
                serviceAccount = JSON.parse(process.env.GCP_SERVICE_ACCOUNT);
                console.log('✅ Successfully parsed GCP_SERVICE_ACCOUNT');
            } catch (e) {
                console.error('❌ Failed to parse GCP_SERVICE_ACCOUNT env var:', e.message);
            }
        } else {
            console.warn('⚠️ GCP_SERVICE_ACCOUNT environment variable is NOT set.');
        }
    }

    if (!serviceAccount) {
        console.warn('⚠️ Critical: No service account credentials found. Firestore will fail.');
    }
} catch (error) {
    console.error('Error loading service account:', error);
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔥 Firebase Admin Initialized');
}

const db = admin.firestore();

module.exports = { db, admin };
