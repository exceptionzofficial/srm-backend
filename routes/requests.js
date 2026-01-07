const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');

// Create a new request
router.post('/', requestController.createRequest);

// Get requests by employee ID
router.get('/employee/:employeeId', requestController.getRequestsByEmployee);

// Get all requests (admin/hr) - supports ?status=QUERY_PARAM
router.get('/', requestController.getAllRequests);

// Update request status (HR approve/reject)
router.put('/:requestId/status', requestController.updateRequestStatus);

module.exports = router;
