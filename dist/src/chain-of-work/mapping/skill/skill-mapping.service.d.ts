import { OrchestratorState } from '../../../agent/interfaces/trip-plan.interface';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { TripNARAStepDraft, SkillMapping } from '../../interfaces/chain-of-work.interface';
export declare class SkillMappingService {
    private readonly skillsRegistry;
    private readonly logger;
    private readonly cache;
    constructor(skillsRegistry: SkillsRegistryService);
    mapStepToSkills(step: TripNARAStepDraft, context?: OrchestratorState): Promise<SkillMapping[]>;
    private calculateMatchScore;
    private keywordMatch;
    private typeMatch;
    private explainMatch;
    private getCacheKey;
}
