import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessAgentService } from '../../trips/decision/readiness/readiness-agent.service';
import { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { TripPlan } from '../../trips/decision/plan-model';
export interface ReadinessGenerateChecklistInput extends SkillInput {
    world: WorldModelContext;
    routeDirection?: any;
    userProfile?: {
        nationality?: string;
        residencyCountry?: string;
        tags?: string[];
    };
    plan?: TripPlan;
}
export interface ReadinessGenerateChecklistOutput extends SkillOutput {
    items: Array<{
        type: 'GEAR' | 'DOCUMENT' | 'HEALTH' | 'SKILL';
        severity: 'MUST' | 'SHOULD' | 'OPTIONAL';
        title: string;
        description: string;
        reason: string;
    }>;
    itemsByType: {
        GEAR: Array<any>;
        DOCUMENT: Array<any>;
        HEALTH: Array<any>;
        SKILL: Array<any>;
    };
    itemsBySeverity: {
        MUST: Array<any>;
        SHOULD: Array<any>;
        OPTIONAL: Array<any>;
    };
    summary: {
        totalItems: number;
        mustItems: number;
        shouldItems: number;
        optionalItems: number;
    };
}
export declare class ReadinessGenerateChecklistSkill implements Skill<ReadinessGenerateChecklistInput, ReadinessGenerateChecklistOutput> {
    private readonly readinessAgent;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "readiness";
        inputSchema: {
            dependencies: {
                param: string;
                alternatives: string[];
            }[];
            extractors: {
                tripId: string;
            };
        };
    };
    constructor(readinessAgent: ReadinessAgentService);
    execute(input: ReadinessGenerateChecklistInput): Promise<ReadinessGenerateChecklistOutput>;
}
