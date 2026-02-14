import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { DrDreStrategy } from '../../trips/decision/strategies/dr-dre-strategy.service';
import { WorldModelContext, RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
export interface DecisionDrdrePaceInput extends SkillInput {
    world: WorldModelContext;
    draftPlan: RoutePlanDraft;
}
export interface DecisionDrdrePaceOutput extends SkillOutput {
    adjustedPlan: RoutePlanDraft | null;
    changes: Array<{
        type: 'SPLIT_DAY' | 'BUFFER_DAY' | 'ADJUST_PACE';
        description: string;
        dayIndex?: number;
    }>;
    reasonSummary: string;
}
export declare class DecisionDrdrePaceSkill implements Skill<DecisionDrdrePaceInput, DecisionDrdrePaceOutput> {
    private readonly drDreStrategy;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "decision";
        toolGroup: "DOMAIN";
    };
    constructor(drDreStrategy: DrDreStrategy);
    execute(input: DecisionDrdrePaceInput): Promise<DecisionDrdrePaceOutput>;
}
