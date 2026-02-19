const { db, admin } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const COLLECTION_FUND_REQUESTS = 'fund_requests';

/**
 * Create a Fund Request
 */
async function createFundRequest(data) {
    const id = uuidv4();
    const timestamp = new Date().toISOString();

    const request = {
        id,
        requesterId: data.requesterId,
        requesterName: data.requesterName,
        requesterRole: data.requesterRole, // 'EMPLOYEE' or 'BRANCH_MANAGER'
        amount: parseFloat(data.amount),
        reason: data.reason,
        status: 'PENDING', // PENDING, APPROVED, REJECTED, FORWARDED_TO_MD
        previousStandings: data.previousStandings || false, // true if they have debt

        // Approval Chain Details
        approvedBy: null,
        rejectedBy: null,
        forwardedTo: null, // 'BRANCH_MANAGER', 'MD', 'SUPER_ADMIN'

        createdAt: timestamp,
        updatedAt: timestamp
    };

    // Auto-Approval Logic Check (Can be done here or in controller)
    // Rule: < 10000 AND No Previous Standings -> CFO Approval (or Auto if configured)
    // For now, we set it to PENDING, and let the Controller decide if it's "Ready for CFO" or "Needs Forwarding"
    // Actually, let's refine status.

    if (request.amount < 10000 && !request.previousStandings) {
        request.currentHandler = 'CFO'; // Direct to CFO
    } else {
        request.currentHandler = 'BRANCH_MANAGER'; // Needs escalation if from Employee
        if (data.requesterRole === 'BRANCH_MANAGER') {
            request.currentHandler = 'MD'; // If BM asks, goes to MD
        }
    }

    await db.collection(COLLECTION_FUND_REQUESTS).doc(id).set(request);
    return request;
}

/**
 * Get Requests by Handler (e.g., pending for CFO)
 */
async function getRequestsByHandler(handlerRole) {
    const snapshot = await db.collection(COLLECTION_FUND_REQUESTS)
        .where('currentHandler', '==', handlerRole)
        .where('status', '==', 'PENDING')
        .get();

    const requests = [];
    snapshot.forEach(doc => requests.push(doc.data()));
    return requests;
}

/**
 * Update Request Status
 */
async function updateRequestStatus(id, status, updates = {}) {
    await db.collection(COLLECTION_FUND_REQUESTS).doc(id).update({
        status,
        updatedAt: new Date().toISOString(),
        ...updates
    });
    return { id, status, ...updates };
}

module.exports = {
    createFundRequest,
    getRequestsByHandler,
    updateRequestStatus
};
