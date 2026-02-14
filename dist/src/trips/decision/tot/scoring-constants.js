"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HARD_GATE_CONSTANTS = exports.WEIGHT_ADJUST_CONSTANTS = exports.REQ_CONSTANTS = exports.TIME_CONSTANTS = exports.PREF_CONSTANTS = exports.RISK_CONSTANTS = exports.COST_CONSTANTS = void 0;
exports.COST_CONSTANTS = {
    OVER_BUDGET_PENALTY_K: 4.0,
    IDEAL_BUDGET_RATIO_MIN: 0.85,
    IDEAL_BUDGET_RATIO_MAX: 1.0,
    TOO_SAVE_PENALTY: 0.2,
    IDEAL_DECLINE_FACTOR: 0.3,
};
exports.RISK_CONSTANTS = {
    SLACK_THRESHOLD_MIN: 30,
    BUFFER_HALF_LIFE_MIN: 60,
    ACTIVITY_RISK_WEIGHT: 0.35,
    TIGHTNESS_WEIGHT: 0.25,
    ROBUST_RISK_WEIGHT: 0.25,
    BOOKING_PRESSURE_WEIGHT: 0.15,
    RISK_BASE_WEIGHT: 0.7,
    ROBUST_BOOST_WEIGHT: 0.3,
};
exports.PREF_CONSTANTS = {
    DIVERSITY_THRESHOLD: 0.45,
    DIVERSITY_PENALTY_DENOM: 0.55,
    INTENT_WEIGHT: 0.65,
    QUALITY_WEIGHT: 0.25,
    MUST_SEE_WEIGHT: 0.10,
    QUALITY_SCORE_WEIGHT: 0.6,
    UNIQUENESS_SCORE_WEIGHT: 0.4,
    DISLIKE_PENALTY: 0.3,
};
exports.TIME_CONSTANTS = {
    UTIL_THRESHOLD_MIN: 0.35,
    UTIL_WEIGHT: 0.45,
    FLOW_WEIGHT: 0.35,
    WINDOW_WEIGHT: 0.20,
    CRITICAL_WINDOW_SLACK_MIN: 30,
};
exports.REQ_CONSTANTS = {
    COVERAGE_WEIGHT: 0.70,
    VALUE_WEIGHT: 0.25,
    PRIORITY_LOSS_WEIGHT: 0.30,
    NORMALIZE_SCALE_MIN: 100,
    HIGH_PRIORITY_THRESHOLD: 2,
    HIGH_PENALTY_THRESHOLD: 50,
};
exports.WEIGHT_ADJUST_CONSTANTS = {
    PACING_ADJUST: {
        relaxed: { pref: 0.10, risk: 0.10, time: -0.10 },
        intense: { time: 0.15, risk: -0.05, cost: -0.10 },
    },
    RISK_TOLERANCE_ADJUST: {
        low: { risk: 0.15, req: 0.05, pref: -0.10, time: -0.10 },
        high: { risk: -0.10, pref: 0.10, time: 0.05, cost: -0.05 },
    },
    BUDGET_STYLE_ADJUST: {
        low: { cost: 0.20, pref: -0.10, time: -0.10 },
        high: { cost: -0.10, pref: 0.10, time: 0.05, risk: -0.05 },
    },
    REQ_PROTECTION: {
        minWeight: 0.25,
        minWeightWithManyHardNodes: 0.35,
        manyHardNodesThreshold: 3,
    },
};
exports.HARD_GATE_CONSTANTS = {
    SEVERE_OVERTIME_THRESHOLD_MIN: 30,
    DEFAULT_DAY_DURATION_MIN: 14 * 60,
};
//# sourceMappingURL=scoring-constants.js.map