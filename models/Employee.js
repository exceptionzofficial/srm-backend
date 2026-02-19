const { GetCommand, PutCommand, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/aws');

const TABLE_NAME = process.env.DYNAMODB_EMPLOYEE_TABLE || 'srm-employee-table';

/**
 * Get employee by ID
 */
async function getEmployeeById(employeeId) {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { employeeId },
    });

    const response = await docClient.send(command);
    return response.Item;
}

/**
 * Get employee by Email
 */
async function getEmployeeByEmail(email) {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'email = :email OR personalEmail = :email',
        ExpressionAttributeValues: {
            ':email': email
        }
    });

    const response = await docClient.send(command);
    return response.Items && response.Items.length > 0 ? response.Items[0] : null;
}

/**
 * Check if employee exists
 */
async function employeeExists(employeeId) {
    const employee = await getEmployeeById(employeeId);
    return !!employee;
}

/**
 * Create new employee
 */
async function createEmployee(employeeData) {
    const timestamp = new Date().toISOString();
    const item = {
        ...employeeData,
        faceId: null,
        status: employeeData.status || 'active',
        workMode: employeeData.workMode || 'OFFICE',
        platformAccess: employeeData.platformAccess || 'Mobile',
        fixedSalary: employeeData.fixedSalary ? (parseFloat(employeeData.fixedSalary) || 0) : 0,
        role: employeeData.role || 'EMPLOYEE',

        // Identity & Work
        paygroup: employeeData.paygroup || null,
        branchId: employeeData.branchId || null,
        firstName: employeeData.firstName || null,
        middleName: employeeData.middleName || null,
        lastName: employeeData.lastName || null,
        gender: employeeData.gender || null,
        fatherName: employeeData.fatherName || null,
        dob: employeeData.dob || null,
        designation: employeeData.designation || null,
        department: employeeData.department || null,

        // Nature of Work
        natureOfWork: employeeData.natureOfWork || 'non-travel', // travel, non-travel
        geoFencingEnabled: employeeData.geoFencingEnabled === true || employeeData.geoFencingEnabled === 'true',

        // Employment Details
        joinedDate: employeeData.joinedDate || null,
        employeeType: employeeData.employeeType || 'full-time', // seasonal, department, full-time, part-time, shift
        residenceLocation: employeeData.residenceLocation || null, // { lat, lng } or string address

        // Statutory & Compliance
        isPfEligible: employeeData.isPfEligible === true || employeeData.isPfEligible === 'true',
        statutoryDetails: {
            pfNumber: employeeData.statutoryDetails?.pfNumber || null,
            esiNumber: employeeData.statutoryDetails?.esiNumber || null,
            panNumber: employeeData.statutoryDetails?.panNumber || employeeData.panNumber || null,
            aadharNumber: employeeData.statutoryDetails?.aadharNumber || employeeData.aadharNumber || null,
            uanNumber: employeeData.statutoryDetails?.uanNumber || null,
            pfAppStatus: employeeData.statutoryDetails?.pfAppStatus || null, // Form 6 status
            otherHrDocs: employeeData.statutoryDetails?.otherHrDocs || null
        },

        // Bank Details
        bankDetails: {
            bankName: employeeData.bankDetails?.bankName || null,
            accountNumber: employeeData.bankDetails?.accountNumber || null,
            ifscCode: employeeData.bankDetails?.ifscCode || null,
            paymentMode: employeeData.bankDetails?.paymentMode || 'Account Transfer',
        },

        // Academic Qualification (Array of objects)
        academicQualifications: employeeData.academicQualifications || [],
        // e.g., [{ degree: 'B.Tech', college: 'SRM', percentage: '85', yearOfPassing: '2023' }]

        // Experience (Array of objects)
        experienceDetails: employeeData.experienceDetails || [],
        // e.g., [{ organization: 'ABC', designation: 'Dev', fromDate: '', toDate: '', yearsExp: 2, ctc: '' }]

        // Personal & Family
        familyDetails: {
            guardianName: employeeData.familyDetails?.guardianName || null,
            personalMobile: employeeData.familyDetails?.personalMobile || employeeData.phone || null,
            personalEmail: employeeData.familyDetails?.personalEmail || employeeData.email || null,
            isMobileVerified: employeeData.familyDetails?.isMobileVerified || false,
            address: employeeData.familyDetails?.address || null,
            bloodGroup: employeeData.familyDetails?.bloodGroup || null,
            maritalStatus: employeeData.familyDetails?.maritalStatus || null,
            numbChildren: employeeData.familyDetails?.numbChildren || 0,
            isPhysicallyChallenged: employeeData.familyDetails?.isPhysicallyChallenged || false,
            passportNumber: employeeData.familyDetails?.passportNumber || null,
            drivingLicenseNumber: employeeData.familyDetails?.drivingLicenseNumber || null,
        },

        // Document URLs
        documents: {
            aadharUrl: employeeData.documents?.aadharUrl || null,
            panUrl: employeeData.documents?.panUrl || null,
            marksheetUrl: employeeData.documents?.marksheetUrl || null,
            licenseUrl: employeeData.documents?.licenseUrl || null,
            photoUrl: employeeData.documents?.photoUrl || employeeData.photoUrl || null,
        },

        // Salary Breakdown (Keeping existing flat structure for backward compatibility if needed, but syncing with object)
        fixedBasic: employeeData.fixedBasic ? (parseFloat(employeeData.fixedBasic) || 0) : 0,
        fixedHra: employeeData.fixedHra ? (parseFloat(employeeData.fixedHra) || 0) : 0,
        fixedSplAllowance: employeeData.fixedSplAllowance ? (parseFloat(employeeData.fixedSplAllowance) || 0) : 0,
        fixedDa: employeeData.fixedDa ? (parseFloat(employeeData.fixedDa) || 0) : 0,
        fixedOtherAllowance: employeeData.fixedOtherAllowance ? (parseFloat(employeeData.fixedOtherAllowance) || 0) : 0,
        fixedGross: employeeData.fixedGross ? (parseFloat(employeeData.fixedGross) || 0) : 0,
        agp: employeeData.agp ? (parseFloat(employeeData.agp) || 0) : 0,
        pfContribution: employeeData.pfContribution ? (parseFloat(employeeData.pfContribution) || 0) : 0,
        esiContribution: employeeData.esiContribution ? (parseFloat(employeeData.esiContribution) || 0) : 0,

        // Legacy/Master Fields
        grade: employeeData.grade || null,
        costCentre: employeeData.costCentre || null,
        taxDeductionPlace: employeeData.taxDeductionPlace || null,
        reportingManager: employeeData.reportingManager || null,
        jobResponsibility: employeeData.jobResponsibility || null,
        associateCode: employeeData.associateCode || employeeData.employeeId,

        // Attendance Stats
        leaveBalances: employeeData.leaveBalances || [
            { type: 'Medical Leave', opening: 2, credit: 0, used: 0, balance: 2 },
            { type: 'Comp Off', opening: 0, credit: 0, used: 0, balance: 0 },
            { type: 'Marriage Leave', opening: 0, credit: 0, used: 0, balance: 0 },
            { type: 'Casual Leave', opening: 2, credit: 0, used: 0, balance: 2 },
            { type: 'Loss of Pay', opening: 0, credit: 0, used: 0, balance: 0 }
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
    });

    await docClient.send(command);
    return item;
}

