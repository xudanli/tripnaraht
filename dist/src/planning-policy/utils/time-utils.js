"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hhmmToMin = hhmmToMin;
exports.minToHhmm = minToHhmm;
exports.isHoliday = isHoliday;
exports.isOpenAt = isOpenAt;
exports.latestEntryMin = latestEntryMin;
exports.calculateDistance = calculateDistance;
exports.dayOfWeekFromISO = dayOfWeekFromISO;
exports.withinTimeWindowForEvaluation = withinTimeWindowForEvaluation;
exports.getEntryDeadlineInfoForEvaluation = getEntryDeadlineInfoForEvaluation;
function hhmmToMin(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}
function minToHhmm(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
function isHoliday(dateISO) {
    const date = new Date(dateISO);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const fixedHolidays = [
        [1, 1],
        [12, 25],
    ];
    return fixedHolidays.some(([m, d]) => m === month && d === day);
}
function isOpenAt(oh, dayOfWeek, tMin, dateISO) {
    var _a;
    if (!oh)
        return true;
    if (dateISO && ((_a = oh.closedDates) === null || _a === void 0 ? void 0 : _a.includes(dateISO))) {
        return false;
    }
    const isHolidayToday = dateISO ? isHoliday(dateISO) : false;
    for (const window of oh.windows) {
        const startMin = hhmmToMin(window.start);
        const endMin = hhmmToMin(window.end);
        const inTimeRange = tMin >= startMin && tMin <= endMin;
        if (!inTimeRange)
            continue;
        if (window.holidayDates && dateISO) {
            if (window.holidayDates.includes(dateISO)) {
                return true;
            }
            continue;
        }
        if (window.holidaysOnly !== undefined) {
            if (window.holidaysOnly && !isHolidayToday) {
                continue;
            }
            if (!window.holidaysOnly && isHolidayToday) {
                continue;
            }
        }
        if (window.dayOfWeek !== undefined) {
            if (window.dayOfWeek === dayOfWeek) {
                return true;
            }
            continue;
        }
        return true;
    }
    return false;
}
function latestEntryMin(oh, dayOfWeek) {
    var _a;
    if (!oh)
        return undefined;
    if ((_a = oh.lastEntryByDay) === null || _a === void 0 ? void 0 : _a[dayOfWeek]) {
        return hhmmToMin(oh.lastEntryByDay[dayOfWeek]);
    }
    if (oh.lastEntry) {
        return hhmmToMin(oh.lastEntry);
    }
    return undefined;
}
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
function dayOfWeekFromISO(dateISO) {
    const date = new Date(dateISO);
    return date.getDay();
}
function isClosedOnDate(oh, dateISO) {
    var _a;
    if (!((_a = oh === null || oh === void 0 ? void 0 : oh.closedDates) === null || _a === void 0 ? void 0 : _a.length))
        return false;
    return oh.closedDates.includes(dateISO);
}
function applicableWindows(oh, dateISO, dayOfWeek, holiday) {
    var _a;
    if (!((_a = oh === null || oh === void 0 ? void 0 : oh.windows) === null || _a === void 0 ? void 0 : _a.length))
        return [];
    return oh.windows
        .filter((w) => {
        var _a;
        if ((_a = w.holidayDates) === null || _a === void 0 ? void 0 : _a.includes(dateISO)) {
            return true;
        }
        if (w.holidaysOnly === true) {
            return holiday;
        }
        const matchDow = w.dayOfWeek === undefined || w.dayOfWeek === dayOfWeek;
        return matchDow;
    })
        .map((w) => ({ start: w.start, end: w.end }));
}
function withinTimeWindowForEvaluation(args) {
    var _a;
    const { openingHours: oh, dateISO, dayOfWeek, arriveMin } = args;
    if (!oh) {
        return { ok: true, waitMin: 0, status: 'OPEN' };
    }
    if (isClosedOnDate(oh, dateISO)) {
        return { ok: false, waitMin: 0, reason: 'CLOSED_DATE' };
    }
    const holiday = (_a = args.holiday) !== null && _a !== void 0 ? _a : isHoliday(dateISO);
    const wins = applicableWindows(oh, dateISO, dayOfWeek, holiday);
    if (wins.length === 0) {
        return { ok: false, waitMin: 0, reason: 'NO_WINDOW_TODAY' };
    }
    const inWin = wins.find((w) => arriveMin >= hhmmToMin(w.start) && arriveMin <= hhmmToMin(w.end));
    if (inWin) {
        const entryMin = arriveMin;
        const lastEntry = latestEntryMin(oh, dayOfWeek);
        if (lastEntry !== undefined && entryMin > lastEntry) {
            return { ok: false, waitMin: 0, reason: 'MISSED_LAST_ENTRY' };
        }
        return { ok: true, waitMin: 0, status: 'OPEN' };
    }
    const nextStart = wins
        .map((w) => hhmmToMin(w.start))
        .filter((s) => s > arriveMin)
        .sort((a, b) => a - b)[0];
    if (nextStart === undefined) {
        return { ok: false, waitMin: 0, reason: 'CLOSED_REST_OF_DAY' };
    }
    const entryMin = nextStart;
    const lastEntry = latestEntryMin(oh, dayOfWeek);
    if (lastEntry !== undefined && entryMin > lastEntry) {
        return { ok: false, waitMin: 0, reason: 'MISSED_LAST_ENTRY' };
    }
    const waitMin = nextStart - arriveMin;
    if (waitMin > 180) {
        return { ok: false, waitMin: 0, reason: 'CLOSED_REST_OF_DAY' };
    }
    return { ok: true, waitMin, status: 'WAIT_NEXT_WINDOW' };
}
function getEntryDeadlineInfoForEvaluation(args) {
    var _a;
    const { openingHours: oh, dateISO, dayOfWeek, entryMin } = args;
    if (!oh) {
        return { entryMin };
    }
    const holiday = (_a = args.holiday) !== null && _a !== void 0 ? _a : isHoliday(dateISO);
    const wins = applicableWindows(oh, dateISO, dayOfWeek, holiday);
    const win = wins.find((w) => entryMin >= hhmmToMin(w.start) && entryMin <= hhmmToMin(w.end));
    const windowEndMin = win ? hhmmToMin(win.end) : undefined;
    const lastEntryMin = latestEntryMin(oh, dayOfWeek);
    let deadlineMin;
    if (lastEntryMin !== undefined && windowEndMin !== undefined) {
        deadlineMin = Math.min(lastEntryMin, windowEndMin);
    }
    else if (lastEntryMin !== undefined) {
        deadlineMin = lastEntryMin;
    }
    else {
        deadlineMin = windowEndMin;
    }
    return { entryMin, windowEndMin, lastEntryMin, deadlineMin };
}
//# sourceMappingURL=time-utils.js.map