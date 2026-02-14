export declare const COST_CONSTANTS: {
    readonly OVER_BUDGET_PENALTY_K: 4;
    readonly IDEAL_BUDGET_RATIO_MIN: 0.85;
    readonly IDEAL_BUDGET_RATIO_MAX: 1;
    readonly TOO_SAVE_PENALTY: 0.2;
    readonly IDEAL_DECLINE_FACTOR: 0.3;
};
export declare const RISK_CONSTANTS: {
    readonly SLACK_THRESHOLD_MIN: 30;
    readonly BUFFER_HALF_LIFE_MIN: 60;
    readonly ACTIVITY_RISK_WEIGHT: 0.35;
    readonly TIGHTNESS_WEIGHT: 0.25;
    readonly ROBUST_RISK_WEIGHT: 0.25;
    readonly BOOKING_PRESSURE_WEIGHT: 0.15;
    readonly RISK_BASE_WEIGHT: 0.7;
    readonly ROBUST_BOOST_WEIGHT: 0.3;
};
export declare const PREF_CONSTANTS: {
    readonly DIVERSITY_THRESHOLD: 0.45;
    readonly DIVERSITY_PENALTY_DENOM: 0.55;
    readonly INTENT_WEIGHT: 0.65;
    readonly QUALITY_WEIGHT: 0.25;
    readonly MUST_SEE_WEIGHT: 0.1;
    readonly QUALITY_SCORE_WEIGHT: 0.6;
    readonly UNIQUENESS_SCORE_WEIGHT: 0.4;
    readonly DISLIKE_PENALTY: 0.3;
};
export declare const TIME_CONSTANTS: {
    readonly UTIL_THRESHOLD_MIN: 0.35;
    readonly UTIL_WEIGHT: 0.45;
    readonly FLOW_WEIGHT: 0.35;
    readonly WINDOW_WEIGHT: 0.2;
    readonly CRITICAL_WINDOW_SLACK_MIN: 30;
};
export declare const REQ_CONSTANTS: {
    readonly COVERAGE_WEIGHT: 0.7;
    readonly VALUE_WEIGHT: 0.25;
    readonly PRIORITY_LOSS_WEIGHT: 0.3;
    readonly NORMALIZE_SCALE_MIN: 100;
    readonly HIGH_PRIORITY_THRESHOLD: 2;
    readonly HIGH_PENALTY_THRESHOLD: 50;
};
export declare const WEIGHT_ADJUST_CONSTANTS: {
    readonly PACING_ADJUST: {
        readonly relaxed: {
            readonly pref: 0.1;
            readonly risk: 0.1;
            readonly time: -0.1;
        };
        readonly intense: {
            readonly time: 0.15;
            readonly risk: -0.05;
            readonly cost: -0.1;
        };
    };
    readonly RISK_TOLERANCE_ADJUST: {
        readonly low: {
            readonly risk: 0.15;
            readonly req: 0.05;
            readonly pref: -0.1;
            readonly time: -0.1;
        };
        readonly high: {
            readonly risk: -0.1;
            readonly pref: 0.1;
            readonly time: 0.05;
            readonly cost: -0.05;
        };
    };
    readonly BUDGET_STYLE_ADJUST: {
        readonly low: {
            readonly cost: 0.2;
            readonly pref: -0.1;
            readonly time: -0.1;
        };
        readonly high: {
            readonly cost: -0.1;
            readonly pref: 0.1;
            readonly time: 0.05;
            readonly risk: -0.05;
        };
    };
    readonly REQ_PROTECTION: {
        readonly minWeight: 0.25;
        readonly minWeightWithManyHardNodes: 0.35;
        readonly manyHardNodesThreshold: 3;
    };
};
export declare const HARD_GATE_CONSTANTS: {
    readonly SEVERE_OVERTIME_THRESHOLD_MIN: 30;
    readonly DEFAULT_DAY_DURATION_MIN: number;
};
