import { PlanState } from '../../skills/plan/shared/plan-state.types';
export type PersonaName = 'ABU' | 'DR_DRE' | 'NEPTUNE';
export interface PersonaStatement {
    persona: PersonaName;
    icon: string;
    slogan: string;
    verdict: 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM';
    explanation: string;
    evidence: Array<{
        source: string;
        excerpt: string;
        relevance: string;
    }>;
    recommendations?: Array<{
        action: string;
        reason: string;
        impact: string;
    }>;
    confirmations?: string[];
}
export interface PersonaShellOutput {
    personas: {
        abu: PersonaStatement | null;
        drdre: PersonaStatement | null;
        neptune: PersonaStatement | null;
    };
    consolidatedDecision: {
        status: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
        summary: string;
        nextSteps: string[];
    };
    timestamp: string;
}
export declare class PersonaShellService {
    private readonly logger;
    wrapAsPersonas(planState: PlanState): Promise<PersonaShellOutput>;
    private buildAbuStatement;
    private buildDrdreStatement;
    private buildNeptuneStatement;
    private buildConsolidatedDecision;
}
