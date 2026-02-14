export interface TripOutcomeFeedback {
    tripId: string;
    userId: string;
    overallSuccess: boolean;
    fatigueLevel?: number;
    satisfaction?: number;
    abandoned: boolean;
    failurePoints: string[];
    notes?: string;
    createdAt: Date;
}
export interface LearningSignal {
    profileUpdate?: {
        pacePreference?: 'SLOW' | 'MODERATE' | 'FAST';
        altitudeTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
        riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    healthUpdate?: {
        routeDirectionId: number;
        countryCode: string;
        success: boolean;
        failureReason?: string;
        repair?: string;
    };
}
export declare function extractLearningSignals(feedback: TripOutcomeFeedback): LearningSignal;
