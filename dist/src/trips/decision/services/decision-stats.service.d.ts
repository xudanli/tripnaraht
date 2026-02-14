import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionSource } from '../shared/decision-result.types';
export interface DecisionStatsResult {
    countryCode?: string;
    routeDirectionId?: string;
    decisionSource: DecisionSource;
    decisionCount: number;
    percentage: number;
}
export interface DecisionDistributionStats {
    totalDecisions: number;
    bySource: {
        PHYSICAL: number;
        HUMAN: number;
        PHILOSOPHY: number;
        HEURISTIC: number;
    };
    bySourcePercentage: {
        PHYSICAL: number;
        HUMAN: number;
        PHILOSOPHY: number;
        HEURISTIC: number;
    };
    realityDrivenRatio: number;
    details: DecisionStatsResult[];
}
export interface PersonaTriggerStats {
    persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    triggerCount: number;
    bySource: {
        PHYSICAL: number;
        HUMAN: number;
        PHILOSOPHY: number;
        HEURISTIC: number;
    };
    primarySource: DecisionSource;
}
export declare class DecisionStatsService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getStatsByCountry(countryCode?: string, startDate?: Date, endDate?: Date): Promise<DecisionDistributionStats>;
    getStatsByRouteDirection(routeDirectionId?: string, startDate?: Date, endDate?: Date): Promise<DecisionDistributionStats>;
    getPersonaTriggerStats(startDate?: Date, endDate?: Date): Promise<PersonaTriggerStats[]>;
    getRealityDrivenRatio(countryCode?: string, routeDirectionId?: string, startDate?: Date, endDate?: Date): Promise<number>;
    getHeuristicHotspots(limit?: number): Promise<Array<{
        countryCode?: string;
        routeDirectionId?: string;
        heuristicCount: number;
        totalDecisions: number;
        heuristicRatio: number;
        suggestions: string[];
    }>>;
}
