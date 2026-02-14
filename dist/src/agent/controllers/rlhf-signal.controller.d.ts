import { RLHFSignalCollectorService, BehaviorSignal, ExecutionSignal, FeedbackSignal, DecisionQualityAssessment, LearningSignal } from '../services/rlhf-signal-collector.service';
import { DecisionOutput } from '../interfaces/decision-node.interface';
export declare class RLHFSignalController {
    private readonly rlhfService;
    private readonly logger;
    constructor(rlhfService: RLHFSignalCollectorService);
    recordBehaviorSignal(signal: Omit<BehaviorSignal, 'signal_id' | 'timestamp'>): BehaviorSignal;
    recordPlanViewTime(body: {
        trip_run_id: string;
        plan_id: string;
        duration_ms: number;
    }): {
        success: boolean;
        recorded: string;
    };
    recordDetailInteraction(body: {
        trip_run_id: string;
        element_type: BehaviorSignal['target']['element_type'];
        element_id: string;
        action: 'EXPAND' | 'COLLAPSE';
    }): {
        success: boolean;
        recorded: string;
    };
    recordExecutionSignal(signal: Omit<ExecutionSignal, 'signal_id' | 'timestamp'>): ExecutionSignal;
    recordDeviation(body: {
        trip_run_id: string;
        planned_item_id: string;
        planned_time: string;
        actual_time: string;
        reason?: string;
    }): {
        success: boolean;
        recorded: string;
    };
    recordSkippedActivity(body: {
        trip_run_id: string;
        planned_item_id: string;
        reason: string;
    }): {
        success: boolean;
        recorded: string;
    };
    recordFeedbackSignal(signal: Omit<FeedbackSignal, 'signal_id' | 'timestamp'>): FeedbackSignal;
    recordAcceptance(body: {
        trip_run_id: string;
        decision_point_id: string;
        chosen_option_id: string;
    }): {
        success: boolean;
        recorded: string;
    };
    recordRejection(body: {
        trip_run_id: string;
        decision_point_id: string;
        reason?: string;
    }): {
        success: boolean;
        recorded: string;
    };
    recordRating(body: {
        trip_run_id: string;
        decision_point_id: string;
        rating: number;
        comment?: string;
    }): {
        success: boolean;
        recorded: string;
    };
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
}
