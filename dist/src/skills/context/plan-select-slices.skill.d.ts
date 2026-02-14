import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { ContextBlock } from '../../agent/context-engine/types/context-package.types';
export interface PlanSelectSlicesInput extends SkillInput {
    tripId: string;
    scope: string[];
    phase?: string;
}
export interface PlanSelectSlicesOutput extends SkillOutput {
    blocks: ContextBlock[];
    summary: {
        selectedDays: number[];
        selectedSegments: string[];
        latestRejection?: {
            persona: string;
            reason: string;
            timestamp: string;
        };
    };
}
export declare class PlanSelectSlicesSkill implements Skill<PlanSelectSlicesInput, PlanSelectSlicesOutput> {
    private readonly prisma?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
        toolGroup: "CONTEXT";
    };
    constructor(prisma?: PrismaService);
    execute(input: PlanSelectSlicesInput): Promise<PlanSelectSlicesOutput>;
}
