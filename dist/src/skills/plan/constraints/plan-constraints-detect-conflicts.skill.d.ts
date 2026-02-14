import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, ConflictDetection } from '../shared/plan-state.types';
export interface PlanConstraintsDetectConflictsInput extends SkillInput {
    planState: PlanState;
}
export interface PlanConstraintsDetectConflictsOutput extends SkillOutput {
    conflicts: ConflictDetection;
}
export declare class PlanConstraintsDetectConflictsSkill implements Skill<PlanConstraintsDetectConflictsInput, PlanConstraintsDetectConflictsOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: PlanConstraintsDetectConflictsInput): Promise<PlanConstraintsDetectConflictsOutput>;
}
