import { DecisionType, DecisionTypeMappingRule } from '../interfaces/decision-draft.interface';
import { OrchestrationStep, SubAgentType, GuardianType } from '../../agent/interfaces/trip-plan.interface';
export declare class DecisionTypeToStepDraftMapper {
    private readonly logger;
    private readonly mappingRules;
    getStepTypes(decisionType: DecisionType): OrchestrationStep[];
    getRequiredSkills(decisionType: DecisionType): string[];
    getSubAgent(decisionType: DecisionType): SubAgentType | null;
    getGuardian(decisionType: DecisionType): GuardianType | null;
    getMappingRule(decisionType: DecisionType): DecisionTypeMappingRule | null;
    getAllMappingRules(): DecisionTypeMappingRule[];
}
