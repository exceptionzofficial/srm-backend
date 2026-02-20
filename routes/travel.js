const express = require('express');
const router = express.Router();
const travelController = require('../controllers/travelController');

// Start Travel
router.post('/start', travelController.startTravel);

// End Travel
router.post('/end', travelController.endTravel);

// Get Active Session
router.get('/active/:employeeId', travelController.getActiveSession);

module.exports = router;
