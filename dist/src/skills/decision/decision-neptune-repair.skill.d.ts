import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { NeptuneStrategy } from '../../trips/decision/strategies/neptune-strategy.service';
import { WorldModelContext, RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
export interface DecisionNeptuneRepairInput extends SkillInput {
    world: WorldModelContext;
    brokenPlan: RoutePlanDraft;
    issue?: string;
}
export interface DecisionNeptuneRepairOutput extends SkillOutput {
    repairedPlan: RoutePlanDraft | null;
    replacements: Array<{
        type: string;
        originalId: string;
        newId: string;
        explanation: string;
    }>;
    philosophyCheck: {
        valid: boolean;
        violations?: string[];
    };
}
export declare class DecisionNeptuneRepairSkill implements Skill<DecisionNeptuneRepairInput, DecisionNeptuneRepairOutput> {
    private readonly neptuneStrategy;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "decision";
        toolGroup: "DOMAIN";
    };
    constructor(neptuneStrategy: NeptuneStrategy);
    execute(input: DecisionNeptuneRepairInput): Promise<DecisionNeptuneRepairOutput>;
}
