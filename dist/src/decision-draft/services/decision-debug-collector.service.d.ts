import { DecisionDraft, DecisionDebugInfo, LLMCall, SkillCall, PerformanceMetrics } from '../interfaces/decision-draft.interface';
import { ChainOfWorkTrace } from '../../chain-of-work/interfaces/chain-of-work.interface';
export declare class DecisionDebugCollectorService {
    private readonly logger;
    collectDebugInfo(decisionDraft: DecisionDraft, executionTrace?: ChainOfWorkTrace): Promise<DecisionDebugInfo>;
    collectLLMCalls(executionTrace: ChainOfWorkTrace): Promise<LLMCall[]>;
    collectSkillCalls(executionTrace: ChainOfWorkTrace): Promise<SkillCall[]>;
    calculatePerformanceMetrics(executionTrace: ChainOfWorkTrace): Promise<PerformanceMetrics>;
    updateDebugInfo(existingDebugInfo: DecisionDebugInfo | undefined, newExecutionTrace?: ChainOfWorkTrace): Promise<DecisionDebugInfo>;
    private mergeSkillCalls;
}
