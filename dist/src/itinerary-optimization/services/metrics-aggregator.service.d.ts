import { OptimizationResult } from '../interfaces/plan-request.interface';
export interface RouteOptimizationMetrics {
    executability: {
        success_rate: number;
        rejection_rate: number;
        rejection_reasons: Record<string, number>;
        total_attempts: number;
        successful_attempts: number;
        rejected_attempts: number;
    };
    rejection_quality: {
        reasonable_rate: number;
        false_positive_rate: number;
        false_negative_rate: number;
        total_rejections: number;
        reasonable_rejections: number;
        false_positives: number;
        false_negatives: number;
    };
    alternative_acceptance: {
        proposed_count: number;
        accepted_count: number;
        acceptance_rate: number;
        avg_improvement: number;
        improvement_distribution: {
            min: number;
            max: number;
            median: number;
            p75: number;
            p90: number;
        };
    };
    deviation: {
        avg_plan_change_ratio: number;
        avg_time_deviation_min: number;
        avg_cost_deviation_pct: number;
        max_time_deviation_min: number;
        max_cost_deviation_pct: number;
    };
    data_quality: {
        missing_data_rate: number;
        stale_data_rate: number;
        low_reliability_rate: number;
        data_sources: Record<string, {
            count: number;
            missing: number;
            stale: number;
            low_reliability: number;
        }>;
    };
    performance: {
        avg_solve_time_ms: number;
        avg_solve_time_p50_ms: number;
        avg_solve_time_p90_ms: number;
        avg_solve_time_p99_ms: number;
        max_solve_time_ms: number;
    };
}
export interface ExecutionRecord {
    request_id: string;
    timestamp: string;
    status: 'SUCCESS' | 'REJECTED' | 'FAILED';
    rejection_reason?: string;
    rejection_quality?: 'REASONABLE' | 'FALSE_POSITIVE' | 'FALSE_NEGATIVE';
    optimization_result?: OptimizationResult;
    alternatives_proposed?: number;
    alternatives_accepted?: number;
    improvement_pct?: number;
    plan_change_ratio?: number;
    time_deviation_min?: number;
    cost_deviation_pct?: number;
    data_quality?: {
        missing: string[];
        stale: string[];
        low_reliability: string[];
    };
    solve_time_ms?: number;
}
export declare class MetricsAggregatorService {
    private readonly logger;
    private executionRecords;
    recordExecution(record: ExecutionRecord): void;
    recordExecutions(records: ExecutionRecord[]): void;
    aggregateMetrics(options?: {
        start_time?: string;
        end_time?: string;
        filter?: (record: ExecutionRecord) => boolean;
    }): RouteOptimizationMetrics;
    private calculateExecutability;
    private calculateRejectionQuality;
    private calculateAlternativeAcceptance;
    private calculateDeviation;
    private calculateDataQuality;
    private calculatePerformance;
    private createEmptyMetrics;
    getExecutionRecords(options?: {
        start_time?: string;
        end_time?: string;
        limit?: number;
    }): ExecutionRecord[];
    clearRecords(): void;
}
