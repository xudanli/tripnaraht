import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
export interface DecisionLogAppendInput extends SkillInput {
    tripId?: string;
    countryCode?: string;
    routeDirectionId?: string;
    entries: Array<{
        persona: string;
        action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
        reasonCodes: string[];
        explanation: string;
        decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
        decisionStage?: 'ROUTE_PICK' | 'DEM_EVIDENCE' | 'ABU_GATE' | 'PACE_ADJUST' | 'SPATIAL_REPAIR' | 'READINESS' | 'FINALIZE';
        evidenceRefs?: string[];
        timestamp?: string;
    }>;
    metadata?: Record<string, any>;
}
export interface DecisionLogAppendOutput extends SkillOutput {
    writtenCount: number;
    logIds: string[];
    summary: {
        totalEntries: number;
        successfulEntries: number;
        failedEntries: number;
        errors?: string[];
    };
}
export declare class DecisionLogAppendSkill implements Skill<DecisionLogAppendInput, DecisionLogAppendOutput> {
    private readonly prisma?;
    private readonly decisionLogStorage?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "decision";
    };
    constructor(prisma?: PrismaService, decisionLogStorage?: DecisionLogStorageService);
    execute(input: DecisionLogAppendInput): Promise<DecisionLogAppendOutput>;
}
