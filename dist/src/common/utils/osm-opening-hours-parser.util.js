"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OsmOpeningHoursParser = void 0;
class OsmOpeningHoursParser {
    static parse(osmHours) {
        if (!osmHours || typeof osmHours !== 'string') {
            return undefined;
        }
        const trimmed = osmHours.trim();
        if (!trimmed) {
            return undefined;
        }
        if (trimmed === '24/7' || trimmed.toLowerCase() === '24 hours') {
            return {
                weekday: '24 Hours',
                weekend: '24 Hours',
                mon: '24 Hours',
                tue: '24 Hours',
                wed: '24 Hours',
                thu: '24 Hours',
                fri: '24 Hours',
                sat: '24 Hours',
                sun: '24 Hours',
                osmFormat: trimmed,
            };
        }
        const result = {
            osmFormat: trimmed,
        };
        const periods = trimmed.split(';').map(p => p.trim()).filter(p => p && !p.match(/^PH\s+(off|closed)$/i));
        for (const period of periods) {
            const parsed = this.parsePeriod(period);
            if (parsed) {
                Object.assign(result, parsed);
            }
        }
        if (!result.mon && !result.tue && !result.wed && !result.thu && !result.fri && !result.sat && !result.sun && !result.weekday && !result.weekend) {
            return undefined;
        }
        if (!result.weekday && result.mon && result.mon === result.tue && result.mon === result.wed && result.mon === result.thu && result.mon === result.fri) {
            result.weekday = result.mon;
        }
        if (!result.weekend && result.sat && result.sat === result.sun) {
            result.weekend = result.sat;
        }
        return result;
    }
    static parsePeriod(period) {
        const match = period.match(/^([^0-9]+)\s+(.+)$/);
        if (!match) {
            return null;
        }
        const daysStr = match[1].trim();
        const timeStr = match[2].trim();
        const timeRange = this.parseTimeRange(timeStr);
        if (!timeRange) {
            return null;
        }
        const days = this.parseDays(daysStr);
        if (days.length === 0) {
            return null;
        }
        const result = {};
        for (const day of days) {
            result[day] = timeRange;
        }
        return result;
    }
    static parseDays(daysStr) {
        const dayMap = {
            'mo': 'mon',
            'tu': 'tue',
            'we': 'wed',
            'th': 'thu',
            'fr': 'fri',
            'sa': 'sat',
            'su': 'sun',
        };
        const days = [];
        const upper = daysStr.toUpperCase();
        const rangeMatch = upper.match(/^([A-Z]{2})\s*-\s*([A-Z]{2})$/);
        if (rangeMatch) {
            const start = rangeMatch[1].toLowerCase();
            const end = rangeMatch[2].toLowerCase();
            if (dayMap[start] && dayMap[end]) {
                const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                const startIndex = dayOrder.indexOf(dayMap[start]);
                const endIndex = dayOrder.indexOf(dayMap[end]);
                if (startIndex !== -1 && endIndex !== -1) {
                    for (let i = startIndex; i <= endIndex; i++) {
                        days.push(dayOrder[i]);
                    }
                }
            }
            return days;
        }
        const parts = daysStr.split(',').map(p => p.trim().toLowerCase());
        for (const part of parts) {
            const day = dayMap[part];
            if (day && !days.includes(day)) {
                days.push(day);
            }
        }
        return days;
    }
    static parseTimeRange(timeStr) {
        const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
        if (match) {
            const startHour = parseInt(match[1], 10);
            const startMin = parseInt(match[2], 10);
            const endHour = parseInt(match[3], 10);
            const endMin = parseInt(match[4], 10);
            if (startHour >= 0 && startHour < 24 && startMin >= 0 && startMin < 60 &&
                endHour >= 0 && endHour < 24 && endMin >= 0 && endMin < 60) {
                return `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}-${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
            }
        }
        return null;
    }
}
exports.OsmOpeningHoursParser = OsmOpeningHoursParser;
//# sourceMappingURL=osm-opening-hours-parser.util.js.map