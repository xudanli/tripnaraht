import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
import { DecisionStage, DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
export interface DecisionStageInput extends BaseSkillInput {
    tripId?: string;
    routeDirectionId?: string;
    countryCode?: string;
    stage?: DecisionStage;
    startDate?: string;
    endDate?: string;
    limit?: number;
}
export interface DecisionStageOutput extends SkillOutput {
    stages: Array<{
        stage: DecisionStage;
        count: number;
        logs: DecisionLogEntry[];
    }>;
    summary: {
        totalLogs: number;
        stageDistribution: Record<DecisionStage, number>;
        personaDistribution: Record<'ABU' | 'DR_DRE' | 'NEPTUNE', number>;
        sourceDistribution: Record<'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC', number>;
    };
}
export declare class DecisionStageSkill implements Skill<DecisionStageInput, DecisionStageOutput> {
    private readonly decisionLogStorage?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "decision";
    };
    constructor(decisionLogStorage?: DecisionLogStorageService);
    execute(input: DecisionStageInput): Promise<DecisionStageOutput>;
}
