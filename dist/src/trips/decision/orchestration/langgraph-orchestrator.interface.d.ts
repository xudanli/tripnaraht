export type LangGraphAgentType = 'PLANNER' | 'NARRATOR' | 'COMPLIANCE' | 'LOCAL_INSIGHT' | 'CORE_DECISION';
export type PlanningPhase = 'DRAFTING' | 'SAFETY_CHECK' | 'PACING_ADJUSTMENT' | 'FINALIZING';
export interface LangGraphState {
    userQuery: string;
    extractedParams?: {
        countryCode?: string;
        month?: number;
        routeDirectionId?: string;
        humanCapability?: Record<string, any>;
        specialConstraints?: string[];
        strategyMode?: import('../strategy/types/strategy-mode.types').StrategyMode;
    };
    planningPhase?: PlanningPhase;
    strategyMode?: import('../strategy/types/strategy-mode.types').StrategyMode;
    coreToolInput?: any;
    coreToolOutput?: any;
    complianceResult?: {
        requiresPermit: boolean;
        requiresGuide: boolean;
        valid: boolean;
        evidence: string[];
    };
    finalResponse?: string;
    error?: string;
    metadata?: Record<string, any>;
}
export interface LangGraphNodeConfig {
    id: string;
    agentType: LangGraphAgentType;
    description: string;
    dependsOn?: string[];
    parallel?: boolean;
}
export interface ILangGraphOrchestrator {
    execute(userQuery: string, context?: Record<string, any>): Promise<LangGraphState>;
    registerAgent(agentType: LangGraphAgentType, agent: any): void;
    getGraphStructure(): {
        nodes: LangGraphNodeConfig[];
        edges: Array<{
            from: string;
            to: string;
            condition?: string;
        }>;
    };
}
export interface IPlannerAgent {
    analyzeQuery(state: LangGraphState): Promise<{
        intent: string;
        extractedParams: LangGraphState['extractedParams'];
        nextStep: 'CORE_DECISION' | 'COMPLIANCE_CHECK' | 'LOCAL_INSIGHT';
    }>;
}
export interface INarratorAgent {
    generateExplanation(coreToolOutput: any, state?: LangGraphState, complianceResult?: LangGraphState['complianceResult']): Promise<string>;
}
export interface IComplianceAgent {
    checkCompliance(countryCode: string, routeDirectionId: string, userParams: any): Promise<LangGraphState['complianceResult']>;
}
