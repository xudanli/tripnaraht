"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.neptuneRepairPlan = neptuneRepairPlan;
function slotViolates(state, date, slot, riskWeights) {
    const violations = [];
    const alerts = state.signals.alerts || [];
    const hasCriticalWeather = alerts.some(a => a.severity === 'critical');
    if (hasCriticalWeather &&
        slot.type !== 'hotel' &&
        slot.type !== 'transport') {
        violations.push({
            code: 'WEATHER',
            date,
            slotId: slot.id,
            details: { message: 'critical weather alert' },
        });
    }
    if (slot.poiId && riskWeights) {
        const riskWeight = riskWeights.get(slot.poiId);
        if (riskWeight !== undefined && riskWeight > 0.7) {
            violations.push({
                code: 'RISK_VIOLATION',
                date,
                slotId: slot.id,
                details: {
                    message: `高风险活动（风险评分: ${(riskWeight * 100).toFixed(1)}）`,
                    riskWeight,
                },
            });
        }
    }
    return violations;
}
function pickReplacement(state, date, oldSlot, candidates, riskWeights) {
    const oldTitle = oldSlot.title.toLowerCase();
    const score = (c) => {
        var _a;
        const indoorBonus = c.indoorOutdoor === 'indoor' ? 0.6 : 0;
        const q = (_a = c.qualityScore) !== null && _a !== void 0 ? _a : 0.5;
        const matchBonus = (c.name.en || c.name.zh || '')
            .toLowerCase()
            .includes(oldTitle)
            ? 0.2
            : 0;
        const riskWeight = (riskWeights === null || riskWeights === void 0 ? void 0 : riskWeights.get(c.id)) || 0;
        const riskPenalty = riskWeight * 0.5;
        return indoorBonus + q + matchBonus - riskPenalty;
    };
    const pool = candidates.filter(c => { var _a; return (_a = c.location) === null || _a === void 0 ? void 0 : _a.point; });
    pool.sort((a, b) => score(b) - score(a));
    return pool[0] || null;
}
function neptuneRepairPlan(state, plan, riskWeights) {
    const triggers = [];
    const changedSlotIds = [];
    const newDays = plan.days.map(day => {
        const candidates = state.candidatesByDate[day.date] || [];
        const newSlots = day.timeSlots.map(slot => {
            var _a;
            if (slot.locked || slot.priorityTag === 'anchor')
                return slot;
            const v = slotViolates(state, day.date, slot, riskWeights);
            if (v.length === 0)
                return slot;
            triggers.push(...v);
            const rep = pickReplacement(state, day.date, slot, candidates, riskWeights);
            if (!rep) {
                changedSlotIds.push(slot.id);
                return {
                    ...slot,
                    title: '自由活动 / 休息',
                    type: 'rest',
                    poiId: undefined,
                    coordinates: undefined,
                    reasons: [
                        ...(slot.reasons || []),
                        'Repaired by Neptune: no feasible replacement, fallback to rest',
                    ],
                };
            }
            changedSlotIds.push(slot.id);
            return {
                ...slot,
                title: rep.name.zh || rep.name.en || slot.title,
                type: rep.type,
                poiId: rep.id,
                coordinates: (_a = rep.location) === null || _a === void 0 ? void 0 : _a.point,
                reasons: [
                    ...(slot.reasons || []),
                    'Repaired by Neptune: swapped due to violation',
                ],
            };
        });
        return { ...day, timeSlots: newSlots };
    });
    const repaired = { ...plan, days: newDays };
    return {
        plan: repaired,
        triggers,
        changedSlotIds,
        explanation: triggers.length
            ? `Neptune repaired plan with minimal edits. Violations=${triggers.length}, changedSlots=${changedSlotIds.length}`
            : 'No repair needed',
    };
}
//# sourceMappingURL=neptune.js.map