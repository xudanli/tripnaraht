import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { OverrunDetection, PlanState } from '../shared/plan-state.types';
export interface PlanBudgetDetectOverrunInput extends SkillInput {
    planState: PlanState;
    changes?: {
        route?: any;
        accommodation?: any;
        transportation?: any;
    };
}
export interface PlanBudgetDetectOverrunOutput extends SkillOutput {
    overrun: OverrunDetection | null;
}
export declare class PlanBudgetDetectOverrunSkill implements Skill<PlanBudgetDetectOverrunInput, PlanBudgetDetectOverrunOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: PlanBudgetDetectOverrunInput): Promise<PlanBudgetDetectOverrunOutput>;
    private getOverrunReason;
}
