const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Explicit path to .env

// Helper to load model if not found
const Employee = require('../models/Employee');

const checkFace = async () => {
    try {
        console.log('Connecting to MongoDB...', process.env.MONGODB_URI ? 'URI Found' : 'URI Missing');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const employees = await Employee.find({}, { employeeId: 1, name: 1, faceId: 1 });

        console.log('--- Employee Face Registration Status ---');
        if (employees.length === 0) {
            console.log('No employees found in database.');
        }
        employees.forEach(e => {
            // Check if faceId exists and is not null/undefined/empty string
            const hasFace = e.faceId && e.faceId.trim().length > 0;
            console.log(`${e.employeeId} (${e.name}): ${hasFace ? '✅ Registered (' + e.faceId + ')' : '❌ Not Registered'}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected');
    }
};

checkFace();
