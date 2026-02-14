import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext, RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
import { WorldBuildContextSkill } from '../world/world-build-context.skill';
import { DecisionRunThreeGuardiansSkill } from '../decision/decision-run-three-guardians.skill';
import { PrismaService } from '../../prisma/prisma.service';
export interface ReadinessSummarizeRisksInput extends SkillInput {
    tripId?: string;
    world?: WorldModelContext;
    finalPlan?: RoutePlanDraft;
}
export interface ReadinessSummarizeRisksOutput extends SkillOutput {
    topRisks: Array<{
        risk: string;
        category: 'altitude' | 'road' | 'weather' | 'health' | 'other';
        severity: 'high' | 'medium' | 'low';
        description: string;
    }>;
    riskMitigationTips: Array<{
        risk: string;
        tips: string[];
    }>;
    readinessScore: number;
}
export declare class ReadinessSummarizeRisksSkill implements Skill<ReadinessSummarizeRisksInput, ReadinessSummarizeRisksOutput> {
    private readonly worldBuildContext;
    private readonly decisionRunThreeGuardians;
    private readonly prisma;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "readiness";
    };
    constructor(worldBuildContext: WorldBuildContextSkill, decisionRunThreeGuardians: DecisionRunThreeGuardiansSkill, prisma: PrismaService);
    execute(input: ReadinessSummarizeRisksInput): Promise<ReadinessSummarizeRisksOutput>;
    private analyzeRisks;
    private generateMitigationTips;
    private calculateReadinessScore;
}
