"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpeningHoursUtil = void 0;
const luxon_1 = require("luxon");
class OpeningHoursUtil {
    static isOpenNow(hoursStr, timezone = 'Asia/Tokyo') {
        if (!hoursStr || hoursStr === 'Closed')
            return false;
        if (typeof hoursStr !== 'string') {
            if (Array.isArray(hoursStr)) {
                hoursStr = hoursStr[0];
            }
            else {
                hoursStr = String(hoursStr);
            }
        }
        if (hoursStr === 'Closed')
            return false;
        if (hoursStr === '24 Hours' || hoursStr === '24/7')
            return true;
        const now = luxon_1.DateTime.now().setZone(timezone);
        if (typeof hoursStr.split !== 'function') {
            return false;
        }
        const [startStr, endStr] = hoursStr.split('-');
        if (!startStr || !endStr)
            return false;
        const currentMinutes = now.hour * 60 + now.minute;
        const startMinutes = this.parseTimeToMinutes(startStr);
        let endMinutes = this.parseTimeToMinutes(endStr);
        if (endMinutes < startMinutes) {
            endMinutes += 24 * 60;
        }
        let checkTime = currentMinutes;
        if (checkTime < startMinutes && endMinutes > 24 * 60) {
            checkTime += 24 * 60;
        }
        return checkTime >= startMinutes && checkTime <= endMinutes;
    }
    static parseTimeToMinutes(timeStr) {
        const cleanStr = timeStr.trim();
        const parts = cleanStr.split(':');
        if (parts.length < 2)
            return 0;
        let hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1].split(' ')[0], 10) || 0;
        const ampm = cleanStr.toUpperCase();
        if (ampm.includes('PM') && hours !== 12) {
            hours += 12;
        }
        else if (ampm.includes('AM') && hours === 12) {
            hours = 0;
        }
        return hours * 60 + minutes;
    }
    static getTodayHours(metadata, timezone = 'Asia/Tokyo') {
        if (!(metadata === null || metadata === void 0 ? void 0 : metadata.openingHours))
            return 'Closed';
        const now = luxon_1.DateTime.now().setZone(timezone);
        const dayKey = now.toFormat('ccc').toLowerCase();
        const hours = metadata.openingHours[dayKey];
        if (hours) {
            if (typeof hours === 'string') {
                return hours;
            }
            else if (Array.isArray(hours) && hours.length > 0) {
                return typeof hours[0] === 'string' ? hours[0] : String(hours[0]);
            }
            else {
                return String(hours);
            }
        }
        const isWeekend = now.weekday >= 6;
        const fallbackHours = isWeekend
            ? (metadata.openingHours.weekend || 'Closed')
            : (metadata.openingHours.weekday || 'Closed');
        if (typeof fallbackHours === 'string') {
            return fallbackHours;
        }
        else if (Array.isArray(fallbackHours) && fallbackHours.length > 0) {
            return typeof fallbackHours[0] === 'string' ? fallbackHours[0] : String(fallbackHours[0]);
        }
        else {
            return String(fallbackHours);
        }
    }
    static isOpenAt(hoursStr, checkDate, timezone = 'Asia/Tokyo') {
        if (!hoursStr || hoursStr === 'Closed')
            return false;
        if (typeof hoursStr !== 'string') {
            if (Array.isArray(hoursStr)) {
                hoursStr = hoursStr[0];
            }
            else {
                hoursStr = String(hoursStr);
            }
        }
        if (hoursStr === 'Closed')
            return false;
        if (hoursStr === '24 Hours' || hoursStr === '24/7')
            return true;
        const checkDateTime = luxon_1.DateTime.fromJSDate(checkDate).setZone(timezone);
        const dayKey = checkDateTime.toFormat('ccc').toLowerCase();
        if (typeof hoursStr.split !== 'function') {
            return false;
        }
        const [startStr, endStr] = hoursStr.split('-');
        if (!startStr || !endStr)
            return false;
        const checkMinutes = checkDateTime.hour * 60 + checkDateTime.minute;
        const startMinutes = this.parseTimeToMinutes(startStr);
        let endMinutes = this.parseTimeToMinutes(endStr);
        if (endMinutes < startMinutes) {
            endMinutes += 24 * 60;
        }
        let checkTime = checkMinutes;
        if (checkTime < startMinutes && endMinutes > 24 * 60) {
            checkTime += 24 * 60;
        }
        return checkTime >= startMinutes && checkTime <= endMinutes;
    }
    static getHoursForDate(metadata, checkDate, timezone = 'Asia/Tokyo') {
        if (!(metadata === null || metadata === void 0 ? void 0 : metadata.openingHours))
            return 'Closed';
        const checkDateTime = luxon_1.DateTime.fromJSDate(checkDate).setZone(timezone);
        const dayKey = checkDateTime.toFormat('ccc').toLowerCase();
        const hours = metadata.openingHours[dayKey];
        if (hours) {
            if (typeof hours === 'string') {
                return hours;
            }
            else if (Array.isArray(hours) && hours.length > 0) {
                return typeof hours[0] === 'string' ? hours[0] : String(hours[0]);
            }
            else {
                return String(hours);
            }
        }
        const isWeekend = checkDateTime.weekday >= 6;
        const fallbackHours = isWeekend
            ? (metadata.openingHours.weekend || 'Closed')
            : (metadata.openingHours.weekday || 'Closed');
        if (typeof fallbackHours === 'string') {
            return fallbackHours;
        }
        else if (Array.isArray(fallbackHours) && fallbackHours.length > 0) {
            return typeof fallbackHours[0] === 'string' ? fallbackHours[0] : String(fallbackHours[0]);
        }
        else {
            return String(fallbackHours);
        }
    }
}
exports.OpeningHoursUtil = OpeningHoursUtil;
//# sourceMappingURL=opening-hours.util.js.map