require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const employeeRoutes = require('./routes/employees');
const faceRoutes = require('./routes/face');
const attendanceRoutes = require('./routes/attendance');
const settingsRoutes = require('./routes/settings');
const locationRoutes = require('./routes/location');
const branchRoutes = require('./routes/branches');
const livenessRoutes = require('./routes/liveness');
const biometricRoutes = require('./routes/biometric');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'https://srm-hr-portal.vercel.app',
    'https://srm-super-admin.vercel.app',
    'https://srm-finance-portal.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow all origins as requested
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Raw text parser for biometric device logs
app.use('/iclock/cdata', express.raw({ type: '*/*', limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/employees', employeeRoutes);
app.use('/api/face', faceRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/requests', require('./routes/requests'));
app.use('/api/branches', branchRoutes);
app.use('/api/liveness', livenessRoutes);
app.use('/api/salary', require('./routes/salary'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/finance', require('./routes/finance')); // Finance & Funds
app.use('/api/otp', require('./routes/otp'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard')); // Dashboard Stats
app.use('/api/pay-groups', require('./routes/payGroups'));
app.use('/api/designations', require('./routes/designations'));
app.use('/api/travel', require('./routes/travel'));
app.use('/api/clusters', require('./routes/clusters'));
app.use('/iclock', biometricRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'SRM Sweets API is running' });
});

// 404 handler for undefined routes
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.url} not found`,
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);

    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
    });
});

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 SRM Sweets Backend running on http://localhost:${PORT}`);
    console.log(`📍 AWS Region: ${process.env.AWS_REGION}`);

    // Seed data
    const { seedPayGroups } = require('./utils/seedData');
    await seedPayGroups();
});

