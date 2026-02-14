"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeBaseWeights = computeBaseWeights;
exports.applyDynamicAdjust = applyDynamicAdjust;
exports.normalizeWeights = normalizeWeights;
exports.computeFinalWeights = computeFinalWeights;
const scoring_constants_1 = require("./scoring-constants");
function computeBaseWeights(objectiveWeights, planRequest) {
    var _a, _b, _c, _d, _e;
    const dayW = (_a = planRequest === null || planRequest === void 0 ? void 0 : planRequest.objective_weights) !== null && _a !== void 0 ? _a : {};
    let w = {
        pref: objectiveWeights.satisfaction,
        risk: objectiveWeights.violationRisk + 0.5 * objectiveWeights.robustness,
        cost: objectiveWeights.cost,
        time: ((_b = dayW.travel) !== null && _b !== void 0 ? _b : 1.0) + ((_c = dayW.wait) !== null && _c !== void 0 ? _c : 1.5),
        req: ((_d = dayW.drop_penalty) !== null && _d !== void 0 ? _d : 1.0) + 0.5 * ((_e = dayW.reward) !== null && _e !== void 0 ? _e : 1.0),
    };
    return w;
}
function applyDynamicAdjust(baseWeights, world, plan) {
    var _a, _b;
    let w = { ...baseWeights };
    const pace = world.context.preferences.pace;
    const riskTolerance = world.context.preferences.riskTolerance;
    const budgetStyle = (_b = (_a = world.context.budget) === null || _a === void 0 ? void 0 : _a.style) !== null && _b !== void 0 ? _b : 'medium';
    const anchors = world.context.anchors;
    const pacingAdjust = scoring_constants_1.WEIGHT_ADJUST_CONSTANTS.PACING_ADJUST;
    if (pace === 'relaxed') {
        w.pref += pacingAdjust.relaxed.pref;
        w.risk += pacingAdjust.relaxed.risk;
        w.time += pacingAdjust.relaxed.time;
    }
    else if (pace === 'intense') {
        w.time += pacingAdjust.intense.time;
        w.risk += pacingAdjust.intense.risk;
        w.cost += pacingAdjust.intense.cost;
    }
    const riskAdjust = scoring_constants_1.WEIGHT_ADJUST_CONSTANTS.RISK_TOLERANCE_ADJUST;
    if (riskTolerance === 'low') {
        w.risk += riskAdjust.low.risk;
        w.req += riskAdjust.low.req;
        w.pref += riskAdjust.low.pref;
        w.time += riskAdjust.low.time;
    }
    else if (riskTolerance === 'high') {
        w.risk += riskAdjust.high.risk;
        w.pref += riskAdjust.high.pref;
        w.time += riskAdjust.high.time;
        w.cost += riskAdjust.high.cost;
    }
    const budgetAdjust = scoring_constants_1.WEIGHT_ADJUST_CONSTANTS.BUDGET_STYLE_ADJUST;
    if (budgetStyle === 'low') {
        w.cost += budgetAdjust.low.cost;
        w.pref += budgetAdjust.low.pref;
        w.time += budgetAdjust.low.time;
    }
    else if (budgetStyle === 'high') {
        w.cost += budgetAdjust.high.cost;
        w.pref += budgetAdjust.high.pref;
        w.time += budgetAdjust.high.time;
        w.risk += budgetAdjust.high.risk;
    }
    const reqProtection = scoring_constants_1.WEIGHT_ADJUST_CONSTANTS.REQ_PROTECTION;
    const hasAnchors = anchors && ((anchors.fixedEvents && anchors.fixedEvents.length > 0) ||
        (anchors.hotelLocationsByDate && Object.keys(anchors.hotelLocationsByDate).length > 0));
    let hardNodeCount = 0;
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.locked || slot.priorityTag === 'anchor') {
                hardNodeCount++;
            }
        }
    }
    const currentSum = w.cost + w.risk + w.pref + w.time + w.req;
    if (hasAnchors || hardNodeCount > 0) {
        const minReqAbsolute = reqProtection.minWeight * currentSum;
        w.req = Math.max(w.req, minReqAbsolute);
        if (hardNodeCount >= reqProtection.manyHardNodesThreshold) {
            const minReqManyAbsolute = reqProtection.minWeightWithManyHardNodes * currentSum;
            w.req = Math.max(w.req, minReqManyAbsolute);
        }
    }
    w.cost = Math.max(0, w.cost);
    w.risk = Math.max(0, w.risk);
    w.pref = Math.max(0, w.pref);
    w.time = Math.max(0, w.time);
    w.req = Math.max(0, w.req);
    return w;
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
function computeFinalWeights(objectiveWeights, world, plan, planRequest) {
    const base = computeBaseWeights(objectiveWeights, planRequest);
    const adjusted = applyDynamicAdjust(base, world, plan);
    const normalized = normalizeWeights(adjusted);
    return normalized;
}
//# sourceMappingURL=weight-computer.js.map