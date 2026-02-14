import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
export interface PlanPaceAdjustScheduleInput extends SkillInput {
    planState: PlanState;
    userFeedback: 'too_tired' | 'too_rushed' | 'too_relaxed';
}
export interface PlanPaceAdjustScheduleOutput extends SkillOutput {
    adjustedTimeline: {
        days: number;
        changes: Array<{
            day: number;
            action: 'delete' | 'replace' | 'move' | 'add_rest';
            description: string;
        }>;
    };
    diff: {
        deleted: string[];
        replaced: string[];
        moved: Array<{
            from: number;
            to: number;
        }>;
        added: string[];
    };
    impact: {
        experience?: string;
        budget?: string;
        feasibility?: string;
    };
}
export declare class PlanPaceAdjustScheduleSkill implements Skill<PlanPaceAdjustScheduleInput, PlanPaceAdjustScheduleOutput> {
    private readonly llmService;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    constructor(llmService: LlmService);
    execute(input: PlanPaceAdjustScheduleInput): Promise<PlanPaceAdjustScheduleOutput>;
    private buildPrompt;
}
