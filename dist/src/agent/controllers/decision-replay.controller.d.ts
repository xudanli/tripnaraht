import { DecisionReplayService, DecisionSnapshot, DecisionTimeline, WhatIfInput, WhatIfResult } from '../services/decision-replay.service';
import { DecisionOutput } from '../interfaces/decision-node.interface';
export declare class DecisionReplayController {
    private readonly replayService;
    private readonly logger;
    constructor(replayService: DecisionReplayService);
    getTimeline(tripRunId: string): DecisionTimeline | {
        error: string;
    };
    getTimelineSummary(tripRunId: string): {
        total_snapshots: number;
        key_decisions: number;
        duration_ms: number;
        phases: Array<{
            phase: string;
            snapshots: number;
            duration_ms: number;
        }>;
    } | {
        error: string;
    };
    getSnapshot(tripRunId: string, snapshotId: string): DecisionSnapshot | {
        error: string;
    };
    getLatestSnapshot(tripRunId: string): DecisionSnapshot | {
        error: string;
    };
    replayToSnapshot(tripRunId: string, snapshotId: string): {
        restored_state: import("../interfaces/trip-plan.interface").OrchestratorState;
        skipped_steps: string[];
        replay_point: string;
    } | {
        error: string;
    };
    getDiff(tripRunId: string, fromSnapshotId: string, toSnapshotId: string): {
        state_changes: Array<{
            field: string;
            from: any;
            to: any;
        }>;
        decision_changes: Array<{
            aspect: string;
            description: string;
        }>;
        time_elapsed_ms: number;
    } | {
        error: string;
    };
    simulateWhatIf(body: {
        input: WhatIfInput;
        decision_output: DecisionOutput;
    }): WhatIfResult;
    generateCounterfactualQuestions(tripRunId: string, decisionOutput: DecisionOutput): {
        trip_run_id: string;
        questions: {
            question: string;
            what_if_input: WhatIfInput;
            expected_impact: string;
        }[];
    };
    getDecisionStyle(userId: string): import("../services/decision-replay.service").DecisionStyleModel | {
        error: string;
    };
    inferPreferences(userId: string): {
        suggested_priority: import("../interfaces/decision-node.interface").TradeoffDimension;
        suggested_risk_tolerance: "LOW" | "MEDIUM" | "HIGH";
        confidence: number;
        reasoning: string;
    };
    recordLearningSignal(userId: string, body: {
        signal_type: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'QUESTION';
        context: string;
    }): {
        success: boolean;
        user_id: string;
    };
    applyUserJudgment(tripRunId: string, body: {
        judgment_point_id: string;
        selected_option: string;
        user_id?: string;
        context?: Record<string, any>;
    }): {
        error: string;
        success?: undefined;
        trip_run_id?: undefined;
        judgment_applied?: undefined;
        current_snapshot_id?: undefined;
        message?: undefined;
        suggested_action?: undefined;
    } | {
        success: boolean;
        trip_run_id: string;
        judgment_applied: {
            judgment_point_id: string;
            selected_option: string;
        };
        current_snapshot_id: string;
        message: string;
        suggested_action: string;
        error?: undefined;
    };
    getPendingJudgments(tripRunId: string): {
        pending_judgments: any[];
        message: string;
        trip_run_id?: undefined;
        total?: undefined;
        snapshot_id?: undefined;
    } | {
        trip_run_id: string;
        pending_judgments: {
            question: string;
            context: string;
            options: Array<{
                id: string;
                label: string;
                impact: string;
            }>;
            recommendation?: string;
        }[];
        total: number;
        snapshot_id: string;
        message?: undefined;
    };
}
