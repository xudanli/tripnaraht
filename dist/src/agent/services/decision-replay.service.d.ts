import { DecisionNode, DecisionOutput, TradeoffDimension } from '../interfaces/decision-node.interface';
import { OrchestratorState } from '../interfaces/trip-plan.interface';
import { PrismaService } from '../../prisma/prisma.service';
export interface DecisionSnapshot {
    snapshot_id: string;
    timestamp: string;
    state: OrchestratorState;
    decision_node?: DecisionNode;
    decision_output?: DecisionOutput;
    metadata: {
        step: string;
        actor: string;
        trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT';
    };
}
export interface DecisionTimeline {
    trip_run_id: string;
    created_at: string;
    snapshots: DecisionSnapshot[];
    key_decision_points: Array<{
        snapshot_id: string;
        description: string;
        importance: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    total_duration_ms: number;
}
export interface WhatIfInput {
    base_snapshot_id: string;
    changes: Array<{
        type: 'PREFERENCE_CHANGE' | 'CONSTRAINT_CHANGE' | 'OPTION_CHANGE' | 'DATE_CHANGE';
        field: string;
        original_value: any;
        new_value: any;
    }>;
}
export interface WhatIfResult {
    original_snapshot_id: string;
    simulated_output: DecisionOutput;
    comparison: {
        score_change: number;
        ranking_changes: Array<{
            option_id: string;
            old_rank: number;
            new_rank: number;
        }>;
        tradeoff_changes: Record<TradeoffDimension, {
            old: number;
            new: number;
            change: number;
        }>;
    };
    insights: string[];
}
export interface DecisionStyleModel {
    user_id?: string;
    inferred_preferences: {
        pace: 'SLOW' | 'BALANCED' | 'FAST';
        priority: TradeoffDimension;
        risk_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
        budget_sensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    patterns: Array<{
        pattern: string;
        frequency: number;
        confidence: number;
    }>;
    learning_signals: Array<{
        signal_type: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'QUESTION';
        context: string;
        timestamp: string;
    }>;
}
export declare class DecisionReplayService {
    private readonly prisma?;
    private readonly logger;
    private timelinesCache;
    private styleModelsCache;
    constructor(prisma?: PrismaService);
    createSnapshot(state: OrchestratorState, trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT', decisionNode?: DecisionNode, decisionOutput?: DecisionOutput): DecisionSnapshot;
    getSnapshot(tripRunId: string, snapshotId: string): DecisionSnapshot | undefined;
    getLatestSnapshot(tripRunId: string): DecisionSnapshot | undefined;
    getTimeline(tripRunId: string): DecisionTimeline | undefined;
    loadTimelineFromDB(tripRunId: string): Promise<DecisionTimeline | undefined>;
    buildTimelineSummary(tripRunId: string): {
        total_snapshots: number;
        key_decisions: number;
        duration_ms: number;
        phases: Array<{
            phase: string;
            snapshots: number;
            duration_ms: number;
        }>;
    } | undefined;
    replayToSnapshot(tripRunId: string, snapshotId: string): {
        restored_state: OrchestratorState;
        skipped_steps: string[];
        replay_point: string;
    } | undefined;
    getDiffBetweenSnapshots(tripRunId: string, fromSnapshotId: string, toSnapshotId: string): {
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
    } | undefined;
    simulateWhatIf(input: WhatIfInput, decisionOutput: DecisionOutput): WhatIfResult;
    generateCounterfactualQuestions(decisionOutput: DecisionOutput): Array<{
        question: string;
        what_if_input: WhatIfInput;
        expected_impact: string;
    }>;
    recordLearningSignal(userId: string, signalType: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'QUESTION', context: string): void;
    getDecisionStyle(userId: string): DecisionStyleModel | undefined;
    inferPreferencesFromHistory(userId: string): {
        suggested_priority: TradeoffDimension;
        suggested_risk_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
        confidence: number;
        reasoning: string;
    };
    private cloneState;
    private inferActor;
    private addToTimeline;
    private persistSnapshot;
    private applyWhatIfChange;
    private recalculateScores;
    private compareOutputs;
    private generateWhatIfInsights;
    private getOrCreateStyleModel;
    private updateInferredPreferences;
}
