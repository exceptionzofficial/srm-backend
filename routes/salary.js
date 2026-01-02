
const express = require('express');
const router = express.Router();
const Salary = require('../models/Salary');
const Employee = require('../models/Employee');

// Create a new salary record
router.post('/', async (req, res) => {
    try {
        const salaryData = req.body;

        // Validate employee exists
        if (salaryData.employeeId) {
            const exists = await Employee.employeeExists(salaryData.employeeId);
            if (!exists) {
                return res.status(404).json({ error: 'Employee not found' });
            }
        }

        const newSalary = await Salary.createSalary(salaryData);
        res.status(201).json(newSalary);
    } catch (error) {
        console.error('Error creating salary:', error);
        res.status(500).json({ error: 'Failed to create salary record' });
    }
});

// Get salaries by employee ID
router.get('/employee/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const salaries = await Salary.getSalariesByEmployeeId(employeeId);
        res.json(salaries);
    } catch (error) {
        console.error('Error fetching salaries:', error);
        res.status(500).json({ error: 'Failed to fetch salaries' });
    }
});

// Update salary record
router.put('/:salaryId', async (req, res) => {
    try {
        const { salaryId } = req.params;
        const updates = req.body;
        const updatedSalary = await Salary.updateSalary(salaryId, updates);
        res.json(updatedSalary);
    } catch (error) {
        console.error('Error updating salary:', error);
        res.status(500).json({ error: 'Failed to update salary record' });
    }
});

module.exports = router;
