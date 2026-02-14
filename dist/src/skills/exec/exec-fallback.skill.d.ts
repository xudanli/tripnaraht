import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { FallbackPlan } from './shared/execution-state.types';
import { LlmService } from '../../llm/services/llm.service';
export interface ExecFallbackInput extends SkillInput {
    tripId: string;
    triggerReason: string;
    originalPlan: any;
    currentState?: any;
}
export interface ExecFallbackOutput extends SkillOutput {
    fallbackPlan: FallbackPlan;
}
export declare class ExecFallbackSkill implements Skill<ExecFallbackInput, ExecFallbackOutput> {
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
    execute(input: ExecFallbackInput): Promise<ExecFallbackOutput>;
    private buildPrompt;
}
