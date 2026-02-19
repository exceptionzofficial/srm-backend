const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const Employee = require('../models/Employee');
const Manager = require('../models/Manager');
const { s3Client, S3_EMPLOYEE_PHOTOS_BUCKET } = require('../config/aws');

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only image and PDF files are allowed'), false);
        }
    },
});

// Helper to upload file to S3
const uploadToS3 = async (file, folder, employeeId) => {
    const fileExtension = file.originalname.split('.').pop();
    const key = `${folder}/${employeeId}-${uuidv4()}.${fileExtension}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: S3_EMPLOYEE_PHOTOS_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
    }));

    return `https://${S3_EMPLOYEE_PHOTOS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

// Helper to parse JSON fields from FormData
const parseJsonFields = (body) => {
    const fields = ['statutoryDetails', 'bankDetails', 'academicQualifications', 'experienceDetails', 'familyDetails', 'leaveBalances', 'documents'];
    const parsed = { ...body };

    fields.forEach(field => {
        if (parsed[field] && typeof parsed[field] === 'string') {
            try {
                parsed[field] = JSON.parse(parsed[field]);
            } catch (e) {
                console.warn(`Failed to parse ${field}:`, e.message);
            }
        }
    });
    return parsed;
};

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
        const { branchId } = req.query; // Check for branchId in query params
        const employees = await Employee.getAllEmployees();

        // Filter by branch if branchId is provided
        let filteredEmployees = employees;
        if (branchId) {
            filteredEmployees = employees.filter(e => e.branchId === branchId);
        }

        // Also fetch managers if needed? For now, just employees as this is "Employee List"
        // If user wants managers listed, we can append them.
        // Let's assume this route is strictly for employees list.

        res.json({
            success: true,
            employees: filteredEmployees,
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
        let employee = await Employee.getEmployeeById(employeeId);

        if (!employee) {
            // Try finding in Managers
            const manager = await Manager.getManagerById(employeeId);
            if (manager) {
                employee = manager; // Treat as employee for response compatibility
                employee.isManager = true;
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'Employee/Manager not found',
                });
            }
        }

        res.json({
            success: true,
            employee,
        });
    } catch (error) {
        console.error('Error fetching employee:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching employee',
        });
    }
});

const cpUpload = upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'doc_aadhar', maxCount: 1 },
    { name: 'doc_pan', maxCount: 1 },
    { name: 'doc_marksheet', maxCount: 1 },
    { name: 'doc_license', maxCount: 1 }
]);

