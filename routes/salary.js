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
        const currentMonth = month ? parseInt(month) : now.getMonth() + 1; // 1-12
        const currentYear = year ? parseInt(year) : now.getFullYear();

        const approvedAdvances = allRequests.filter(req => {
            if (req.type !== 'ADVANCE' || req.status !== 'APPROVED') return false;

            const reqDate = new Date(req.createdAt);
            const emiMonths = parseInt(req.data.emiMonths) || 1;
            const amount = parseFloat(req.data.amount) || 0;

            // Calculate month difference between requested date and calculation date
            const monthDiff = (currentYear - reqDate.getFullYear()) * 12 + (currentMonth - (reqDate.getMonth() + 1));

            // Repayment starts from the NEXT month
            // monthDiff 0: Month of request/approval (Skip)
            // monthDiff 1 to emiMonths: Repayment months
            return monthDiff >= 1 && monthDiff <= emiMonths;
        });

        const totalAdvanceDeduction = approvedAdvances.reduce((sum, req) => {
            const amount = parseFloat(req.data.amount) || 0;
            const emiMonths = parseInt(req.data.emiMonths) || 1;
            const installment = Math.ceil(amount / emiMonths);

            const reqDate = new Date(req.createdAt);
            const monthDiff = (currentYear - reqDate.getFullYear()) * 12 + (currentMonth - (reqDate.getMonth() + 1));

            // If it's the last month, handle the remainder
            if (monthDiff === emiMonths) {
                return sum + (amount - (installment * (emiMonths - 1)));
            }
            return sum + installment;
        }, 0);

        // Standard PF Calculation (12% of basic if eligible)
        let pfDeduction = 0;
        if (employee.isPfEligible && employee.fixedBasic) {
            pfDeduction = Math.round(employee.fixedBasic * 0.12);
        }

        res.json({
            success: true,
            employeeId,
            month: currentMonth,
            year: currentYear,
            fixedSalary: employee.fixedSalary || 0,
            components: {
                basic: employee.fixedBasic || 0,
                hra: employee.fixedHra || 0,
                conveyance: employee.fixedOtherAllowance || 0, // Fallback
                medical: 0,
                special: employee.fixedSplAllowance || 0,
                bonus: 0
            },
            deductions: {
                pf: pfDeduction,
                esi: employee.esiContribution || 0,
                pt: 0,
                tds: 0,
                advance: totalAdvanceDeduction
            },
            totalAdvance: totalAdvanceDeduction,
            pfDeduction,
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
