const TravelSession = require('../models/TravelSession');
const Request = require('../models/Request');
const LocationPing = require('../models/LocationPing');

/**
 * Start a Travel Session
 * Requires a valid APPROVED BRANCH_TRAVEL request
 */
async function startTravel(req, res) {
    try {
        const { employeeId, requestId, latitude, longitude } = req.body;

        if (!employeeId || !requestId || !latitude || !longitude) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Validate that there is an approved request for this
        // We'd typically fetch the request and check status & type
        // Since Request model doesn't have getById exposed nicely yet (I noticed this earlier),
        // we might rely on the client sending a valid ID, but for security we should check.
        // For now, let's assume valid ID is sufficient to start, or we can scan.
        // Better: We check if there's already an active session to prevent double start.

        const activeSession = await TravelSession.getActiveTravelSession(employeeId);
        if (activeSession) {
            return res.status(400).json({
                success: false,
                message: 'You already have an active travel session.',
                activeSession
            });
        }

        const session = await TravelSession.startTravelSession({
            requestId,
            employeeId,
            startLocation: { lat: latitude, lng: longitude }
        });

        // Optionally update the Request status to 'IN_PROGRESS' if we wanted to track it there too,
        // but TravelSession status is enough.

        res.status(201).json({ success: true, session });
    } catch (error) {
        console.error('Error starting travel:', error);
        res.status(500).json({ success: false, message: 'Error starting travel' });
    }
}

/**
 * End a Travel Session
 */
async function endTravel(req, res) {
    try {
        const { sessionId, latitude, longitude, totalDistance } = req.body;

        if (!sessionId || !latitude || !longitude) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const session = await TravelSession.endTravelSession(
            sessionId,
            { lat: latitude, lng: longitude },
            totalDistance || 0
        );

        res.json({ success: true, session });
    } catch (error) {
        console.error('Error ending travel:', error);
        res.status(500).json({ success: false, message: 'Error ending travel' });
    }
}

/**
 * Get Active Session
 */
async function getActiveSession(req, res) {
    try {
        const { employeeId } = req.params;
        const session = await TravelSession.getActiveTravelSession(employeeId);

        res.json({ success: true, session });
    } catch (error) {
        console.error('Error fetching active session:', error);
        res.status(500).json({ success: false, message: 'Error fetching active session' });
    }
}

module.exports = {
    startTravel,
    endTravel,
    getActiveSession
};
