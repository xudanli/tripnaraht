import { DecisionStatsService } from './services/decision-stats.service';
import { HeuristicDietService } from './services/heuristic-diet.service';
import { DecisionLogClusteringService } from './evaluation/decision-log-clustering.service';
export declare class DecisionStatsController {
    private readonly decisionStats;
    private readonly heuristicDiet;
    private readonly clusteringService;
    constructor(decisionStats: DecisionStatsService, heuristicDiet: HeuristicDietService, clusteringService: DecisionLogClusteringService);
    getStatsByCountry(countryCode?: string, startDate?: string, endDate?: string): Promise<import("./services/decision-stats.service").DecisionDistributionStats>;
    getStatsByRouteDirection(routeDirectionId?: string, startDate?: string, endDate?: string): Promise<import("./services/decision-stats.service").DecisionDistributionStats>;
    getPersonaTriggerStats(startDate?: string, endDate?: string): Promise<import("./services/decision-stats.service").PersonaTriggerStats[]>;
    getRealityDrivenRatio(countryCode?: string, routeDirectionId?: string, startDate?: string, endDate?: string): Promise<{
        ratio: number;
        percentage: string;
        message: string;
    }>;
    getHeuristicHotspots(limit?: string): Promise<{
        countryCode?: string;
        routeDirectionId?: string;
        heuristicCount: number;
        totalDecisions: number;
        heuristicRatio: number;
        suggestions: string[];
    }[]>;
    getHeuristicDietPlan(): Promise<import("./services/heuristic-diet.service").HeuristicDietPlan>;
    getRejectionReasons(countryCode?: string, routeDirectionId?: string, startDate?: string, endDate?: string, limit?: string): Promise<import("./evaluation/decision-log-clustering.service").RejectionCluster[]>;
    getReplacementReasons(countryCode?: string, routeDirectionId?: string, startDate?: string, endDate?: string, limit?: string): Promise<import("./evaluation/decision-log-clustering.service").ReplacementCluster[]>;
    getQualityReport(countryCode?: string, routeDirectionId?: string, startDate?: string, endDate?: string): Promise<import("./evaluation/decision-log-clustering.service").DecisionQualityReport>;
}
