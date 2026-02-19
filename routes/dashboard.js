
const express = require('express');
const router = express.Router();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'ap-south-1' });
const docClient = DynamoDBDocumentClient.from(client);

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
    try {
        // 1. Get Total Employees
        const empCommand = new ScanCommand({
            TableName: 'SRM_Employees',
            Select: 'COUNT'
        });
        const empResult = await docClient.send(empCommand);
        const totalEmployees = empResult.Count || 0;

        // 2. Get Total Branches (Mocking for now if table doesn't exist, or scan if it does)
        // Assuming we might have a branches table or just counting managers
        const totalBranches = 4; // Mock for now

        // 3. Get Present Today (Mock or real query)
        // Real implementation would query Attendance table for today's date
        // For speed, let's return a mock or simple count
        const presentToday = 15; // Mock

        // 4. Total Salary (Mock)
        const totalSalary = 0; // Mock

        res.json({
            employees: totalEmployees,
            branches: totalBranches,
            presentToday: presentToday,
            totalSalary: totalSalary
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;
