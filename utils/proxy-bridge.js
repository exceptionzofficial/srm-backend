/**
 * eSSL ADMS Proxy Bridge
 * This script runs on a local PC (Windows/Mac/Linux) to help older eSSL machines
 * communicate with the Vercel HTTPS backend.
 */
const express = require('express');
const axios = require('axios');
const app = express();

const PORT = 8081; // Local port for the machine to connect to
const REMOTE_SERVER = 'https://srm-backend-lake.vercel.app'; // Your Vercel URL

// Middleware to capture the raw body from eSSL device
app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.all('/iclock/*', async (req, res) => {
    const remoteUrl = `${REMOTE_SERVER}${req.originalUrl}`;
    console.log(`[Bridge] ${req.method} ${req.originalUrl} -> ${remoteUrl}`);

    try {
        const response = await axios({
            method: req.method,
            url: remoteUrl,
            data: req.body,
            headers: {
                ...req.headers,
                host: 'srm-backend-lake.vercel.app',
            },
            validateStatus: () => true, // Handle all status codes
        });

        // Forward the response back to the machine
        res.status(response.status).send(response.data);
    } catch (error) {
        console.error(`[Bridge Error]`, error.message);
        res.status(500).send('Bridge Error');
    }
});

// For older devices that use ADMS.php or other endpoints
app.get('/', (req, res) => res.send('SRM Proxy Bridge is Active'));

app.listen(PORT, '0.0.0.0', () => {
    console.log('----------------------------------------------------');
    console.log('🚀 SRM BIOMETRIC BRIDGE IS RUNNING');
    console.log(`📡 Local Port: ${PORT}`);
    console.log(`🔗 Target: ${REMOTE_SERVER}`);
    console.log('----------------------------------------------------');
    console.log('\n👉 DIRECTIONS:');
    console.log('1. Find your Computer\'s Local IP (Run "ipconfig" in cmd)');
    console.log('2. On the eSSL Machine, set "Server IP" to your Computer\'s IP');
    console.log(`3. Set "Server Port" to ${PORT}`);
    console.log('4. Ensure "Enable Domain Name" is OFF on the machine');
});
