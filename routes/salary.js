const express = require('express');
const router = express.Router();
const Salary = require('../models/Salary');
const Employee = require('../models/Employee');
const Request = require('../models/Request');

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

// Calculate Payable Salary (Fixed - Approved Advances)
router.get('/calculate/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { month, year } = req.query; // Optional filters, default to current month

        const employee = await Employee.getEmployeeById(employeeId);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        const fixedSalary = employee.fixedSalary || 0;

        // Get all APPROVED ADVANCE requests
        // Optimization: In prod, filter by date range in DB query. Here filtering in memory.
        const allRequests = await Request.getRequestsByEmployee(employeeId);

        const now = new Date();
        const currentMonth = month ? parsInt(month) : now.getMonth() + 1; // 1-12
        const currentYear = year ? parseInt(year) : now.getFullYear();

        const approvedAdvances = allRequests.filter(req => {
            if (req.type !== 'ADVANCE' || req.status !== 'APPROVED') return false;
            // Check date (req.createdAt or req.data.date)
            // Assuming advance is deduced in the month it was requested/approved
            const reqDate = new Date(req.createdAt);
            return reqDate.getMonth() + 1 === currentMonth && reqDate.getFullYear() === currentYear;
        });

        const totalAdvance = approvedAdvances.reduce((sum, req) => {
            return sum + (parseFloat(req.data.amount) || 0);
        }, 0);

        const payableSalary = Math.max(0, fixedSalary - totalAdvance);

        res.json({
            success: true,
            employeeId,
            month: currentMonth,
            year: currentYear,
            fixedSalary,
            totalAdvance,
            payableSalary,
            advanceRequests: approvedAdvances
        });

    } catch (error) {
        console.error('Error calculating salary:', error);
        res.status(500).json({ success: false, message: 'Error calculating salary' });
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
