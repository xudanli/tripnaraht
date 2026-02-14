import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState } from '../shared/plan-state.types';
import { DecisionNeptuneRepairSkill } from '../../decision/decision-neptune-repair.skill';
import { LlmService } from '../../../llm/services/llm.service';
export interface PlanGateProposeSafeAlternativesInput extends SkillInput {
    planState: PlanState;
    issue: string;
}
export interface PlanGateProposeSafeAlternativesOutput extends SkillOutput {
    alternatives: Array<{
        type: 'alternative_route' | 'alternative_segment' | 'alternative_timing';
        description: string;
        evidenceComparison: {
            whySafer: string;
            whyMoreExecutable: string;
        };
    }>;
}
export declare class PlanGateProposeSafeAlternativesSkill implements Skill<PlanGateProposeSafeAlternativesInput, PlanGateProposeSafeAlternativesOutput> {
    private readonly llmService;
    private readonly neptuneRepair?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    constructor(llmService: LlmService, neptuneRepair?: DecisionNeptuneRepairSkill);
    execute(input: PlanGateProposeSafeAlternativesInput): Promise<PlanGateProposeSafeAlternativesOutput>;
    private buildPrompt;
}
