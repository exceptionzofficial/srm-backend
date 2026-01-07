const Request = require('../models/Request');
const Employee = require('../models/Employee');

/**
 * Create a new Request
 */
async function createRequest(req, res) {
    try {
        const { employeeId, type, data } = req.body;

        if (!employeeId || !type) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Validate Request Type
        const allowedTypes = ['ADVANCE', 'LEAVE', 'PERMISSION'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid request type' });
        }

        // Check if employee exists
        const employeeExists = await Employee.employeeExists(employeeId);
        if (!employeeExists) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        const newRequest = await Request.createRequest({
            employeeId,
            type,
            data
        });

        res.status(201).json({ success: true, request: newRequest });
    } catch (error) {
        console.error('Error creating request:', error);
        res.status(500).json({ success: false, message: 'Error creating request' });
    }
}

/**
 * Get Requests by Employee ID
 */
async function getRequestsByEmployee(req, res) {
    try {
        const { employeeId } = req.params;
        const requests = await Request.getRequestsByEmployee(employeeId);
        res.json({ success: true, requests });
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ success: false, message: 'Error fetching requests' });
    }
}

/**
 * Get All Requests (with optional status filter)
 */
async function getAllRequests(req, res) {
    try {
        const { status } = req.query;
        const requests = await Request.getAllRequests(status);

        // Fetch employee details for each request to show name
        const requestsWithDetails = await Promise.all(requests.map(async (req) => {
            try {
                const employee = await Employee.getEmployeeById(req.employeeId);
                return {
                    ...req,
                    employeeName: employee ? employee.name : 'Unknown',
                    department: employee ? employee.department : 'Unknown',
                    branch: employee ? employee.branchId : 'Unknown'
                };
            } catch (e) {
                return req;
            }
        }));

        res.json({ success: true, requests: requestsWithDetails });
    } catch (error) {
        console.error('Error fetching all requests:', error);
        res.status(500).json({ success: false, message: 'Error fetching requests' });
    }
}

/**
 * Update Request Status (Approve/Reject)
 */
async function updateRequestStatus(req, res) {
    try {
        const { requestId } = req.params;
        const { status, hrId, rejectionReason } = req.body;

        if (!requestId || !status || !hrId) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        if (!['APPROVED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const updatedRequest = await Request.updateRequestStatus(requestId, status, hrId, rejectionReason);
        res.json({ success: true, request: updatedRequest });
    } catch (error) {
        console.error('Error updating request status:', error);
        res.status(500).json({ success: false, message: 'Error updating request status' });
    }
}

module.exports = {
    createRequest,
    getRequestsByEmployee,
    getAllRequests,
    updateRequestStatus
};
