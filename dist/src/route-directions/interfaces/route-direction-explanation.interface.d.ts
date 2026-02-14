export interface ScoreBreakdown {
    tagMatch: {
        score: number;
        weight: number;
        matchedTags: string[];
        totalTags: number;
    };
    seasonality: {
        score: number;
        weight: number;
        isBestMonth: boolean;
        isAvoidMonth: boolean;
        month: number;
    };
    pace: {
        score: number;
        weight: number;
        userPace: string;
        routePace: string;
        compatible: boolean;
    };
    risk: {
        score: number;
        weight: number;
        userTolerance: string;
        routeRisk: string;
        compatible: boolean;
    };
}
export interface MatchedSignals {
    tags: {
        matched: string[];
        unmatched: string[];
        routeTags: string[];
    };
    seasonality: {
        month: number;
        bestMonths: number[];
        avoidMonths: number[];
        monthWeight?: number;
    };
    pace: {
        userPace: string;
        routePace: string;
        compatibility: 'high' | 'medium' | 'low';
    };
    risk: {
        userTolerance: string;
        routeHasHighRisk: boolean;
        riskFactors: string[];
    };
}
export interface RejectedReason {
    routeDirectionId: number;
    routeDirectionName: string;
    score: number;
    primaryReason: string;
    details: {
        tagMatch?: {
            score: number;
            reason: string;
        };
        seasonality?: {
            score: number;
            reason: string;
        };
        pace?: {
            score: number;
            reason: string;
        };
        risk?: {
            score: number;
            reason: string;
        };
    };
}
export interface RouteDirectionExplanation {
    selected: {
        routeDirectionId: number;
        routeDirectionName: string;
        score: number;
        scoreBreakdown: ScoreBreakdown;
        matchedSignals: MatchedSignals;
        reasons: string[];
        version?: string;
    };
    alternatives: {
        top3: Array<{
            routeDirectionId: number;
            routeDirectionName: string;
            score: number;
            reasons: string[];
            version?: string;
        }>;
        rejected: RejectedReason[];
        deprecated?: Array<{
            routeDirectionId: number;
            routeDirectionName: string;
            score: number;
            reasons: string[];
            status: 'deprecated';
            version?: string;
        }>;
    };
    whyNotOthers?: {
        topAlternative?: {
            routeDirectionId: number;
            routeDirectionName: string;
            whyNot: string;
            scoreDifference: number;
        };
        commonReasons?: string[];
    };
}
