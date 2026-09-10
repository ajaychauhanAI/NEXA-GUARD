/**
 * Geolocation & Geofence Utility using Haversine formula
 */

/**
 * Calculates distance in meters between two coordinates [lat, lon]
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;

    const R = 6371e3; // Earth's radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) *
        Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
}

/**
 * Validates if coordinates are within the specified hostel geofence
 */
function isWithinGeofence(studentLat, studentLng, hostelLat, hostelLng, maxRadiusMeters = 150) {
    if (!studentLat || !studentLng) {
        return { isVerified: false, distance: null, reason: 'Coordinates not provided' };
    }

    const distance = calculateDistanceMeters(studentLat, studentLng, hostelLat, hostelLng);
    const isVerified = distance !== null && distance <= maxRadiusMeters;

    return {
        isVerified,
        distance,
        maxRadiusMeters,
        reason: isVerified ? 'Inside permitted geofence perimeter' : `Outside boundary by ${distance - maxRadiusMeters} meters`
    };
}

module.exports = {
    calculateDistanceMeters,
    isWithinGeofence
};
