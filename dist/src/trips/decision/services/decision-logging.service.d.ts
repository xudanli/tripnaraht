import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionPointType, DecisionOption, UserChoice, SystemAnalysis, ExpectedOutcome, ActualOutcome } from '../interfaces/decision-logging.interface';
export declare class DecisionLoggingService {
    private readonly prisma;
    private readonly moduleRef;
    private readonly logger;
    private contextLearningService?;
    constructor(prisma: PrismaService, moduleRef: ModuleRef);
    logDecision(tripId: string, decisionPoint: DecisionPointType, options: DecisionOption[], userChoice: UserChoice, systemAnalysis: SystemAnalysis, context?: {
        countryCode?: string;
        routeDirectionId?: string;
        persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
        decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
        decisionStage?: string;
        explanation?: string;
        reasonCodes?: string[];
        evidenceRefs?: string[];
    }): Promise<{
        id: string;
    }>;
    logOutcome(decisionId: string, expectedOutcome: ExpectedOutcome, actualOutcome: ActualOutcome, userSatisfaction?: number, userFeedback?: string): Promise<{
        id: string;
    }>;
    private recordDecisionMadeEvent;
    private calculateAlignment;
    private calculateDeviation;
    private generateLearningSignals;
    getUserDecisionLearning(userId: string, tripId?: string): Promise<{
        decisionPatterns: Record<string, any>;
        preferenceSignals: Record<string, any>;
        improvementSuggestions: string[];
    }>;
}
