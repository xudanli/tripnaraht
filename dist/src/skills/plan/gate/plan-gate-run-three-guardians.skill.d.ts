import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, GateStatus } from '../shared/plan-state.types';
import { DecisionRunThreeGuardiansSkill } from '../../decision/decision-run-three-guardians.skill';
import { WorldBuildContextSkill } from '../../world/world-build-context.skill';
export interface PlanGateRunThreeGuardiansInput extends SkillInput {
    planState: PlanState;
    tripId?: string;
}
export interface PlanGateRunThreeGuardiansOutput extends SkillOutput {
    gateStatus: GateStatus;
}
export declare class PlanGateRunThreeGuardiansSkill implements Skill<PlanGateRunThreeGuardiansInput, PlanGateRunThreeGuardiansOutput> {
    private readonly decisionRunThreeGuardians?;
    private readonly worldBuildContext?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    constructor(decisionRunThreeGuardians?: DecisionRunThreeGuardiansSkill, worldBuildContext?: WorldBuildContextSkill);
    execute(input: PlanGateRunThreeGuardiansInput): Promise<PlanGateRunThreeGuardiansOutput>;
}
