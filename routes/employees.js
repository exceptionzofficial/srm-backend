const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');

// Verify employee ID exists (for mobile app registration)
router.post('/verify-id', async (req, res) => {
    try {
        const { employeeId } = req.body;

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required',
            });
        }

        const employee = await Employee.getEmployeeById(employeeId);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee ID not found. Please contact admin.',
            });
        }

        if (employee.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: 'Employee account is inactive.',
            });
        }

        // Check if face is already registered
        if (employee.faceId) {
            return res.status(400).json({
                success: false,
                message: 'Face already registered for this employee.',
                alreadyRegistered: true,
            });
        }

        res.json({
            success: true,
            message: 'Employee verified successfully',
            employee: {
                employeeId: employee.employeeId,
                name: employee.name,
                department: employee.department,
                designation: employee.designation,
            },
        });
    } catch (error) {
        console.error('Error verifying employee:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying employee',
        });
    }
});

// Get all employees
router.get('/', async (req, res) => {
    try {
        const employees = await Employee.getAllEmployees();
        res.json({
            success: true,
            employees,
        });
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching employees',
        });
    }
});

// Get employee by ID
router.get('/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const employee = await Employee.getEmployeeById(employeeId);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        res.json({
            success: true,
            employee,
        });
    } catch (error) {
        console.error('Error fetching employee:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching employee',
        });
    }
});

// Create new employee (admin only)
router.post('/', async (req, res) => {
    try {
        const { employeeId, name, email, phone, department, designation, branchId } = req.body;

        if (!employeeId || !name) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID and name are required',
            });
        }

        // Check if employee already exists
        const existing = await Employee.getEmployeeById(employeeId);
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID already exists',
            });
        }

        const employee = await Employee.createEmployee({
            employeeId,
            name,
            email,
            phone,
            department,
            designation,
            branchId, // Add branchId to employee creation
        });

        res.status(201).json({
            success: true,
            message: 'Employee created successfully',
            employee,
        });
    } catch (error) {
        console.error('Error creating employee:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating employee',
        });
    }
});

// Update employee
router.put('/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const updates = req.body;

        const existing = await Employee.getEmployeeById(employeeId);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        const employee = await Employee.updateEmployee(employeeId, updates);
        res.json({
            success: true,
            message: 'Employee updated successfully',
            employee,
        });
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating employee',
        });
    }
});

// Delete employee
router.delete('/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;

        const existing = await Employee.getEmployeeById(employeeId);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        await Employee.deleteEmployee(employeeId);
        res.json({
            success: true,
            message: 'Employee deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting employee',
        });
    }
});

module.exports = router;
