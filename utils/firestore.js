const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let serviceAccount;

try {
    // Try to load the generic name first
    const keyPath = path.join(__dirname, '../gcp-service-account.json');
    if (fs.existsSync(keyPath)) {
        serviceAccount = require(keyPath);
    } else if (process.env.GCP_SERVICE_ACCOUNT) {
        // Support Vercel Environment Variable
        try {
            serviceAccount = JSON.parse(process.env.GCP_SERVICE_ACCOUNT);
            console.log('Using GCP_SERVICE_ACCOUNT from environment');
        } catch (e) {
            console.error('Failed to parse GCP_SERVICE_ACCOUNT env var', e);
        }
    } else {
        // Fallback or explicit check for other known keys if needed
        // For now, we expect gcp-service-account.json or we'll warn
        console.warn('⚠️  gcp-service-account.json not found in root. Firestore may not connect.');
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
