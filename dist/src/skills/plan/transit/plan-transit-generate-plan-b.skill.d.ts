import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { TransferSegment } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
export interface PlanTransitGeneratePlanBInput extends SkillInput {
    segment: TransferSegment;
    context?: any;
}
export interface PlanTransitGeneratePlanBOutput extends SkillOutput {
    planBOptions: Array<{
        type: 'alternative_city' | 'alternative_transport' | 'alternative_timing';
        description: string;
        impact: {
            budget?: string;
            pace?: string;
            risk?: string;
        };
        recommendation: string;
    }>;
}
export declare class PlanTransitGeneratePlanBSkill implements Skill<PlanTransitGeneratePlanBInput, PlanTransitGeneratePlanBOutput> {
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
    execute(input: PlanTransitGeneratePlanBInput): Promise<PlanTransitGeneratePlanBOutput>;
    private buildPrompt;
}
