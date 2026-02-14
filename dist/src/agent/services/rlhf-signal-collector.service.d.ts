import { PrismaService } from '../../prisma/prisma.service';
import { DecisionOutput } from '../interfaces/decision-node.interface';
export interface BehaviorSignal {
    signal_id: string;
    timestamp: string;
    user_id?: string;
    trip_run_id: string;
    signal_type: 'VIEW' | 'CLICK' | 'HOVER' | 'SCROLL' | 'TIME_SPENT' | 'EXPAND' | 'COLLAPSE';
    target: {
        element_type: 'PLAN' | 'OPTION' | 'COMPARISON' | 'RISK' | 'TRADEOFF' | 'DETAIL';
        element_id: string;
        element_context?: string;
    };
    metadata?: {
        duration_ms?: number;
        scroll_depth?: number;
        viewport_visible?: boolean;
    };
}
export interface ExecutionSignal {
    signal_id: string;
    timestamp: string;
    trip_run_id: string;
    signal_type: 'START' | 'DEVIATION' | 'SKIP' | 'DELAY' | 'EARLY' | 'COMPLETE' | 'ABORT';
    context: {
        planned_item_id: string;
        planned_time?: string;
        actual_time?: string;
        deviation_minutes?: number;
        reason?: string;
    };
}
export interface FeedbackSignal {
    signal_id: string;
    timestamp: string;
    user_id?: string;
    trip_run_id: string;
    decision_point_id: string;
    feedback_type: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'QUESTION' | 'RATING' | 'COMMENT';
    value: {
        rating?: number;
        choice?: string;
        modification?: {
            field: string;
            from: any;
            to: any;
        };
        comment?: string;
    };
    context: {
        decision_output_summary?: string;
        user_query?: string;
    };
}
export interface DecisionQualityAssessment {
    trip_run_id: string;
    decision_point_id: string;
    assessed_at: string;
    metrics: {
        prediction_accuracy: number;
        user_satisfaction: number;
        execution_adherence: number;
        overall_quality: number;
    };
    factors: Array<{
        factor: string;
        score: number;
        weight: number;
        evidence: string;
    }>;
    improvement_signals: Array<{
        signal_type: string;
        description: string;
        priority: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
}
export interface LearningSignal {
    signal_id: string;
    timestamp: string;
    signal_category: 'PREFERENCE' | 'CONSTRAINT' | 'TRADEOFF' | 'RISK' | 'BEHAVIOR';
    signal_strength: number;
    observation: {
        context: string;
        user_action: string;
        system_prediction?: string;
        actual_outcome?: string;
    };
    learning_target: {
        model_component: 'RANKING' | 'PREFERENCE' | 'CONSTRAINT' | 'RISK';
        adjustment_direction: 'INCREASE' | 'DECREASE' | 'ADJUST';
        adjustment_magnitude: number;
    };
}
export declare class RLHFSignalCollectorService {
    private readonly prisma?;
    private readonly logger;
    private behaviorSignalsCache;
    private executionSignalsCache;
    private feedbackSignalsCache;
    private qualityAssessmentsCache;
    constructor(prisma?: PrismaService);
    recordBehaviorSignal(signal: Omit<BehaviorSignal, 'signal_id' | 'timestamp'>): BehaviorSignal;
    private persistBehaviorSignal;
    recordPlanViewTime(tripRunId: string, planId: string, durationMs: number): void;
    recordDetailInteraction(tripRunId: string, elementType: BehaviorSignal['target']['element_type'], elementId: string, action: 'EXPAND' | 'COLLAPSE'): void;
    recordExecutionSignal(signal: Omit<ExecutionSignal, 'signal_id' | 'timestamp'>): ExecutionSignal;
    private persistExecutionSignal;
    recordDeviation(tripRunId: string, plannedItemId: string, plannedTime: string, actualTime: string, reason?: string): void;
    recordSkippedActivity(tripRunId: string, plannedItemId: string, reason: string): void;
    recordFeedbackSignal(signal: Omit<FeedbackSignal, 'signal_id' | 'timestamp'>): FeedbackSignal;
    private persistFeedbackSignal;
    recordAcceptance(tripRunId: string, decisionPointId: string, chosenOptionId: string): void;
    recordRejection(tripRunId: string, decisionPointId: string, reason?: string): void;
    recordModification(tripRunId: string, decisionPointId: string, field: string, fromValue: any, toValue: any): void;
    recordRating(tripRunId: string, decisionPointId: string, rating: number, comment?: string): void;
    assessDecisionQuality(tripRunId: string, decisionPointId: string, decisionOutput: DecisionOutput): DecisionQualityAssessment;
    generateLearningSignals(tripRunId: string): LearningSignal[];
    getSignalSummary(tripRunId: string): {
        behavior_count: number;
        execution_count: number;
        feedback_count: number;
        deviations: number;
        skips: number;
        acceptances: number;
        rejections: number;
        avg_rating?: number;
    };
    private calculatePredictionAccuracy;
    private calculateUserSatisfaction;
    private calculateExecutionAdherence;
    private identifyImprovementSignals;
}
