"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drdreBuildDaySchedule = drdreBuildDaySchedule;
const toMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};
const toTime = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
function isWithinOpening(c, date, startMin, endMin) {
    var _a;
    const oh = (_a = c.openingHours) === null || _a === void 0 ? void 0 : _a.find(x => x.date === date);
    if (!oh || oh.windows.length === 0)
        return true;
    return oh.windows.some(w => toMin(w.start) <= startMin && endMin <= toMin(w.end));
}
async function drdreBuildDaySchedule(state, input, candidates, getTravelLeg) {
    var _a, _b, _c;
    const dayStart = toMin(input.startTime);
    const dayEnd = toMin(input.endTime);
    const buffer = input.bufferMin;
    const remaining = candidates.slice();
    const priority = (c) => {
        var _a, _b, _c;
        const must = c.mustSee ? 1 : 0;
        const q = (_a = c.qualityScore) !== null && _a !== void 0 ? _a : 0.5;
        const inv = (_b = c.inventoryRisk) !== null && _b !== void 0 ? _b : 1;
        const riskWeight = ((_c = input.riskWeights) === null || _c === void 0 ? void 0 : _c.get(c.id)) || 0;
        const riskPenalty = riskWeight * 5;
        return must * 10 + q * 3 + inv * 0.5 - riskPenalty;
    };
    remaining.sort((a, b) => priority(b) - priority(a));
    let cursorMin = dayStart;
    let cursorPoint = input.startPoint;
    const slots = [];
    while (remaining.length > 0) {
        let pickedIdx = -1;
        let bestScore = -Infinity;
        let bestLeg;
        for (let i = 0; i < remaining.length; i++) {
            const c = remaining[i];
            if (!((_a = c.location) === null || _a === void 0 ? void 0 : _a.point))
                continue;
            const leg = cursorPoint
                ? await getTravelLeg(cursorPoint, c.location.point)
                : {
                    mode: state.context.travelModeDefault || 'unknown',
                    from: c.location.point,
                    to: c.location.point,
                    durationMin: 0,
                };
            const start = cursorMin + leg.durationMin + buffer;
            const end = start + c.durationMin;
            if (end > dayEnd)
                continue;
            if (!isWithinOpening(c, input.date, start, end))
                continue;
            const s = priority(c) * 5 - leg.durationMin * 0.2;
            if (s > bestScore) {
                bestScore = s;
                pickedIdx = i;
                bestLeg = leg;
            }
        }
        if (pickedIdx === -1)
            break;
        const c = remaining.splice(pickedIdx, 1)[0];
        const leg = bestLeg;
        const start = cursorMin + (leg.durationMin || 0) + buffer;
        const end = start + c.durationMin;
        const slot = {
            id: `slot_${input.date}_${start}`,
            time: toTime(start),
            endTime: toTime(end),
            title: c.name.zh || c.name.en || 'Activity',
            type: c.type,
            poiId: c.id,
            coordinates: (_b = c.location) === null || _b === void 0 ? void 0 : _b.point,
            travelLegFromPrev: leg.durationMin > 0 ? leg : undefined,
            priorityTag: c.mustSee ? 'core' : 'optional',
            reasons: [
                `Scheduled by DrDre: feasible window, travel=${leg.durationMin}min`,
            ],
        };
        slots.push(slot);
        cursorMin = end;
        cursorPoint = (_c = c.location) === null || _c === void 0 ? void 0 : _c.point;
    }
    return slots;
}
//# sourceMappingURL=drdre.js.map