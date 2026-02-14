import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext, RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
import { StrategyOrchestratorService } from '../../trips/decision/services/strategy-orchestrator.service';
import { WorldBuildContextSkill } from '../world/world-build-context.skill';
import { PrismaService } from '../../prisma/prisma.service';
import { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
export interface DecisionRunThreeGuardiansInput extends SkillInput {
    tripId?: string;
    world?: WorldModelContext;
    planCandidate: RoutePlanDraft;
}
export interface DecisionRunThreeGuardiansOutput extends SkillOutput {
    abuResult: {
        allowed: boolean;
        violations: any[];
        decisionLog: any[];
    };
    drdreResult: {
        adjusted: boolean;
        adjustedPlan?: RoutePlanDraft;
        changes: any[];
        decisionLog: any[];
    };
    neptuneResult: {
        repaired: boolean;
        repairedPlan?: RoutePlanDraft;
        replacements: any[];
        decisionLog: any[];
    };
    finalPlan: RoutePlanDraft | null;
    decisionSummary: {
        finalAction: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
        allowed: boolean;
        summary: string;
        keyDecisions: Array<{
            persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
            action: string;
            reason: string;
        }>;
    };
    allLogs: DecisionLogEntry[];
}
export declare class DecisionRunThreeGuardiansSkill implements Skill<DecisionRunThreeGuardiansInput, DecisionRunThreeGuardiansOutput> {
    private readonly worldBuildContext;
    private readonly prisma;
    private readonly strategyOrchestrator?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "decision";
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
    constructor(worldBuildContext: WorldBuildContextSkill, prisma: PrismaService, strategyOrchestrator?: StrategyOrchestratorService);
    execute(input: DecisionRunThreeGuardiansInput): Promise<DecisionRunThreeGuardiansOutput>;
    private generateSummary;
}
