/**
 * Static Holiday Configuration for 2026
 * Format: 'YYYY-MM-DD': 'Holiday Name'
 */
const holidays2026 = {
    '2026-01-01': 'New Year',
    '2026-01-14': 'Pongal',
    '2026-01-15': 'Mattu Pongal',
    '2026-01-16': 'Kaanum Pongal',
    '2026-01-26': 'Republic Day',
    '2026-04-14': 'Tamil New Year',
    '2026-05-01': 'May Day',
    '2026-08-15': 'Independence Day',
    '2026-10-02': 'Gandhi Jayanti',
    '2026-10-20': 'Ayudha Pooja',
    '2026-10-21': 'Vijaya Dasami',
    '2026-11-08': 'Diwali',
    '2026-12-25': 'Christmas'
};

const getHolidayName = (dateStr) => {
    return holidays2026[dateStr] || null;
};

const isHoliday = (dateStr) => {
    return !!holidays2026[dateStr];
};

module.exports = {
    holidays2026,
    getHolidayName,
    isHoliday
};
