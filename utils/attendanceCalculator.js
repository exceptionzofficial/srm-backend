/**
 * Calculate detailed daily attendance status
 * 
 * @param {Object} params
 * @param {Object} params.employee - Employee object
 * @param {Object} params.attendance - Attendance record for the day (can be null)
 * @param {Object} params.leave - Approved leave request (can be null)
 * @param {Object} params.permission - Approved permission request (can be null)
 * @param {Object} params.settings - Global attendance settings
 * @param {string} params.date - Date string YYYY-MM-DD
 * @returns {Object} { status: [], remarks: string, stats: {} }
 */
function calculateDailyStatus({ employee, attendance, leave, permission, settings, date }) {
    const statuses = [];
    const remarks = [];

    // Default Settings
    const workStartTime = settings.workStartTime || '09:00'; // HH:mm
    const workEndTime = settings.workEndTime || '18:00';   // HH:mm
    const lateThresholdMinutes = settings.lateThresholdMinutes || 555; // 9:15 AM
    const halfDayThresholdMinutes = settings.halfDayThresholdMinutes || 240; // 4 hours duration? or 12:00 PM?
    // Let's interpret halfDayThreshold as "Minimum minutes worked to be considered Full Day" or "Max minutes late to be Present"
    // Usually it's duration based or cutoff time based.
    // Based on previous `Attendance.js`: lateThreshold = 555 (9:15), halfDay = 720 (12:00checkin)
    // New requirement list implies multiple tags.

    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay(); // 0 = Sunday

    // 1. CHECK FOR WEEK OFF
    const isSunday = dayOfWeek === 0;
    if (isSunday) {
        // If they worked on Sunday, mark as "Overtime" or "Work on Week Off"
        if (attendance) {
            statuses.push('Week off worked');
        } else {
            return { status: ['Week off'], remarks: 'Sunday Holiday', color: 'gray' };
        }
    }

    // 2. CHECK FOR LEAVE
    if (leave) {
        statuses.push('Leave');
        if (leave.data && leave.data.leaveType) {
            remarks.push(leave.data.leaveType);
        }
        // If they checked in while on leave?
        if (attendance) {
            statuses.push('Present (On Leave)');
        } else {
            return { status: statuses, remarks: remarks.join(', '), color: 'orange' };
        }
    }

    // 3. CHECK FOR ABSENT
    if (!attendance) {
        // If not Sunday and not on Leave -> Absent
        if (!isSunday && !leave) {
            return { status: ['Absent'], remarks: 'No Check-in', color: 'red' };
        }
    }

    // --- IF WE ARE HERE, EMPLOYEE HAS ATTENDANCE RECORD ---

    // Parse Times
    const checkIn = new Date(attendance.checkInTime);
    const checkOut = attendance.checkOutTime ? new Date(attendance.checkOutTime) : null;

    // Helper to get minutes from midnight
    const getMinutes = (d) => d.getHours() * 60 + d.getMinutes();

    const checkInMinutes = getMinutes(checkIn);

    // Parse Work Start/End
    const [startH, startM] = workStartTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;

    const [endH, endM] = workEndTime.split(':').map(Number);
    const endMinutes = endH * 60 + endM;

    // Grace Period (e.g. 15 mins) - implied from lateThreshold (9:00 -> 9:15 = 15 mins)
    const graceMinutes = 15;
    const lateCutoff = startMinutes + graceMinutes;

    // A. CHECK IN STATUS
    let isLate = false;

    if (checkInMinutes > lateCutoff) {
        // LATE CHECK IN
        if (permission) {
            statuses.push('Permission in');
            remarks.push('Late entry permitted');
        } else {
            isLate = true;
            statuses.push('Late in');
        }

        // Check for Half Day In (if VERY late)
        // e.g. if checked in after 1:00 PM (13:00 = 780)
        // using halfDayThresholdMinutes from settings (e.g., 720 = 12:00 PM)
        if (checkInMinutes > (settings.halfDayThresholdMinutes || 720)) {
            statuses.push('Half day in');
        }
    } else if (checkInMinutes < startMinutes - 30) {
        // EARLY IN (e.g. 30 mins before)
        statuses.push('Early in');
    }

    // B. CHECK OUT STATUS
    if (!checkOut) {
        // No checkout yet
        // If the date is TODAY, they might still be working.
        // If the date is PAST, then "Shift out punch not done"
        const todayStr = new Date().toISOString().split('T')[0];
        if (date !== todayStr) {
            statuses.push('Shift out punch not done');
        } else {
            // It's today. verify if shift is over.
            const now = new Date();
            const nowMinutes = getMinutes(now);
            if (nowMinutes > endMinutes + 60) {
                statuses.push('Shift out punch not done'); // 1 hour past shift end and still no punch
            } else {
                statuses.push('Working');
            }
        }
    } else {
        const checkOutMinutes = getMinutes(checkOut);

        if (checkOutMinutes < endMinutes) {
            // EARLY OUT
            if (permission) {
                // Check if permission covers early out? Assuming generic permission for now.
                // Ideally split permissions into 'LATE_ENTRY' vs 'EARLY_EXIT'
                // For now, if permission exists, we might be lenient, but user requested 'Permission in'.
                // Let's just mark Early Out unless we want to be smart.
                statuses.push('Early out');
            } else {
                statuses.push('Early out');
            }

            // Check for Half Day Out (if VERY early)
            // e.g. worked less than 4 hours?
            const durationMinutes = (checkOut - checkIn) / (1000 * 60);
            if (durationMinutes < 240) { // Less than 4 hours
                statuses.push('Half day out');
            }

        } else if (checkOutMinutes > endMinutes + 30) {
            // LATE OUT (Overtime?)
            statuses.push('Late out');
        }
    }

    // Default to Present if just Late In or plain
    if (statuses.length === 0 || (statuses.length === 1 && statuses[0] === 'Early in')) {
        statuses.push('Present');
    }

    // Color Coding
    let color = 'green';
    if (statuses.includes('Absent') || statuses.includes('Shift out punch not done')) color = 'red';
    if (statuses.includes('Late in') || statuses.includes('Early out') || statuses.includes('Half day in') || statuses.includes('Half day out')) color = 'orange';
    if (statuses.includes('Leave')) color = 'blue';

    return {
        status: statuses,
        remarks: remarks.join(', ') || (statuses.includes('Present') ? 'On Time' : ''),
        color,
        times: {
            in: new Date(attendance.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            out: attendance.checkOutTime ? new Date(attendance.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'
        }
    };
}

module.exports = { calculateDailyStatus };
