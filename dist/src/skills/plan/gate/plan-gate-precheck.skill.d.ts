import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, GateStatus } from '../shared/plan-state.types';
export interface PlanGatePrecheckInput extends SkillInput {
    planState: PlanState;
}
export interface PlanGatePrecheckOutput extends SkillOutput {
    gateStatus: GateStatus;
}
export declare class PlanGatePrecheckSkill implements Skill<PlanGatePrecheckInput, PlanGatePrecheckOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: PlanGatePrecheckInput): Promise<PlanGatePrecheckOutput>;
}
