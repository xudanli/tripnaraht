import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, TimeWindow } from '../shared/plan-state.types';
export interface PlanPaceComputeTimeWindowsInput extends SkillInput {
    planState: PlanState;
    bufferPolicy?: 'conservative' | 'standard' | 'aggressive';
}
export interface PlanPaceComputeTimeWindowsOutput extends SkillOutput {
    timeWindows: TimeWindow[];
}
export declare class PlanPaceComputeTimeWindowsSkill implements Skill<PlanPaceComputeTimeWindowsInput, PlanPaceComputeTimeWindowsOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: PlanPaceComputeTimeWindowsInput): Promise<PlanPaceComputeTimeWindowsOutput>;
}
