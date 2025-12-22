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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'SRM Sweets API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: err.message || 'Internal server error',
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 SRM Sweets Backend running on http://localhost:${PORT}`);
    console.log(`📍 AWS Region: ${process.env.AWS_REGION}`);
});
