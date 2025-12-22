/**
 * Geo-fence utility functions
 * Calculates distance and validates if location is within allowed radius
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

/**
 * Check if user location is within geo-fence
 * @param {number} userLat - User's latitude
 * @param {number} userLng - User's longitude
 * @param {number} officeLat - Office latitude
 * @param {number} officeLng - Office longitude
 * @param {number} radiusMeters - Allowed radius in meters
 * @returns {object} { isWithin: boolean, distance: number }
 */
function isWithinGeofence(userLat, userLng, officeLat, officeLng, radiusMeters) {
    const distance = calculateDistance(userLat, userLng, officeLat, officeLng);
    return {
        isWithin: distance <= radiusMeters,
        distance: Math.round(distance),
        allowedRadius: radiusMeters,
    };
}

module.exports = {
    calculateDistance,
    isWithinGeofence,
};
