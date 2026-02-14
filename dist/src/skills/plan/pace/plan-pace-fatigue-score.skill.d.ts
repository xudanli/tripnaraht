import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, FatigueScore } from '../shared/plan-state.types';
export interface PlanPaceFatigueScoreInput extends SkillInput {
    planState: PlanState;
}
export interface PlanPaceFatigueScoreOutput extends SkillOutput {
    fatigueScore: FatigueScore;
}
export declare class PlanPaceFatigueScoreSkill implements Skill<PlanPaceFatigueScoreInput, PlanPaceFatigueScoreOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: PlanPaceFatigueScoreInput): Promise<PlanPaceFatigueScoreOutput>;
}
