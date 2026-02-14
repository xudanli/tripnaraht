export interface DecisionParams {
    routeDirectionBias: {
        difficultyWeight: number;
        sceneryWeight: number;
        adventureWeight: number;
        stabilityWeight: number;
    };
    constraints: {
        maxDailyAscentM?: number;
        maxElevationM?: number;
        maxSlopePct?: number;
        bufferTimeMin?: number;
        avoidRapidAscent?: boolean;
    };
    strategyPreference: {
        abuWeight: number;
        drDreWeight: number;
        neptuneWeight: number;
    };
    repairPolicy: {
        preferSplitDays: boolean;
        preferAltRoute: boolean;
        preferRestDay: boolean;
    };
}
export declare function createDefaultDecisionParams(): DecisionParams;
export declare function normalizeDecisionParams(params: DecisionParams): DecisionParams;
