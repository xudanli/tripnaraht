import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, PlanSkeleton } from '../shared/plan-state.types';
export interface PlanArchitectCommitOptionInput extends SkillInput {
    selectedOption: PlanSkeleton;
    existingPlanState?: PlanState;
    context: any;
}
export interface PlanArchitectCommitOptionOutput extends SkillOutput {
    planState: PlanState;
    plan_version: number;
    diff: any;
    decision_log_ref: string;
}
export declare class PlanArchitectCommitOptionSkill implements Skill<PlanArchitectCommitOptionInput, PlanArchitectCommitOptionOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: PlanArchitectCommitOptionInput): Promise<PlanArchitectCommitOptionOutput>;
    private convertSkeletonToItinerary;
    private computeDiff;
}
