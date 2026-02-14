"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clamp01 = clamp01;
exports.normalizeWeights = normalizeWeights;
exports.createRejectedResult = createRejectedResult;
exports.createAllowedResult = createAllowedResult;
function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}
function normalizeWeights(weights) {
    const sum = weights.cost + weights.risk + weights.pref + weights.time + weights.req;
    if (sum === 0) {
        return {
            cost: 0.2,
            risk: 0.2,
            pref: 0.2,
            time: 0.2,
            req: 0.2,
        };
    }
    return {
        cost: weights.cost / sum,
        risk: weights.risk / sum,
        pref: weights.pref / sum,
        time: weights.time / sum,
        req: weights.req / sum,
    };
}
function createRejectedResult(hardViolations) {
    return {
        allowed: false,
        hardViolations,
        score: 0,
        dims: {
            cost: 0,
            risk: 0,
            pref: 0,
            time: 0,
            req: 0,
        },
        weights: {
            cost: 0,
            risk: 0,
            pref: 0,
            time: 0,
            req: 0,
        },
        metrics: {
            hardGateRejected: true,
            violations: hardViolations.join(', '),
        },
    };
}
function createAllowedResult(dims, weights, totalScore, metrics) {
    return {
        allowed: true,
        hardViolations: [],
        score: Math.round(totalScore * 100),
        dims,
        weights: normalizeWeights(weights),
        metrics: {
            ...metrics,
            totalScore,
            weightCost: weights.cost,
            weightRisk: weights.risk,
            weightPref: weights.pref,
            weightTime: weights.time,
            weightReq: weights.req,
        },
    };
}
//# sourceMappingURL=score-result.js.map