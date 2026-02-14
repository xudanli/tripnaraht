"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.abuSelectCoreActivities = abuSelectCoreActivities;
function abuSelectCoreActivities(state, date, candidates, limits) {
    const reasonsById = {};
    const addReason = (id, r) => {
        reasonsById[id] = reasonsById[id] || [];
        reasonsById[id].push(r);
    };
    const hardKeep = candidates.filter(c => c.mustSee);
    const soft = candidates.filter(c => !c.mustSee);
    const score = (c) => {
        var _a, _b, _c;
        const intentScore = (c.intentTags || []).reduce((sum, t) => sum + (state.context.preferences.intents[t] || 0), 0);
        const quality = (_a = c.qualityScore) !== null && _a !== void 0 ? _a : 0.5;
        const unique = (_b = c.uniquenessScore) !== null && _b !== void 0 ? _b : 0.3;
        const weatherPenalty = ((_c = c.weatherSensitivity) !== null && _c !== void 0 ? _c : 0) * 0.15;
        const riskPenalty = c.riskLevel === 'high' && state.context.preferences.riskTolerance === 'low'
            ? 0.6
            : 0;
        const costPenalty = c.cost
            ? Math.min(0.6, c.cost.amount / 5000)
            : 0;
        return (1.2 * intentScore +
            0.8 * quality +
            0.5 * unique -
            weatherPenalty -
            riskPenalty -
            costPenalty);
    };
    const usedAltGroup = new Set();
    const kept = [];
    const dropped = [];
    let usedMin = 0;
    let usedCost = 0;
    const tryKeep = (c, reason) => {
        var _a;
        const alt = c.alternativeGroupId;
        if (alt && usedAltGroup.has(alt)) {
            dropped.push(c);
            addReason(c.id, `Dropped due to alternativeGroup conflict: ${alt}`);
            return;
        }
        const nextMin = usedMin + c.durationMin;
        const nextCost = usedCost + (((_a = c.cost) === null || _a === void 0 ? void 0 : _a.amount) || 0);
        if (nextMin > limits.maxActiveMin) {
            dropped.push(c);
            addReason(c.id, `Dropped: time budget exceeded`);
            return;
        }
        if (limits.maxCost != null && nextCost > limits.maxCost) {
            dropped.push(c);
            addReason(c.id, `Dropped: cost budget exceeded`);
            return;
        }
        kept.push(c);
        usedMin = nextMin;
        usedCost = nextCost;
        if (alt)
            usedAltGroup.add(alt);
        addReason(c.id, reason);
    };
    for (const c of hardKeep)
        tryKeep(c, 'Kept: mustSee');
    const sorted = soft.slice().sort((a, b) => score(b) - score(a));
    for (const c of sorted) {
        tryKeep(c, `Kept: high marginal value score=${score(c).toFixed(2)}`);
    }
    const keptIds = new Set(kept.map(k => k.id));
    for (const c of candidates) {
        if (!keptIds.has(c.id) && !dropped.find(d => d.id === c.id)) {
            dropped.push(c);
            addReason(c.id, 'Dropped: not selected');
        }
    }
    return { kept, dropped, reasonsById };
}
//# sourceMappingURL=abu.js.map