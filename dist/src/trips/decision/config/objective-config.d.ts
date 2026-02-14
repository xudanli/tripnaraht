export interface ObjectiveWeights {
    satisfaction: number;
    violationRisk: number;
    robustness: number;
    cost: number;
}
export interface PolicyProfile {
    name: string;
    description: string;
    objectiveWeights: ObjectiveWeights;
    abuConfig: {
        intentWeight: number;
        qualityWeight: number;
        uniquenessWeight: number;
        weatherPenaltyFactor: number;
        riskPenaltyFactor: number;
        costPenaltyFactor: number;
    };
    drdreConfig: {
        priorityWeights: {
            mustSee: number;
            quality: number;
            inventoryRisk: number;
            travelTimePenalty: number;
        };
    };
}
export declare const POLICY_PROFILES: Record<string, PolicyProfile>;
export declare function getPolicyProfile(pace?: 'relaxed' | 'moderate' | 'intense', style?: 'family' | 'photography' | 'adventure'): PolicyProfile;
