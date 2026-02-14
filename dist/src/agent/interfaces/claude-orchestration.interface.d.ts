import { DecisionLogEntry } from './trip-plan.interface';
import { ErrorType } from './error-types.interface';
import { ClarificationQuestion } from './clarification.interface';
export interface IntentAnalysis {
    intentType: 'simple_query' | 'complex_planning' | 'analysis' | 'decision' | 'mixed';
    complexity: 'simple' | 'medium' | 'complex';
    requiredCapabilities: string[];
    confidence: number;
    reasoning: string;
    keywords?: string[];
    entities?: Record<string, any>;
}
export interface RoutingDecision {
    route: 'SYSTEM1_API' | 'SYSTEM1_RAG' | 'SYSTEM2_REASONING' | 'SYSTEM2_ANALYSIS' | 'SYSTEM2_WEBBROWSE';
    confidence: number;
    reasoning: string;
    budget: {
        max_seconds: number;
        max_steps: number;
        max_browser_steps: number;
    };
    requiredCapabilities?: string[];
    consentRequired?: boolean;
}
export interface SkillsPlan {
    selectedSkills: Array<{
        skillName: string;
        reason: string;
        priority: number;
        input: Record<string, any>;
        dependencies?: string[];
    }>;
    executionOrder: string[];
    dependencies: Record<string, string[]>;
}
export interface ExecutionStep {
    id: string;
    type: 'skill' | 'action' | 'parallel_group';
    skillName?: string;
    actionName?: string;
    dependencies: string[];
    parallel: boolean;
    input?: Record<string, any>;
    fallback?: {
        onError: 'continue' | 'stop' | 'retry';
        retryCount?: number;
    };
}
export interface ExecutionPlan {
    steps: ExecutionStep[];
    parallelGroups: string[][];
    fallbackStrategy: {
        onError: 'continue' | 'stop';
        retryCount: number;
    };
    estimatedDuration?: number;
    estimatedCost?: number;
}
export interface OrchestrationResult {
    success: boolean;
    result: {
        [key: string]: any;
        needsUserConfirmation?: boolean;
        clarificationMessage?: string;
        clarificationQuestions?: ClarificationQuestion[];
        missingServices?: string[];
        solutions?: string[];
        errorType?: ErrorType;
    };
    answerText: string;
    stepsExecuted: Array<{
        stepId: string;
        skillName?: string;
        actionName?: string;
        success: boolean;
        result?: any;
        error?: string;
        duration: number;
    }>;
    totalDuration: number;
    totalCost?: number;
    decisionLog?: DecisionLogEntry[];
}
export interface AgentContext {
    requestId: string;
    userId: string;
    tripId?: string | null;
    conversationHistory?: string[];
    userPreferences?: Record<string, any>;
    availableSkills?: string[];
    availableActions?: string[];
}
