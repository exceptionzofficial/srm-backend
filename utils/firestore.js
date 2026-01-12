const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let serviceAccount;

try {
    // Try to load the generic name first
    const keyPath = path.join(__dirname, '../gcp-service-account.json');
    if (fs.existsSync(keyPath)) {
        serviceAccount = require(keyPath);
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
