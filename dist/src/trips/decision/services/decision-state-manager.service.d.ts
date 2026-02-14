import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionState, DecisionSteps, DecisionStateUpdateRequest } from '../interfaces/decision-state.interface';
export declare class DecisionStateManagerService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getDecisionState(tripId: string): Promise<DecisionState>;
    checkDecisionCompleted(tripId: string): Promise<boolean>;
    updateDecisionState(tripId: string, update: DecisionStateUpdateRequest): Promise<DecisionState>;
    updateDecisionProgress(tripId: string, step: keyof DecisionSteps): Promise<DecisionState>;
    disablePreDecisionFeatures(tripId: string): Promise<DecisionState>;
    enableExecutionFeatures(tripId: string): Promise<DecisionState>;
    isFeatureEnabled(tripId: string, feature: 'booking' | 'purchase' | 'execution'): Promise<boolean>;
    validateFeatureAccess(tripId: string, feature: 'booking' | 'purchase' | 'execution'): Promise<void>;
    private createInitialDecisionState;
    private normalizeDecisionState;
    private calculateCompletionPercentage;
    private saveDecisionState;
    private extractUserIdFromTripId;
}
