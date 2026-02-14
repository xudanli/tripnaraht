export interface RouteDirectionDecisionMemory {
    id: string;
    userId: string;
    tripId?: string;
    countryCode: string;
    month: number;
    selectedRouteDirectionId: number;
    rejectedRouteDirectionIds: number[];
    keyConstraints: Record<string, any>;
    scoreBreakdown: Record<string, any>;
    explanation: {
        whySelected: string;
        whyRejected: Array<{
            id: number;
            reason: string;
        }>;
        riskPoints: string[];
        adjustmentSuggestions?: string[];
    };
    createdAt: Date;
}
