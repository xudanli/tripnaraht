import { OrchestrationStep, SubAgentType, GuardianType, OrchestratorState } from '../../../agent/interfaces/trip-plan.interface';
import { TripNARAStepDraft, SubAgentMapping } from '../../interfaces/chain-of-work.interface';
export declare class SubAgentMappingService {
    private readonly logger;
    private readonly stepToSubAgentMap;
    private readonly subAgentToGuardianMap;
    mapStepToSubAgent(step: TripNARAStepDraft, context?: OrchestratorState): Promise<SubAgentMapping>;
    private getPromptTemplate;
    private getOutputSchema;
    mapToGuardian(subAgent: SubAgentType, step: OrchestrationStep): GuardianType | null;
}
