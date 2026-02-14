"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreCost = scoreCost;
exports.scoreRisk = scoreRisk;
exports.scorePref = scorePref;
exports.scoreTime = scoreTime;
exports.scoreReq = scoreReq;
const candidate_helper_1 = require("./candidate-helper");
const scoring_constants_1 = require("./scoring-constants");
function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}
function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
}
function scoreCost(world, plan, optimizationResult, valueOfTimePerMin = 0) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const metrics = {};
    let totalCost = (_b = (_a = plan.metrics) === null || _a === void 0 ? void 0 : _a.estTotalCost) !== null && _b !== void 0 ? _b : 0;
    if (totalCost === 0) {
        const activityMap = (0, candidate_helper_1.extractActivityCandidatesFromPlan)(world, plan);
        for (const { candidate } of activityMap.values()) {
            if ((_c = candidate.cost) === null || _c === void 0 ? void 0 : _c.amount) {
                totalCost += candidate.cost.amount;
            }
        }
    }
    const budget = (_d = world.context.budget) === null || _d === void 0 ? void 0 : _d.amount;
    const budgetStyle = (_f = (_e = world.context.budget) === null || _e === void 0 ? void 0 : _e.style) !== null && _f !== void 0 ? _f : 'medium';
    const travelMin = (_h = (_g = plan.metrics) === null || _g === void 0 ? void 0 : _g.estTravelMinutes) !== null && _h !== void 0 ? _h : 0;
    const waitMin = (_j = optimizationResult === null || optimizationResult === void 0 ? void 0 : optimizationResult.summary.total_wait_min) !== null && _j !== void 0 ? _j : 0;
    const timeCost = valueOfTimePerMin * (travelMin + waitMin);
    const effectiveCost = totalCost + timeCost;
    metrics.cost = totalCost;
    metrics.effectiveCost = effectiveCost;
    metrics.timeCost = timeCost;
    metrics.travelMin = travelMin;
    metrics.waitMin = waitMin;
    if (!budget) {
        const days = world.context.durationDays;
        const refCostPerDay = budgetStyle === 'low' ? 50 : budgetStyle === 'high' ? 300 : 150;
        const refCost = refCostPerDay * days;
        const ratio = effectiveCost / refCost;
        metrics.costRatio = ratio;
        metrics.overBudgetPenalty = 0;
        const score = clamp01(1 - ratio * 0.3);
        return { score, metrics };
    }
    const ratio = effectiveCost / budget;
    metrics.costRatio = ratio;
    metrics.budget = budget;
    let score;
    if (ratio <= scoring_constants_1.COST_CONSTANTS.IDEAL_BUDGET_RATIO_MIN) {
        score = 1.0 - scoring_constants_1.COST_CONSTANTS.TOO_SAVE_PENALTY * ((scoring_constants_1.COST_CONSTANTS.IDEAL_BUDGET_RATIO_MIN - ratio) / scoring_constants_1.COST_CONSTANTS.IDEAL_BUDGET_RATIO_MIN);
        metrics.overBudgetPenalty = 0;
    }
    else if (ratio <= scoring_constants_1.COST_CONSTANTS.IDEAL_BUDGET_RATIO_MAX) {
        const range = scoring_constants_1.COST_CONSTANTS.IDEAL_BUDGET_RATIO_MAX - scoring_constants_1.COST_CONSTANTS.IDEAL_BUDGET_RATIO_MIN;
        score = 1.0 - scoring_constants_1.COST_CONSTANTS.IDEAL_DECLINE_FACTOR * ((ratio - scoring_constants_1.COST_CONSTANTS.IDEAL_BUDGET_RATIO_MIN) / range);
        metrics.overBudgetPenalty = 0;
    }
    else {
        const overRatio = ratio - 1.0;
        score = Math.exp(-scoring_constants_1.COST_CONSTANTS.OVER_BUDGET_PENALTY_K * overRatio);
        metrics.overBudgetPenalty = overRatio;
    }
    return { score: clamp01(score), metrics };
}
function scoreRisk(world, plan, optimizationResult) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const metrics = {};
    const activityRisks = [];
    const activityMap = (0, candidate_helper_1.extractActivityCandidatesFromPlan)(world, plan);
    for (const { candidate } of activityMap.values()) {
        const riskLevel = candidate.riskLevel;
        const weatherSensitivity = candidate.weatherSensitivity;
        const inventoryRisk = candidate.inventoryRisk;
        const bookingDifficulty = candidate.bookingDifficulty;
        const requiresBooking = candidate.requiresBooking;
        if (riskLevel || weatherSensitivity !== undefined || inventoryRisk !== undefined) {
            const riskLevelScore = riskLevel === 'low' ? 0.2 : riskLevel === 'medium' ? 0.5 : riskLevel === 'high' ? 0.85 : 0.5;
            const weatherScore = (weatherSensitivity !== null && weatherSensitivity !== void 0 ? weatherSensitivity : 0) / 3;
            const inventoryScore = inventoryRisk ? (inventoryRisk - 1) / 4 : 0;
            const bookingScore = bookingDifficulty ? (bookingDifficulty - 1) / 4 : 0;
            const bookingPressure = requiresBooking && (inventoryRisk !== null && inventoryRisk !== void 0 ? inventoryRisk : 0) >= 4 ? 0.2 : 0;
            const activityRisk = 0.4 * riskLevelScore +
                0.25 * weatherScore +
                0.2 * inventoryScore +
                0.1 * bookingScore +
                0.05 * bookingPressure;
            activityRisks.push(activityRisk);
        }
    }
    const avgActivityRisk = activityRisks.length > 0
        ? activityRisks.reduce((a, b) => a + b, 0) / activityRisks.length
        : 0.3;
    metrics.avgActivityRisk = avgActivityRisk;
    let tightness = 0.5;
    let slackMin = 60;
    if (optimizationResult) {
        const top3Slack = (_b = (_a = optimizationResult.robustness) === null || _a === void 0 ? void 0 : _a.top3_min_slack_nodes) !== null && _b !== void 0 ? _b : [];
        if (top3Slack.length > 0) {
            slackMin = Math.min(...top3Slack.map((n) => n.slack_min));
        }
        const criticalWindows = (_d = (_c = optimizationResult.diagnostics) === null || _c === void 0 ? void 0 : _c.critical_windows) !== null && _d !== void 0 ? _d : [];
        if (criticalWindows.length > 0) {
            const minSlackClose = Math.min(...criticalWindows.map((w) => w.slack_to_close_min));
            slackMin = Math.min(slackMin, minSlackClose);
        }
        tightness = clamp01((scoring_constants_1.RISK_CONSTANTS.SLACK_THRESHOLD_MIN - slackMin) / scoring_constants_1.RISK_CONSTANTS.SLACK_THRESHOLD_MIN);
    }
    metrics.slackMin = slackMin;
    metrics.tightness = tightness;
    const robustnessRiskLevel = (_e = optimizationResult === null || optimizationResult === void 0 ? void 0 : optimizationResult.robustness) === null || _e === void 0 ? void 0 : _e.risk_level;
    const robustRiskScore = robustnessRiskLevel === 'low' ? 0.2 :
        robustnessRiskLevel === 'medium' ? 0.5 : 0.85;
    metrics.robustRiskScore = robustRiskScore;
    const riskIndex = scoring_constants_1.RISK_CONSTANTS.ACTIVITY_RISK_WEIGHT * avgActivityRisk +
        scoring_constants_1.RISK_CONSTANTS.TIGHTNESS_WEIGHT * tightness +
        scoring_constants_1.RISK_CONSTANTS.ROBUST_RISK_WEIGHT * robustRiskScore +
        scoring_constants_1.RISK_CONSTANTS.BOOKING_PRESSURE_WEIGHT * 0.3;
    metrics.riskIndex = riskIndex;
    const userRiskTolerance = world.context.preferences.riskTolerance;
    const mult = userRiskTolerance === 'low' ? 1.25 :
        userRiskTolerance === 'high' ? 0.85 : 1.0;
    let sRiskBase = clamp01(1 - mult * riskIndex);
    metrics.sRiskBase = sRiskBase;
    const buffer = (_g = (_f = optimizationResult === null || optimizationResult === void 0 ? void 0 : optimizationResult.robustness) === null || _f === void 0 ? void 0 : _f.total_buffer_minutes) !== null && _g !== void 0 ? _g : 0;
    const robustnessScore = (_j = (_h = plan.metrics) === null || _h === void 0 ? void 0 : _h.robustnessScore) !== null && _j !== void 0 ? _j : 0.5;
    const sRobust = clamp01(0.6 * robustnessScore + 0.4 * (1 - Math.exp(-buffer / scoring_constants_1.RISK_CONSTANTS.BUFFER_HALF_LIFE_MIN)));
    metrics.buffer = buffer;
    metrics.robustnessScore = robustnessScore;
    metrics.sRobust = sRobust;
    const score = scoring_constants_1.RISK_CONSTANTS.RISK_BASE_WEIGHT * sRiskBase + scoring_constants_1.RISK_CONSTANTS.ROBUST_BOOST_WEIGHT * sRobust;
    return { score: clamp01(score), metrics };
}
function scorePref(world, plan, tagAffinity = {}, diversityPenalty = 0.1, mustSeeBoost = 1.5) {
    var _a, _b, _c, _d, _e, _f;
    const metrics = {};
    const userIntents = world.context.preferences.intents;
    const dislikeTags = (_a = world.context.preferences.dislikeTags) !== null && _a !== void 0 ? _a : [];
    const intentMatches = [];
    let dislikeHitCount = 0;
    let totalSlots = 0;
    const activityMap = (0, candidate_helper_1.extractActivityCandidatesFromPlan)(world, plan);
    for (const { candidate, slot } of activityMap.values()) {
        if (slot.type !== 'transport' && slot.type !== 'rest') {
            totalSlots++;
            const intentTags = (_b = candidate.intentTags) !== null && _b !== void 0 ? _b : [];
            const qualityScore = candidate.qualityScore;
            const uniquenessScore = candidate.uniquenessScore;
            const mustSee = candidate.mustSee;
            const hasDislike = intentTags.some(tag => dislikeTags.includes(tag));
            if (hasDislike) {
                dislikeHitCount++;
            }
            let matchSum = 0;
            let intentSum = 0;
            for (const tag of intentTags) {
                const userWeight = (_c = userIntents[tag]) !== null && _c !== void 0 ? _c : 0;
                const affinity = (_d = tagAffinity[tag]) !== null && _d !== void 0 ? _d : 1.0;
                matchSum += userWeight * affinity;
                intentSum += userWeight;
            }
            const intentMatch = intentSum > 0 ? matchSum / intentSum : 0.5;
            intentMatches.push(intentMatch);
        }
    }
    const avgIntentMatch = intentMatches.length > 0
        ? intentMatches.reduce((a, b) => a + b, 0) / intentMatches.length
        : 0.5;
    const dislikeHitRate = totalSlots > 0 ? dislikeHitCount / totalSlots : 0;
    metrics.avgIntentMatch = avgIntentMatch;
    metrics.dislikeHitRate = dislikeHitRate;
    const sIntent = clamp01(avgIntentMatch - scoring_constants_1.PREF_CONSTANTS.DISLIKE_PENALTY * dislikeHitRate);
    metrics.sIntent = sIntent;
    const qualityScores = [];
    const uniquenessScores = [];
    let mustSeeCount = 0;
    let mustSeeTotal = 0;
    for (const { candidate } of activityMap.values()) {
        if (candidate.qualityScore !== undefined) {
            qualityScores.push(candidate.qualityScore);
        }
        if (candidate.uniquenessScore !== undefined) {
            uniquenessScores.push(candidate.uniquenessScore);
        }
        if (candidate.mustSee) {
            mustSeeCount++;
        }
    }
    for (const date in world.candidatesByDate) {
        const candidates = world.candidatesByDate[date];
        for (const candidate of candidates) {
            if (candidate.mustSee) {
                mustSeeTotal++;
            }
        }
    }
    const avgQuality = qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : 0.6;
    const avgUniqueness = uniquenessScores.length > 0
        ? uniquenessScores.reduce((a, b) => a + b, 0) / uniquenessScores.length
        : 0.5;
    const sQuality = clamp01(scoring_constants_1.PREF_CONSTANTS.QUALITY_SCORE_WEIGHT * avgQuality + scoring_constants_1.PREF_CONSTANTS.UNIQUENESS_SCORE_WEIGHT * avgUniqueness);
    metrics.sQuality = sQuality;
    const mustSeeCoveredRatio = mustSeeTotal > 0 ? mustSeeCount / mustSeeTotal : 1.0;
    const sMust = clamp01(mustSeeCoveredRatio);
    metrics.mustSeeCoveredRatio = mustSeeCoveredRatio;
    let sPref = clamp01(scoring_constants_1.PREF_CONSTANTS.INTENT_WEIGHT * sIntent + scoring_constants_1.PREF_CONSTANTS.QUALITY_WEIGHT * sQuality + scoring_constants_1.PREF_CONSTANTS.MUST_SEE_WEIGHT * sMust);
    const tagCounts = {};
    for (const { candidate } of activityMap.values()) {
        const tags = (_e = candidate.intentTags) !== null && _e !== void 0 ? _e : [];
        for (const tag of tags) {
            tagCounts[tag] = ((_f = tagCounts[tag]) !== null && _f !== void 0 ? _f : 0) + 1;
        }
    }
    const totalTagCount = Object.values(tagCounts).reduce((a, b) => a + b, 0);
    const maxTagShare = totalTagCount > 0
        ? Math.max(...Object.values(tagCounts)) / totalTagCount
        : 0;
    const divPenalty = diversityPenalty * Math.max(0, (maxTagShare - scoring_constants_1.PREF_CONSTANTS.DIVERSITY_THRESHOLD) / scoring_constants_1.PREF_CONSTANTS.DIVERSITY_PENALTY_DENOM);
    sPref = clamp01(sPref - divPenalty);
    metrics.maxTagShare = maxTagShare;
    metrics.divPenalty = divPenalty;
    return { score: clamp01(sPref), metrics };
}
function scoreTime(world, plan, optimizationResult, travelWeight = 1.0, waitWeight = 1.5) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const metrics = {};
    if (!optimizationResult) {
        const travelMin = (_b = (_a = plan.metrics) === null || _a === void 0 ? void 0 : _a.estTravelMinutes) !== null && _b !== void 0 ? _b : 0;
        const activeMin = (_d = (_c = plan.metrics) === null || _c === void 0 ? void 0 : _c.estActiveMinutes) !== null && _d !== void 0 ? _d : 0;
        const dayStart = (_f = (_e = world.policies) === null || _e === void 0 ? void 0 : _e.dayStart) !== null && _f !== void 0 ? _f : '08:00';
        const dayEnd = (_h = (_g = world.policies) === null || _g === void 0 ? void 0 : _g.dayEnd) !== null && _h !== void 0 ? _h : '22:00';
        const dayMin = scoring_constants_1.HARD_GATE_CONSTANTS.DEFAULT_DAY_DURATION_MIN;
        const util = activeMin / dayMin;
        const sUtil = clamp01((util - scoring_constants_1.TIME_CONSTANTS.UTIL_THRESHOLD_MIN) / scoring_constants_1.TIME_CONSTANTS.UTIL_THRESHOLD_MIN);
        const sFlow = clamp01(1 - (travelMin / dayMin) * travelWeight);
        const sWindow = 0.8;
        metrics.travelMin = travelMin;
        metrics.activeMin = activeMin;
        metrics.util = util;
        metrics.sUtil = sUtil;
        metrics.sFlow = sFlow;
        metrics.sWindow = sWindow;
        const score = scoring_constants_1.TIME_CONSTANTS.UTIL_WEIGHT * sUtil + scoring_constants_1.TIME_CONSTANTS.FLOW_WEIGHT * sFlow + scoring_constants_1.TIME_CONSTANTS.WINDOW_WEIGHT * sWindow;
        return { score: clamp01(score), metrics };
    }
    const summary = optimizationResult.summary;
    const travel = summary.total_travel_min;
    const wait = summary.total_wait_min;
    const service = summary.total_service_min;
    const day = summary.total_day_min;
    metrics.travelMin = travel;
    metrics.waitMin = wait;
    metrics.serviceMin = service;
    metrics.dayMin = day;
    const util = day > 0 ? service / day : 0;
    const sUtil = clamp01((util - scoring_constants_1.TIME_CONSTANTS.UTIL_THRESHOLD_MIN) / scoring_constants_1.TIME_CONSTANTS.UTIL_THRESHOLD_MIN);
    metrics.util = util;
    metrics.sUtil = sUtil;
    const travelRatio = day > 0 ? travel / day : 0;
    const waitRatio = day > 0 ? wait / day : 0;
    const pen = travelWeight * travelRatio + waitWeight * waitRatio;
    const sFlow = clamp01(1 - pen);
    metrics.travelRatio = travelRatio;
    metrics.waitRatio = waitRatio;
    metrics.sFlow = sFlow;
    const criticalWindows = (_k = (_j = optimizationResult.diagnostics) === null || _j === void 0 ? void 0 : _j.critical_windows) !== null && _k !== void 0 ? _k : [];
    let slackCloseMin = 60;
    if (criticalWindows.length > 0) {
        slackCloseMin = Math.min(...criticalWindows.map((w) => w.slack_to_close_min));
    }
    const sWindow = clamp01(slackCloseMin / scoring_constants_1.TIME_CONSTANTS.CRITICAL_WINDOW_SLACK_MIN);
    metrics.slackCloseMin = slackCloseMin;
    metrics.sWindow = sWindow;
    const score = scoring_constants_1.TIME_CONSTANTS.UTIL_WEIGHT * sUtil + scoring_constants_1.TIME_CONSTANTS.FLOW_WEIGHT * sFlow + scoring_constants_1.TIME_CONSTANTS.WINDOW_WEIGHT * sWindow;
    return { score: clamp01(score), metrics };
}
function scoreReq(world, plan, optimizationResult, dropPenaltyWeight = 1.0, rewardWeight = 1.0) {
    var _a, _b, _c;
    const metrics = {};
    let visitedHard = 0;
    let totalHard = 0;
    let visitedLocked = 0;
    let totalLocked = 0;
    let visitedCore = 0;
    let totalCore = 0;
    for (const day of plan.days) {
        for (const slot of day.timeSlots) {
            if (slot.locked) {
                totalLocked++;
                if (slot.poiId) {
                    visitedLocked++;
                }
            }
            if (slot.priorityTag === 'anchor' || slot.priorityTag === 'core') {
                if (slot.priorityTag === 'anchor') {
                    totalHard++;
                    if (slot.poiId) {
                        visitedHard++;
                    }
                }
                else {
                    totalCore++;
                    if (slot.poiId) {
                        visitedCore++;
                    }
                }
            }
        }
    }
    const anchors = world.context.anchors;
    if (anchors) {
        const fixedEvents = (_a = anchors.fixedEvents) !== null && _a !== void 0 ? _a : [];
        totalHard += fixedEvents.length;
    }
    const hardCovered = totalHard > 0 ? visitedHard / totalHard : 1.0;
    metrics.hardCovered = hardCovered;
    metrics.visitedHard = visitedHard;
    metrics.totalHard = totalHard;
    let loss = 0;
    let gain = 0;
    if (optimizationResult) {
        const dropped = (_b = optimizationResult.dropped) !== null && _b !== void 0 ? _b : [];
        for (const node of dropped) {
            loss += node.penalty * dropPenaltyWeight;
        }
    }
    const scale = Math.max(scoring_constants_1.REQ_CONSTANTS.NORMALIZE_SCALE_MIN, loss + gain);
    const sValue = clamp01((gain - loss) / scale + 0.5);
    metrics.dropLoss = loss;
    metrics.rewardGain = gain;
    metrics.sValue = sValue;
    let priorityLoss = 0;
    if (optimizationResult) {
        const dropped = (_c = optimizationResult.dropped) !== null && _c !== void 0 ? _c : [];
        let droppedPriority12 = 0;
        let totalPriority12 = 0;
        for (const day of plan.days) {
            for (const slot of day.timeSlots) {
                if (slot.locked || slot.priorityTag === 'anchor') {
                    totalPriority12++;
                }
            }
        }
        for (const node of dropped) {
            if (node.penalty > scoring_constants_1.REQ_CONSTANTS.HIGH_PENALTY_THRESHOLD) {
                droppedPriority12++;
            }
        }
        priorityLoss = totalPriority12 > 0 ? droppedPriority12 / totalPriority12 : 0;
    }
    metrics.priorityLoss = priorityLoss;
    const score = clamp01(scoring_constants_1.REQ_CONSTANTS.COVERAGE_WEIGHT * hardCovered + scoring_constants_1.REQ_CONSTANTS.VALUE_WEIGHT * sValue - scoring_constants_1.REQ_CONSTANTS.PRIORITY_LOSS_WEIGHT * priorityLoss);
    return { score: clamp01(score), metrics };
}
//# sourceMappingURL=dimension-scorers.js.map