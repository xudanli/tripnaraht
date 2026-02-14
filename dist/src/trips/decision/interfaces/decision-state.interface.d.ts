export type DecisionStage = 'INTENTION' | 'EXPLORATION' | 'EVALUATION' | 'CONFIRMATION' | 'EXECUTION';
export interface DecisionSteps {
    routeSelection: boolean;
    rhythmSelection: boolean;
    riskAcknowledgment: boolean;
    finalConfirmation: boolean;
}
export interface FeaturesDisabled {
    booking: boolean;
    purchase: boolean;
    execution: boolean;
}
export interface DecisionState {
    tripId: string;
    userId: string;
    decisionCompleted: boolean;
    decisionCompletedAt?: Date;
    decisionCompletionPercentage: number;
    currentStage: DecisionStage;
    completedSteps: DecisionSteps;
    featuresDisabled: FeaturesDisabled;
    createdAt: Date;
    updatedAt: Date;
    metadata?: Record<string, any>;
}
export interface DecisionStateUpdateRequest {
    step?: keyof DecisionSteps;
    stage?: DecisionStage;
    decisionCompleted?: boolean;
    metadata?: Record<string, any>;
}
