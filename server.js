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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
app.use('/api/otp', require('./routes/otp'));

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
app.listen(PORT, () => {
    console.log(`🚀 SRM Sweets Backend running on http://localhost:${PORT}`);
    console.log(`📍 AWS Region: ${process.env.AWS_REGION}`);
});

