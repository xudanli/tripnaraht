"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertRoutePlanDraftToTripPlan = convertRoutePlanDraftToTripPlan;
function convertRoutePlanDraftToTripPlan(draft, world) {
    var _a;
    const days = [];
    const segmentsByDay = new Map();
    for (const segment of draft.segments) {
        const dayIndex = (_a = segment.dayIndex) !== null && _a !== void 0 ? _a : 0;
        if (!segmentsByDay.has(dayIndex)) {
            segmentsByDay.set(dayIndex, []);
        }
        segmentsByDay.get(dayIndex).push(segment);
    }
    let dayNumber = 1;
    for (const [dayIndex, segments] of segmentsByDay.entries()) {
        const timeSlots = [];
        for (const segment of segments) {
            const metadata = segment.metadata || {};
            const poiId = metadata.poiId || metadata.poi_id;
            const poiName = metadata.poiName || metadata.poi_name || 'Activity';
            if (poiId) {
                timeSlots.push({
                    id: `slot_${segment.segmentId}`,
                    time: metadata.startTime || '09:00',
                    endTime: metadata.endTime,
                    title: poiName,
                    type: 'sightseeing',
                    poiId: String(poiId),
                    coordinates: metadata.startLocation ? {
                        lat: metadata.startLocation.lat,
                        lng: metadata.startLocation.lng,
                    } : undefined,
                });
            }
        }
        const date = addDays(world.context.startDate, dayIndex);
        days.push({
            day: dayNumber++,
            date,
            timeSlots,
        });
    }
    return {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        days,
    };
}
function addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}
//# sourceMappingURL=plan-converter.js.map