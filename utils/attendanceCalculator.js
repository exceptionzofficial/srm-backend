/**
 * Calculate detailed daily attendance status
 * 
 * @param {Object} params
 * @param {Object} params.employee - Employee object
 * @param {Object} params.attendance - Attendance record for the day (can be null)
 * @param {Object} params.leave - Approved leave request (can be null)
 * @param {Object} params.permission - Approved permission request (can be null)
 * @param {Array} params.travel - Travel sessions for the day (can be empty)
 * @param {Object} params.settings - Global attendance settings
 * @param {string} params.date - Date string YYYY-MM-DD
 * @returns {Object} { status: [], remarks: string, stats: {} }
 */
function calculateDailyStatus({ employee, attendance, leave, permission, travel, settings, date }) {
    const statuses = [];
    const remarks = [];

    // Default Settings
    const workStartTime = settings.workStartTime || '09:00'; // HH:mm
    const workEndTime = settings.workEndTime || '19:00';   // HH:mm
    const lateThresholdMinutes = settings.lateThresholdMinutes || 555; // 9:15 AM
    const halfDayThresholdMinutes = settings.halfDayThresholdMinutes || 240; // 4 hours duration? or 12:00 PM?

    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay(); // 0 = Sunday

    // --- TRAVEL HANDLING ---
    let travelMinutes = 0;
    if (travel && travel.length > 0) {
        // Calculate total travel duration (minutes)
        travel.forEach(session => {
            if (session.startTime && session.endTime) {
                const start = new Date(session.startTime);
                const end = new Date(session.endTime);
                const durationMs = end - start;
                travelMinutes += Math.floor(durationMs / 60000);
            }
        });

        statuses.push('On Travel');
        remarks.push(`Travel: ${Math.floor(travelMinutes / 60)}h ${travelMinutes % 60}m`);
    }

    // 1. CHECK FOR WEEK OFF
    const isSunday = dayOfWeek === 0;
    if (isSunday) {
        // If they worked on Sunday, mark as "Overtime" or "Work on Week Off"
        if (attendance || travelMinutes > 0) {
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
        } else if (travelMinutes > 0) {
            statuses.push('Present (Travel on Leave)');
        } else {
            return { status: statuses, remarks: remarks.join(', '), color: 'orange' };
        }
    }

    // 3. CHECK FOR ABSENT
    // If no attendance AND no travel -> Absent
    if (!attendance && travelMinutes === 0) {
        // If not Sunday and not on Leave -> Absent
        if (!isSunday && !leave) {
            return { status: ['Absent'], remarks: 'No Check-in', color: 'red' };
        }
    }

    // --- IF WE ARE HERE, EMPLOYEE HAS ATTENDANCE RECORD OR TRAVEL ---

    let checkIn = null;
    let checkOut = null;
    let officeMinutes = 0;

    // Parse Times
    if (attendance) {
        checkIn = new Date(attendance.checkInTime);
        checkOut = attendance.checkOutTime ? new Date(attendance.checkOutTime) : null;

        if (checkOut) {
            const durationMs = checkOut - checkIn;
            officeMinutes = Math.floor(durationMs / 60000);
        }
    }

    const totalWorkMinutes = officeMinutes + travelMinutes;

    // Helper to get minutes from midnight
    const getMinutes = (d) => d.getHours() * 60 + d.getMinutes();

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

    // Determine First Event Time (Office Check-in OR Travel Start)
    let firstEventTime = checkIn;
    if (travel && travel.length > 0) {
        // Sort travel by start time to find earliest
        const sortedTravel = [...travel].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        const firstTravelStart = new Date(sortedTravel[0].startTime);
        if (!firstEventTime || firstTravelStart < firstEventTime) {
            firstEventTime = firstTravelStart;
        }
    }

    if (firstEventTime) {
        const firstEventMinutes = getMinutes(firstEventTime);

        if (firstEventMinutes > lateCutoff) {
            // LATE CHECK IN
            if (permission) {
                statuses.push('Permission in');
                remarks.push('Late entry permitted');
            } else {
                isLate = true;
                statuses.push('Late in');
            }

            // Check for Half Day In (if VERY late)
            if (firstEventMinutes > (settings.halfDayThresholdMinutes || 720)) {
                statuses.push('Half day in');
            }
        } else if (attendance && getMinutes(checkIn) < startMinutes - 30) {
            // EARLY IN (e.g. 30 mins before) - Only valid for Office Check-in usually
            statuses.push('Early in');
        }
    }

    // B. CHECK OUT STATUS / DURATION STATUS
    // If working in office and not checked out
    if (attendance && !checkOut) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (date !== todayStr) {
            statuses.push('Shift out punch not done');
        } else {
            const now = new Date();
            const nowMinutes = getMinutes(now);
            if (nowMinutes > endMinutes + 60) {
                statuses.push('Shift out punch not done');
            } else {
                statuses.push('Working');
            }
        }
    }

    // Evaluate Duration logic if session is closed OR if only Travel exists
    if (checkOut || (!attendance && travelMinutes > 0)) {
        const expectedDuration = endMinutes - startMinutes; // e.g. 600 mins

        if (attendance && checkOut) {
            const checkOutMinutes = getMinutes(checkOut);

            if (checkOutMinutes < endMinutes) {
                // If Total Work is also less than expected, it's Early Out
                if (totalWorkMinutes < (expectedDuration - 60)) {
                    if (!permission) statuses.push('Early out');
                }

                // Half Day Out Check
                if (totalWorkMinutes < 240) { // Less than 4 hours
                    statuses.push('Half day out');
                }
            } else if (checkOutMinutes > endMinutes + 30) {
                // LATE OUT (Overtime?)
                statuses.push('Late out');
            }
        } else if (!attendance && travelMinutes > 0) {
            // If only Travel
            if (totalWorkMinutes < 240) {
                statuses.push('Half day out');
            } else if (totalWorkMinutes < (expectedDuration - 60)) {
                if (!permission) statuses.push('Early out');
            }
        }
    }

    // Default to Present if just Late In or plain
    // Add 'Present' if not already tagged with a form of presence
    const presentTags = ['Present', 'Present (On Leave)', 'Present (Travel on Leave)'];
    const hasPresent = statuses.some(s => presentTags.includes(s));

    if (!hasPresent) {
        if (statuses.length === 0 ||
            (statuses.length === 1 && (statuses[0] === 'Early in' || statuses[0] === 'Late in' || statuses[0] === 'On Travel'))) {
            statuses.push('Present');
        }
        // If we have 'Late in', 'On Travel', etc. we trigger presence.
        if (statuses.length > 0 && !statuses.includes('Absent') && !statuses.includes('Shift out punch not done')) {
            statuses.push('Present');
        }
    }
    // Deduplicate 'Present'
    if (statuses.filter(s => s === 'Present').length > 1) {
        // ensure only one 'Present'
        const idx = statuses.indexOf('Present');
        statuses.splice(idx + 1);
    }


    // Color Coding
    let color = 'green';
    if (statuses.includes('Absent') || statuses.includes('Shift out punch not done')) color = 'red';
    if (statuses.includes('Late in') || statuses.includes('Early out') || statuses.includes('Half day in') || statuses.includes('Half day out')) color = 'orange';
    if (statuses.includes('Leave')) color = 'blue';

    return {
        status: [...new Set(statuses)], // Deduplicate
        remarks: remarks.join(', ') || (statuses.includes('Present') ? 'On Time' : ''),
        color,
        times: {
            in: attendance ? attendance.checkInTime : (travel && travel.length ? 'Travel Start' : '-'),
            out: attendance && attendance.checkOutTime ? attendance.checkOutTime : (travel && travel.length ? 'Travel End' : '-')
        },
        travelMinutes,
        totalWorkMinutes
    };
}

module.exports = { calculateDailyStatus };
