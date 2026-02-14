import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { TripMetricsService } from '../../trips/services/trip-metrics.service';
import { TripConflictsService } from '../../trips/services/trip-conflicts.service';
export interface TripQuickEvaluateInput extends SkillInput {
    tripId: string;
}
export interface TripQuickEvaluateOutput extends SkillOutput {
    scores: {
        safety: number;
        pacing: number;
        executability: number;
        diversity: number;
    };
    warnings: Array<{
        type: string;
        severity: 'high' | 'medium' | 'low';
        message: string;
        affectedDays?: string[];
        affectedItemIds?: string[];
    }>;
    suggestedFixes: Array<{
        issue: string;
        fixType: 'DR_DRE_PACE' | 'NEPTUNE_REPLACE' | 'MANUAL_ADJUST';
        description: string;
        priority: 'high' | 'medium' | 'low';
    }>;
}
export declare class TripQuickEvaluateSkill implements Skill<TripQuickEvaluateInput, TripQuickEvaluateOutput> {
    private readonly prisma;
    private readonly tripMetricsService?;
    private readonly tripConflictsService?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "analytics";
    };
    constructor(prisma: PrismaService, tripMetricsService?: TripMetricsService, tripConflictsService?: TripConflictsService);
    execute(input: TripQuickEvaluateInput): Promise<TripQuickEvaluateOutput>;
    private calculateScores;
    private calculateDiversityScore;
    private generateWarnings;
    private generateSuggestedFixes;
}
