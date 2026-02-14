import { DecisionPersona, DecisionAction, DecisionDetails } from '../interfaces/decision-log-enhanced.interface';
export declare class PersonaExplanationService {
    generateUserExplanation(persona: DecisionPersona, action: DecisionAction, decision: DecisionDetails, context?: {
        affectedDays?: number[];
        affectedPeriod?: string;
        originalPlan?: string;
        replacement?: string;
        adjustment?: string;
        reason?: string;
    }): string;
    private generateRejectionExplanation;
    private generateAdjustmentExplanation;
    private generateReplacementExplanation;
    private generateAllowExplanation;
    private extractReasonFromCodes;
}