/**
 * Update employee
 */
async function updateEmployee(employeeId, updates) {
    const timestamp = new Date().toISOString();

    // Build update expression dynamically
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'employeeId') {
            updateExpressions.push(`#${key} = :${key}`);
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = value;
        }
    });

    // Always update updatedAt
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = timestamp;

    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { employeeId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
    });

    const response = await docClient.send(command);
    return response.Attributes;
}

/**
 * Update employee's face ID
 */
async function updateEmployeeFaceId(employeeId, faceId) {
    return updateEmployee(employeeId, { faceId });
}

/**
 * Get all employees
 */
async function getAllEmployees() {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
    });

    const response = await docClient.send(command);
    return response.Items || [];
}

/**
 * Delete employee
 */
async function deleteEmployee(employeeId) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { employeeId },
    });

    await docClient.send(command);
    return { success: true };
}

/**
 * Generate Next Employee ID
 * Pattern: SRM001, SRM002, etc. (Global)
 * Or SRMC001, SRMC002 (Kiosk/Offline)
 */
async function generateNextId(platformAccess = 'Mobile') {
    const prefix = platformAccess === 'Kiosk' ? 'SRMC' : 'SRM';

    // Scan all employees to find the highest ID with this prefix
    // Note: In production with many users, efficient counter approach is better (Atomic Counter)
    // For now, scan is acceptable for low volume.

    const command = new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'employeeId',
    });

    const response = await docClient.send(command);
    const items = response.Items || [];

    let maxId = 0;

    items.forEach(item => {
        if (item.employeeId && item.employeeId.startsWith(prefix)) {
            const numPart = parseInt(item.employeeId.replace(prefix, ''), 10);
            if (!isNaN(numPart) && numPart > maxId) {
                maxId = numPart;
            }
        }
    });

    const nextNum = maxId + 1;
    // Pad with leading zeros (e.g., 001, 010, 100)
    return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

module.exports = {
    getEmployeeById,
    getEmployeeByEmail,
    employeeExists,
    createEmployee,
    updateEmployee,
    updateEmployeeFaceId,
    getAllEmployees,
    deleteEmployee,
    generateNextId,
};
