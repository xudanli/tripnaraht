import { DecisionStatsService } from './decision-stats.service';
import { DecisionSource } from '../shared/decision-result.types';
export interface HeuristicConversionTarget {
    scenario: string;
    targetSource: DecisionSource;
    priority: number;
    conversionPlan: {
        requiredData: string[];
        requiredModels: string[];
        estimatedEffort: number;
    };
    currentHeuristicCount: number;
}
export interface HeuristicDietPlan {
    totalHeuristicDecisions: number;
    totalDecisions: number;
    heuristicRatio: number;
    conversionTargets: HeuristicConversionTarget[];
    estimatedHeuristicRatioAfterConversion: number;
}
export declare class HeuristicDietService {
    private readonly decisionStats;
    private readonly logger;
    constructor(decisionStats: DecisionStatsService);
    generateDietPlan(): Promise<HeuristicDietPlan>;
    getConversionGuidelines(): string;
}
