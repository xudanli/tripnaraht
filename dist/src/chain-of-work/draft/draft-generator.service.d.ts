import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import { LlmService } from '../../llm/services/llm.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { TripNARAWorkflowDraft, DraftGenerationConfig } from '../interfaces/chain-of-work.interface';
export declare class DraftGeneratorService {
    private readonly llmService;
    private readonly skillsRegistry;
    private readonly logger;
    constructor(llmService: LlmService, skillsRegistry: SkillsRegistryService);
    generateDraft(request: TripPlanRequest, config?: DraftGenerationConfig): Promise<TripNARAWorkflowDraft>;
    private mapModelToProvider;
    private extractJSON;
    private parseDraft;
    private inferStepType;
    private getDraftGenerationSchema;
    private generateTemplateDraft;
}
