const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const Employee = require('../models/Employee');
const { s3Client, S3_EMPLOYEE_PHOTOS_BUCKET } = require('../config/aws');

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    },
});

// Verify employee ID exists (for mobile app registration)
router.post('/verify-id', async (req, res) => {
    try {
        const { employeeId, branchId } = req.body;

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

        // Verify Branch (if provided)
        if (branchId && employee.branchId && employee.branchId !== branchId) {
            return res.status(403).json({
                success: false,
                message: 'Employee not found in this branch.',
            });
        }

        // Check if face is already registered
        if (employee.faceId) {
            return res.status(400).json({
                success: false,
                message: 'Face already registered for this employee.',
                alreadyRegistered: true,
                employee: {
                    employeeId: employee.employeeId,
                    name: employee.name,
                    department: employee.department,
                    designation: employee.designation,
                    branchId: employee.branchId,
                    workMode: employee.workMode || 'OFFICE',
                    faceId: employee.faceId,
                },
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
                branchId: employee.branchId,
                workMode: employee.workMode || 'OFFICE',
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

// Create new employee (admin only) - with photo upload
router.post('/', upload.single('photo'), async (req, res) => {
    try {
        const { employeeId, name, email, phone, department, designation, branchId, workMode, panNumber, aadharNumber, joinedDate, bankAccount, ifscCode, uan, fixedSalary } = req.body;

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

        let photoUrl = null;

        // Upload photo to S3 if provided
        if (req.file) {
            const fileExtension = req.file.originalname.split('.').pop();
            const photoKey = `photos/${employeeId}-${uuidv4()}.${fileExtension}`;

            await s3Client.send(new PutObjectCommand({
                Bucket: S3_EMPLOYEE_PHOTOS_BUCKET,
                Key: photoKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            }));

            photoUrl = `https://${S3_EMPLOYEE_PHOTOS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${photoKey}`;
        }

        const employee = await Employee.createEmployee({
            employeeId,
            name,
            email,
            phone,
            department,
            designation,
            branchId,
            workMode,
            panNumber: panNumber || null,
            aadharNumber: aadharNumber || null,
            joinedDate: joinedDate || null,
            bankAccount: bankAccount || null,
            ifscCode: ifscCode || null,
            uan: uan || null,
            fixedSalary: fixedSalary || 0,
            photoUrl,
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

// Update employee - with photo upload
router.put('/:employeeId', upload.single('photo'), async (req, res) => {
    try {
        const { employeeId } = req.params;
        const updates = { ...req.body };

        const existing = await Employee.getEmployeeById(employeeId);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        // Upload new photo to S3 if provided
        if (req.file) {
            const fileExtension = req.file.originalname.split('.').pop();
            const photoKey = `photos/${employeeId}-${uuidv4()}.${fileExtension}`;

            await s3Client.send(new PutObjectCommand({
                Bucket: S3_EMPLOYEE_PHOTOS_BUCKET,
                Key: photoKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            }));

            updates.photoUrl = `https://${S3_EMPLOYEE_PHOTOS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${photoKey}`;
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
