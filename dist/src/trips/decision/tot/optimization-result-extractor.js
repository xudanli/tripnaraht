"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPlanRequestFromResult = extractPlanRequestFromResult;
exports.inferObjectiveWeights = inferObjectiveWeights;
exports.extractDiagnostics = extractDiagnostics;
function extractPlanRequestFromResult(optimizationResult, world) {
    var _a, _b;
    const extracted = {};
    const diagnostics = optimizationResult.diagnostics;
    if (diagnostics === null || diagnostics === void 0 ? void 0 : diagnostics.assumptions) {
    }
    const summary = optimizationResult.summary;
    if (summary) {
    }
    const robustness = optimizationResult.robustness;
    if (robustness) {
    }
    const dropped = (_a = optimizationResult.dropped) !== null && _a !== void 0 ? _a : [];
    if (dropped.length > 0) {
        const avgPenalty = dropped.reduce((sum, node) => sum + (node.penalty || 0), 0) / dropped.length;
    }
    const route = (_b = optimizationResult.route) !== null && _b !== void 0 ? _b : [];
    if (route.length > 0) {
    }
    return extracted;
}
function inferObjectiveWeights(optimizationResult, world) {
    var _a;
    const weights = {};
    const dropped = (_a = optimizationResult.dropped) !== null && _a !== void 0 ? _a : [];
    if (dropped.length > 0) {
        const avgPenalty = dropped.reduce((sum, node) => sum + (node.penalty || 0), 0) / dropped.length;
        if (avgPenalty > 50) {
            weights.drop_penalty = 1.5;
        }
        else if (avgPenalty > 20) {
            weights.drop_penalty = 1.2;
        }
        else {
            weights.drop_penalty = 1.0;
        }
    }
    const summary = optimizationResult.summary;
    if (summary) {
        const travelRatio = summary.total_day_min > 0
            ? summary.total_travel_min / summary.total_day_min
            : 0;
        const waitRatio = summary.total_day_min > 0
            ? summary.total_wait_min / summary.total_day_min
            : 0;
        if (waitRatio > 0.15) {
            weights.wait = 2.0;
        }
        else if (waitRatio > 0.10) {
            weights.wait = 1.5;
        }
        else {
            weights.wait = 1.0;
        }
        if (travelRatio > 0.30) {
            weights.travel = 0.8;
        }
        else {
            weights.travel = 1.0;
        }
    }
    const robustness = optimizationResult.robustness;
    if (robustness) {
        const bufferRatio = summary && summary.total_day_min > 0
            ? robustness.total_buffer_minutes / summary.total_day_min
            : 0;
        if (bufferRatio > 0.20) {
            weights.reward = 1.5;
        }
        else {
            weights.reward = 1.0;
        }
    }
    return weights;
}
function extractDiagnostics(optimizationResult) {
    var _a, _b, _c;
    const diagnostics = optimizationResult.diagnostics;
    const robustness = optimizationResult.robustness;
    const criticalWindows = (_a = diagnostics === null || diagnostics === void 0 ? void 0 : diagnostics.critical_windows) !== null && _a !== void 0 ? _a : [];
    const minSlack = ((_b = robustness === null || robustness === void 0 ? void 0 : robustness.top3_min_slack_nodes) === null || _b === void 0 ? void 0 : _b.length) > 0
        ? Math.min(...robustness.top3_min_slack_nodes.map(n => n.slack_min))
        : 60;
    return {
        criticalWindows,
        minSlack,
        riskLevel: robustness === null || robustness === void 0 ? void 0 : robustness.risk_level,
        totalBuffer: (_c = robustness === null || robustness === void 0 ? void 0 : robustness.total_buffer_minutes) !== null && _c !== void 0 ? _c : 0,
    };
}
//# sourceMappingURL=optimization-result-extractor.js.map