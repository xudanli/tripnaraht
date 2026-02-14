import { DetailUnderstandStatusSkill } from '../../skills/detail/detail-understand-status.skill';
import { DetailAnalyzeHealthSkill } from '../../skills/detail/detail-analyze-health.skill';
import { DetailExplainDecisionSkill } from '../../skills/detail/detail-explain-decision.skill';
import { DetailShowEvidenceSkill } from '../../skills/detail/detail-show-evidence.skill';
import { DetailState, TripHealth, TripStatusUnderstanding, DecisionExplanation } from '../../skills/detail/shared/detail-state.types';
import { PersonaShellService, PersonaShellOutput } from './persona-shell.service';
export interface TripDetailAgentRequest {
    tripId: string;
    action: 'get_status' | 'get_health' | 'explain_decisions' | 'show_evidence' | 'get_full';
    decisionId?: string;
    evidenceRefs?: string[];
}
export interface TripDetailAgentResponse {
    detailState: DetailState;
    personas?: PersonaShellOutput;
    uiOutput: {
        status?: TripStatusUnderstanding;
        health?: TripHealth;
        explanations?: DecisionExplanation[];
        evidence?: Array<{
            id: string;
            source: string;
            excerpt: string;
            relevance: string;
            confidence: 'low' | 'medium' | 'high';
        }>;
    };
}
export declare class TripDetailAgentService {
    private readonly detailUnderstandStatus?;
    private readonly detailAnalyzeHealth?;
    private readonly detailExplainDecision?;
    private readonly detailShowEvidence?;
    private readonly personaShell?;
    private readonly logger;
    constructor(detailUnderstandStatus?: DetailUnderstandStatusSkill, detailAnalyzeHealth?: DetailAnalyzeHealthSkill, detailExplainDecision?: DetailExplainDecisionSkill, detailShowEvidence?: DetailShowEvidenceSkill, personaShell?: PersonaShellService);
    execute(request: TripDetailAgentRequest): Promise<TripDetailAgentResponse>;
}
