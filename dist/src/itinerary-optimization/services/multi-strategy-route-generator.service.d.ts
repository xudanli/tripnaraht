import { PlanRequest, OptimizationResult } from '../interfaces/plan-request.interface';
import { EnhancedVRPTWOptimizerService } from './enhanced-vrptw-optimizer.service';
import { RouteOptimizerService } from './route-optimizer.service';
export interface StrategyConfig {
    name: 'VRPTW' | 'SA' | 'GA' | 'MONTE_CARLO';
    weight: number;
    samples: number;
    config?: any;
}
export interface StartCandidate {
    node_id: number;
    name: string;
    geo: {
        lat: number;
        lng: number;
    };
    priority: number;
}
export interface CandidateRoute {
    id: string;
    request: PlanRequest;
    result: OptimizationResult;
    strategy: string;
    start_candidate?: StartCandidate;
    sample_index: number;
    diversity_score?: number;
    metadata: {
        solve_time_ms: number;
        seed?: number;
        timestamp: string;
    };
}
export interface MultiStrategyConfig {
    start_candidates?: StartCandidate[];
    strategies: StrategyConfig[];
    sample_count?: number;
    diversity_threshold?: number;
    robustness_evaluation?: boolean;
    aggregation_mode?: 'BEST' | 'ENSEMBLE' | 'VOTING';
    time_budget_ms?: number;
}
export interface MultiStrategyResult {
    candidates: CandidateRoute[];
    best_candidate?: CandidateRoute;
    aggregation_result?: {
        mode: 'BEST' | 'ENSEMBLE' | 'VOTING';
        ensemble_route?: OptimizationResult;
        voting_route?: OptimizationResult;
    };
    statistics: {
        total_candidates: number;
        successful_candidates: number;
        failed_candidates: number;
        avg_solve_time_ms: number;
        diversity_stats: {
            min: number;
            max: number;
            avg: number;
            std: number;
        };
    };
}
export declare class MultiStrategyRouteGeneratorService {
    private enhancedVRPTWOptimizer;
    private routeOptimizer;
    private readonly logger;
    constructor(enhancedVRPTWOptimizer: EnhancedVRPTWOptimizerService, routeOptimizer: RouteOptimizerService);
    generateCandidateRoutes(baseRequest: PlanRequest, config: MultiStrategyConfig): Promise<MultiStrategyResult>;
    private createRequestVariant;
    private runStrategy;
    private deduplicateAndFilter;
    private calculateDiversityScores;
    private calculateRouteDiversity;
    private calculateDiversityStats;
    private selectBestCandidate;
    private getRouteScore;
    private aggregateResults;
    private parseTimeToMinutes;
}
