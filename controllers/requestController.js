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

        if (type === 'LEAVE') {
            const { leaveType } = data; // 'Casual Leave', 'Medical Leave', etc.
            if (!leaveType) return res.status(400).json({ success: false, message: 'Leave type required' });

            // Fetch latest employee data to ensure we have current balances
            let employee = await Employee.getEmployeeById(employeeId);
            if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

            let balanceObj = (employee.leaveBalances || []).find(l => l.type === leaveType);

            // Auto-initialize standard leave types if missing (Migration for old records)
            const isStandardType = ['Casual Leave', 'Medical Leave'].includes(leaveType);
            if (!balanceObj && isStandardType) {
                console.log(`[Request] Auto-initializing missing leave type: ${leaveType} for ${employeeId}`);

                const newLeaveEntry = {
                    type: leaveType,
                    opening: 2, // New policy default
                    credit: 0,
                    used: 0,
                    balance: 2
                };

                // Add to balances
                const updatedBalances = [...(employee.leaveBalances || []), newLeaveEntry];

                // Update Employee in DB
                await Employee.updateEmployee(employeeId, { leaveBalances: updatedBalances });

                // Update local variable
                balanceObj = newLeaveEntry;

                // Update employee object locally (optional, but good for consistency if used later)
                employee.leaveBalances = updatedBalances;
            }

            // Check balance
            if (balanceObj) {
                if (balanceObj.balance <= 0) {
                    return res.status(400).json({ success: false, message: `Insufficient ${leaveType} balance.` });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    message: `Invalid leave type: '${leaveType}'. Available: ${(employee.leaveBalances || []).map(l => l.type).join(', ')}`
                });
            }
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
 * Get All Requests (with optional status and branch filter)
 */
async function getAllRequests(req, res) {
    try {
        const { status, branchId } = req.query;
        let requests = await Request.getAllRequests(status);

        // Fetch employee details first to check branch
        const requestsWithDetails = await Promise.all(requests.map(async (reqItem) => {
            try {
                const employee = await Employee.getEmployeeById(reqItem.employeeId);
                return {
                    ...reqItem,
                    employeeName: employee ? employee.name || `${employee.firstName} ${employee.lastName}` : 'Unknown',
                    department: employee ? employee.department : 'Unknown',
                    branchId: employee ? employee.branchId : null, // Add branchId explicitly
                    branch: employee ? employee.branchId : 'Unknown' // Keep existing mapping
                };
            } catch (e) {
                return reqItem;
            }
        }));

        // Filter by branchId if provided
        if (branchId) {
            // Note: Use requestsWithDetails because raw Request might not have branchId stored directly, 
            // though some might. Ideally Request model has it, but based on code above, we derived it.
            // Using the derived array for filtering.
            const filtered = requestsWithDetails.filter(r => r.branchId === branchId);
            return res.json({ success: true, requests: filtered });
        }

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

        // Fetch the request to check type
        // Note: Request model doesn't have getById exposed in 'Request.js' exports but updateRequestStatus logic in model updates it directly.
        // We need to fetch it first to do side effects.
        // Let's implement a quick getById or Scan.
        // Wait, Request.js doesn't export getById.
        // But we DO need to know what we are approving to deduct balance.
        // I'll scan or query all requests. Ideally Request.js should have getById.
        // I will modify Request.js to add getRequestById first, or just list all and find? No, inefficient.
        // Let's check Request.js again. It has updateRequestStatus.
        // I will trust that updateRequestStatus returns the updated Attributes, so I can check 'type' and 'data' from the return value?
        // updateRequestStatus returns 'ALL_NEW'.

        const updatedRequest = await Request.updateRequestStatus(requestId, status, hrId, rejectionReason);

        // Side Effects
        if (status === 'APPROVED' && updatedRequest) {
            if (updatedRequest.type === 'LEAVE') {
                const employeeId = updatedRequest.employeeId;
                const leaveType = updatedRequest.data?.leaveType;

                if (employeeId && leaveType) {
                    const employee = await Employee.getEmployeeById(employeeId);
                    if (employee && employee.leaveBalances) {
                        const newBalances = employee.leaveBalances.map(l => {
                            if (l.type === leaveType) {
                                return {
                                    ...l,
                                    used: (l.used || 0) + 1,
                                    balance: (l.balance || 0) - 1
                                };
                            }
                            return l;
                        });
                        await Employee.updateEmployee(employeeId, { leaveBalances: newBalances });
                    }
                }
            }
        }

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
