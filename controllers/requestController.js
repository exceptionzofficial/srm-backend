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
        const allowedTypes = ['ADVANCE', 'LEAVE', 'PERMISSION', 'BRANCH_TRAVEL'];
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
        let requests;

        // "PENDING" in UI should cover all pending stages
        if (status === 'PENDING') {
            const allRequests = await Request.getAllRequests(null);
            requests = allRequests.filter(r =>
                ['PENDING', 'PENDING_MANAGER', 'PENDING_HR', 'PENDING_FINANCE', 'PENDING_SUPER_ADMIN'].includes(r.status)
            );
        } else {
            requests = await Request.getAllRequests(status);
        }

        // Fetch employee details first to check branch
        const requestsWithDetails = await Promise.all(requests.map(async (reqItem) => {
            try {
                const employee = await Employee.getEmployeeById(reqItem.employeeId);
                const hasPending = reqItem.type === 'ADVANCE' ? await Request.hasPendingAdvance(reqItem.employeeId) : false;

                return {
                    ...reqItem,
                    employeeName: employee ? employee.name || `${employee.firstName} ${employee.lastName}` : 'Unknown',
                    department: employee ? employee.department : 'Unknown',
                    branchId: employee ? employee.branchId : null,
                    branch: employee ? employee.branchId : 'Unknown',
                    hasOtherPending: hasPending // Flag for UI
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

        if (!['APPROVED', 'REJECTED', 'PENDING_HR', 'PENDING_SUPER_ADMIN', 'PENDING_FINANCE'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        // Check if actionBy is provided (renamed from hrId to support manager)
        const actionBy = req.body.actionBy || req.body.hrId || req.body.managerId;
        if (!actionBy) {
            return res.status(400).json({ success: false, message: 'Missing actionBy/hrId/managerId' });
        }

        // Fetch the request to check type and data for workflow logic
        const existingRequest = await Request.getRequestById(requestId);
        if (!existingRequest) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        let targetStatus = status;

        // Custom Workflow Logic for ADVANCE requests
        if (existingRequest.type === 'ADVANCE' && status === 'APPROVED') {
            const amount = existingRequest.data?.amount || 0;
            const employeeId = existingRequest.employeeId;

            // Finance Manager Approving
            if (actionBy.toLowerCase().includes('finance')) {
                const hasPending = await Request.hasPendingAdvance(employeeId);
                // The current request is already in the pending list, but hasPendingAdvance checks for OTHER existing ones too.
                // Wait, hasPendingAdvance will find THIS request too if its status is PENDING_FINANCE.
                // We should check if there are OTHER requests.
                // Let's refine hasPendingAdvance or check count.

                // Let's assume the user means "any other approved/pending advance"
                if (amount > 10000 || hasPending) {
                    targetStatus = 'PENDING_SUPER_ADMIN';
                } else {
                    targetStatus = 'PENDING_HR';
                }
            }
            // Super Admin Permitting
            else if (actionBy.toLowerCase().includes('super')) {
                targetStatus = 'PENDING_HR';
            }
            // HR Final Approval
            else if (actionBy.toLowerCase().includes('hr')) {
                targetStatus = 'APPROVED';
            }
        }

        const updatedRequest = await Request.updateRequestStatus(requestId, targetStatus, actionBy, rejectionReason);

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
