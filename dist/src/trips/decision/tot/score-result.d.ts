export declare function clamp01(x: number): number;
export interface ToTScoreResult {
    allowed: boolean;
    hardViolations: string[];
    score: number;
    dims: {
        cost: number;
        risk: number;
        pref: number;
        time: number;
        req: number;
    };
    weights: {
        cost: number;
        risk: number;
        pref: number;
        time: number;
        req: number;
    };
    metrics: Record<string, number | string | boolean | object>;
}
export declare function normalizeWeights(weights: {
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
}): {
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
};
export declare function createRejectedResult(hardViolations: string[]): ToTScoreResult;
export declare function createAllowedResult(dims: {
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
}, weights: {
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
}, totalScore: number, metrics: Record<string, number | string | boolean | object>): ToTScoreResult;
