"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTimeToMinutes = parseTimeToMinutes;
exports.timeDiffMinutes = timeDiffMinutes;
exports.calculateDayDuration = calculateDayDuration;
exports.hasActivitiesOnDate = hasActivitiesOnDate;
exports.countActivities = countActivities;
exports.countHardNodes = countHardNodes;
exports.getHardNodeIds = getHardNodeIds;
exports.containsPoiId = containsPoiId;
exports.calculateTotalTravelTime = calculateTotalTravelTime;
exports.calculateTotalWalkTime = calculateTotalWalkTime;
function parseTimeToMinutes(time) {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
}
function timeDiffMinutes(start, end) {
    return parseTimeToMinutes(end) - parseTimeToMinutes(start);
}
function calculateDayDuration(dayStart, dayEnd) {
    return timeDiffMinutes(dayStart, dayEnd);
}
function hasActivitiesOnDate(plan, date) {
    const day = plan.days.find(d => d.date === date);
    if (!day)
        return false;
    return day.timeSlots.some(slot => slot.type !== 'transport' && slot.type !== 'rest');
}
function countActivities(plan) {
    let count = 0;
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.type !== 'transport' && slot.type !== 'rest') {
                count++;
            }
        }
    }
    return count;
}
function countHardNodes(plan) {
    let count = 0;
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.locked || slot.priorityTag === 'anchor') {
                count++;
            }
        }
    }
    return count;
}
function getHardNodeIds(plan) {
    const ids = new Set();
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if ((slot.locked || slot.priorityTag === 'anchor') && slot.poiId) {
                ids.add(slot.poiId);
            }
        }
    }
    return ids;
}
function containsPoiId(plan, poiId) {
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.poiId === poiId) {
                return true;
            }
        }
    }
    return false;
}
function calculateTotalTravelTime(plan) {
    let total = 0;
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.travelLegFromPrev) {
                total += slot.travelLegFromPrev.durationMin;
            }
        }
    }
    return total;
}
function calculateTotalWalkTime(plan) {
    let total = 0;
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.travelLegFromPrev && slot.travelLegFromPrev.mode === 'walk') {
                total += slot.travelLegFromPrev.durationMin;
            }
        }
    }
    return total;
}
//# sourceMappingURL=utils.js.map