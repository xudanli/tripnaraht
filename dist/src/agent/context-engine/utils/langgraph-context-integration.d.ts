import { ContextEngineerService } from '../services/context-engineer.service';
import { ContextPackage } from '../types/context-package.types';
import { LangGraphState } from '../../../trips/decision/orchestration/langgraph-orchestrator.interface';
export declare function buildContextForNode(state: LangGraphState, contextEngineer: ContextEngineerService, options: {
    agent: string;
    phase: string;
    tokenBudget?: number;
    requiredTopics?: string[];
}): Promise<{
    contextPackage: ContextPackage;
    projection?: any;
}>;
export declare function writeBackFromNode(state: LangGraphState, contextEngineer: ContextEngineerService, data: {
    tripRunId: string;
    attemptNumber?: number;
    scratchpad: {
        planOutline?: string;
        openQuestions?: string[];
        constraintsAssumed?: string[];
        nextActions?: string[];
        failureNotes?: string;
    };
    decisionLogDelta?: any[];
    artifactsRefs?: Record<string, string>;
}): Promise<void>;
export declare function buildPromptFromContextPackage(contextPackage: ContextPackage): string;