// Create new employee (admin only) - with multiple uploads
router.post('/', cpUpload, async (req, res) => {
    try {
        let employeeData = parseJsonFields(req.body);
        let { employeeId, name, email } = employeeData;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Name is required',
            });
        }

        // Check for Manager Role
        const managerRoles = ['BRANCH_MANAGER', 'CLUSTER_MANAGER', 'RETAIL_MANAGER', 'HR_ADMIN', 'FINANCE_ADMIN', 'LEGAL_ADMIN', 'PRODUCTION_ADMIN', 'QUALITY_ADMIN', 'SUPER_ADMIN'];
        const isManager = employeeData.role && managerRoles.includes(employeeData.role);

        // Auto-generate ID if not provided
        if (!employeeId) {
            const platformAccess = employeeData.platformAccess || 'Mobile';

            if (isManager) {
                employeeId = await Manager.generateNextId();
                employeeData.managerId = employeeId; // Set managerId
                employeeData.employeeId = employeeId; // Keep for compatibility
            } else {
                // For Kiosk employees, branchId is mandatory to associate them correctly
                if (platformAccess === 'Kiosk' && !employeeData.branchId) {
                    return res.status(400).json({
                        success: false,
                        message: 'Branch is required for Kiosk (Offline) employees',
                    });
                }
                employeeId = await Employee.generateNextId(platformAccess);
                employeeData.employeeId = employeeId;
            }
            console.log(`[Create] Auto-generated ID: ${employeeId} (Manager: ${isManager})`);
        } else {
            // Check if exists
            const existingEmp = await Employee.getEmployeeById(employeeId);
            const existingMgr = await Manager.getManagerById(employeeId);
            if (existingEmp || existingMgr) {
                return res.status(400).json({
                    success: false,
                    message: 'ID already exists',
                });
            }
            if (isManager) employeeData.managerId = employeeId;
        }

        // Auto-generate password for Managers
        if (isManager && !employeeData.password) {
            const randomPass = Math.random().toString(36).slice(-8);
            employeeData.password = randomPass;
            console.log(`[Create] Auto-generated password for Manager ${name} (${employeeData.role})`);
        }

        // Handle File Uploads
        const documents = employeeData.documents || {};

        if (req.files) {
            if (req.files['photo']) {
                employeeData.photoUrl = await uploadToS3(req.files['photo'][0], 'photos', employeeId);
                documents.photoUrl = employeeData.photoUrl;
            }
            if (req.files['doc_aadhar']) documents.aadharUrl = await uploadToS3(req.files['doc_aadhar'][0], 'documents', employeeId);
            if (req.files['doc_pan']) documents.panUrl = await uploadToS3(req.files['doc_pan'][0], 'documents', employeeId);
            if (req.files['doc_marksheet']) documents.marksheetUrl = await uploadToS3(req.files['doc_marksheet'][0], 'documents', employeeId);
            if (req.files['doc_license']) documents.licenseUrl = await uploadToS3(req.files['doc_license'][0], 'documents', employeeId);
        }

        employeeData.documents = documents;

        // Verify email OTP check (logic maintained)
        if (email) {
            const { isEmailVerified, clearVerification } = require('../utils/otpService');
            // Allow creating if it's explicitly marked as verified in payload (e.g. from previous steps) 
            // OR check the OTP service cache
            // For now, assuming OTP service check is sufficient
            const verified = await isEmailVerified(email);
            if (!verified) {
                // return res.status(403) ... (commented out for now as existing code had it, but in multi-step wizard user validates earlier)
                // Keeping it strict:
                return res.status(403).json({
                    success: false,
                    message: 'Email not verified. Please verify the email with OTP before creating employee.',
                    requiresVerification: true,
                });
            }
            // MARK AS PERMANENTLY VERIFIED
            employeeData.isEmailVerified = true;
        }

        let storedEntity;
        if (isManager) {
            storedEntity = await Manager.createManager(employeeData);
        } else {
            storedEntity = await Employee.createEmployee(employeeData);
        }

        if (email) {
            console.log(`[CreateEmployee] Processing email verification cleanup for: ${email}`);
            const { clearVerification } = require('../utils/otpService');
            await clearVerification(email);

            // Send Welcome Email with Credentials if password was provided (Manager creation)
            console.log(`[CreateEmployee] Checking for password to send welcome email. Password present: ${!!employeeData.password}`);
            if (employeeData.password) {
                console.log('[CreateEmployee] Password found, triggering sendWelcomeEmail...');
                console.log(`[CreateEmployee] Email details - Email: ${email}, Name: ${name}, Role: ${employeeData.role}`);
                const { sendWelcomeEmail } = require('../utils/emailService');

                // Send async, don't await strictly to safely return response
                sendWelcomeEmail({
                    email,
                    name,
                    employeeId,
                    password: employeeData.password,
                    role: employeeData.role || 'Employee'
                })
                    .then(result => console.log('[CreateEmployee] sendWelcomeEmail result:', result))
                    .catch(err => console.error('[CreateEmployee] Failed to send welcome email:', err));
            } else {
                console.log('[CreateEmployee] No password provided, skipping welcome email.');
            }
        } else {
            console.log('[CreateEmployee] No email provided, skipping email steps.');
        }

        res.status(201).json({
            success: true,
            message: 'Employee created successfully',
            employee: storedEntity,
        });
    } catch (error) {
        console.error('Error creating employee:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating employee',
        });
    }
});

// Update employee - with multiple uploads
router.put('/:employeeId', cpUpload, async (req, res) => {
    try {
        const { employeeId } = req.params;
        let updates = parseJsonFields(req.body);

        let employee;
        const isMgr = await Manager.getManagerById(employeeId);

        const existing = isMgr || await Employee.getEmployeeById(employeeId);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Employee/Manager not found',
            });
        }

        // Handle File Uploads
        const documents = updates.documents || existing.documents || {};

        if (req.files) {
            if (req.files['photo']) {
                updates.photoUrl = await uploadToS3(req.files['photo'][0], 'photos', employeeId);
                documents.photoUrl = updates.photoUrl;
            }
            if (req.files['doc_aadhar']) documents.aadharUrl = await uploadToS3(req.files['doc_aadhar'][0], 'documents', employeeId);
            if (req.files['doc_pan']) documents.panUrl = await uploadToS3(req.files['doc_pan'][0], 'documents', employeeId);
            if (req.files['doc_marksheet']) documents.marksheetUrl = await uploadToS3(req.files['doc_marksheet'][0], 'documents', employeeId);
            if (req.files['doc_license']) documents.licenseUrl = await uploadToS3(req.files['doc_license'][0], 'documents', employeeId);
        }

        updates.documents = documents;

        if (isMgr) {
            employee = await Manager.updateManager(employeeId, updates);
        } else {
            employee = await Employee.updateEmployee(employeeId, updates);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: 'Employee/Manager not found',
                });
            }
            employee = await Employee.updateEmployee(employeeId, updates);
        }
        res.json({
            success: true,
            message: 'Employee updated successfully',
            employee,
        });
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating employee',
        });
    }
});

// Delete employee
router.delete('/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;

        const isMgr = await Manager.getManagerById(employeeId);
        if (isMgr) {
            await Manager.deleteManager(employeeId);
        } else {
            const existing = await Employee.getEmployeeById(employeeId);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: 'Employee/Manager not found',
                });
            }
            await Employee.deleteEmployee(employeeId);
        }
        res.json({
            success: true,
            message: 'Employee deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error deleting employee',
        });
    }
});

module.exports = router;
