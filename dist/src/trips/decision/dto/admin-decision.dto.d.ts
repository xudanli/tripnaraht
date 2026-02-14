export declare enum DecisionPersona {
    ABU = "ABU",
    DR_DRE = "DR_DRE",
    NEPTUNE = "NEPTUNE"
}
export declare enum DecisionSource {
    PHYSICAL = "PHYSICAL",
    HUMAN = "HUMAN",
    PHILOSOPHY = "PHILOSOPHY",
    HEURISTIC = "HEURISTIC"
}
export declare enum DecisionAction {
    ALLOW = "ALLOW",
    REJECT = "REJECT",
    ADJUST = "ADJUST",
    REPLACE = "REPLACE"
}
export declare class AdminDecisionLogListQueryDto {
    page?: number;
    limit?: number;
    tripId?: string;
    userId?: string;
    persona?: DecisionPersona;
    decisionSource?: DecisionSource;
    action?: DecisionAction;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
export declare class AdminDecisionStatsQueryDto {
    startDate?: string;
    endDate?: string;
    countryCode?: string;
    routeDirectionId?: string;
}
