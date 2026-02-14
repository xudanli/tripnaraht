import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { DecisionExplanation } from './shared/detail-state.types';
import { LlmService } from '../../llm/services/llm.service';
export interface DetailExplainDecisionInput extends SkillInput {
    tripId: string;
    decisionId?: string;
    decisionLogs?: any[];
}
export interface DetailExplainDecisionOutput extends SkillOutput {
    explanations: DecisionExplanation[];
}
export declare class DetailExplainDecisionSkill implements Skill<DetailExplainDecisionInput, DetailExplainDecisionOutput> {
    private readonly llmService;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    constructor(llmService: LlmService);
    execute(input: DetailExplainDecisionInput): Promise<DetailExplainDecisionOutput>;
    private buildPrompt;
}
