import { RouteType } from './router.interface';
import { AgentState } from './agent-state.interface';
import { System1Result } from './system1-info-card.interface';
export type CollaborationMode = 'SEQUENTIAL' | 'PARALLEL' | 'SYSTEM1_ONLY' | 'SYSTEM2_ONLY';
export type ConflictType = 'RESULT_DIVERGENCE' | 'CONFIDENCE_GAP' | 'RISK_ASSESSMENT_GAP' | 'RECOMMENDATION_GAP' | 'DATA_INCONSISTENCY' | 'TIMING_CONFLICT';
export type ConflictSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface Conflict {
    type: ConflictType;
    severity: ConflictSeverity;
    description: string;
    system1Value?: any;
    system2Value?: any;
    difference?: string;
    recommendation?: string;
    requiresUserAttention: boolean;
}
export interface DifferenceExplanation {
    field: string;
    system1Explanation: string;
    system2Explanation: string;
    reason: string;
    recommendation: string;
}
export interface System1CollaborationResult {
    result: System1Result;
    executionTime: number;
    confidence: number;
    dataSources: string[];
    timestamp: string;
}
export interface System2CollaborationResult {
    result: any;
    executionTime: number;
    confidence: number;
    reasoningChain: string[];
    dataSources: string[];
    timestamp: string;
}
export interface CollaborationResult {
    mode: CollaborationMode;
    system1Result?: System1CollaborationResult;
    system2Result?: System2CollaborationResult;
    conflicts: Conflict[];
    differences: DifferenceExplanation[];
    finalRecommendation: {
        primarySystem: 'SYSTEM1' | 'SYSTEM2' | 'BOTH';
        recommendation: string;
        confidence: number;
        explanation: string;
    };
    executionTimeline: {
        system1StartTime: number;
        system1EndTime?: number;
        system2StartTime: number;
        system2EndTime?: number;
        totalTime: number;
    };
    shouldShowSystem1First: boolean;
    system2Pending: boolean;
}
export interface CollaborationConfig {
    enableParallelExecution: boolean;
    system1Timeout: number;
    system2Timeout: number;
    conflictDetectionEnabled: boolean;
    autoResolveConflicts: boolean;
    showSystem1First: boolean;
}
export interface CollaborationRequest {
    userInput: string;
    state: AgentState;
    route1: RouteType;
    route2: RouteType;
    config?: Partial<CollaborationConfig>;
}
