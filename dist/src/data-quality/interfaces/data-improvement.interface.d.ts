export type ImprovementMetricType = 'USER_SATISFACTION' | 'PREDICTION_ACCURACY' | 'DECISION_QUALITY' | 'DATA_QUALITY' | 'SYSTEM_RELIABILITY';
export interface ImprovementMetric {
    type: ImprovementMetricType;
    name: string;
    currentValue: number;
    targetValue: number;
    history: Array<{
        timestamp: string;
        value: number;
    }>;
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
    improvementPotential: number;
}
export interface ProblemAnalysis {
    problemId: string;
    description: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    affectedMetrics: ImprovementMetricType[];
    rootCauses: string[];
    impact: string[];
    frequency: number;
}
export interface ImprovementDirection {
    improvementId: string;
    name: string;
    description: string;
    targetProblems: string[];
    expectedMetricImprovements: Record<ImprovementMetricType, number>;
    implementationDifficulty: 'LOW' | 'MEDIUM' | 'HIGH';
    expectedEffect: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
}
export interface ImprovementImplementation {
    implementationId: string;
    improvementId: string;
    startTime: string;
    endTime?: string;
    status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
    changes: string[];
    implementedBy: string;
}
export interface ImprovementValidation {
    validationId: string;
    implementationId: string;
    validationTime: string;
    validationMethod: 'A_B_TEST' | 'BEFORE_AFTER' | 'STATISTICAL' | 'USER_FEEDBACK';
    metricImprovements: Record<ImprovementMetricType, {
        before: number;
        after: number;
        improvement: number;
        significant: boolean;
    }>;
    conclusion: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'INCONCLUSIVE';
    explanation: string;
    recommendations: string[];
}
export interface LearningCycleState {
    cycleId: string;
    phase: 'COLLECT_FEEDBACK' | 'ANALYZE_PROBLEMS' | 'DETERMINE_DIRECTIONS' | 'IMPLEMENT' | 'VALIDATE';
    startTime: string;
    currentMetrics: Record<ImprovementMetricType, ImprovementMetric>;
    problems: ProblemAnalysis[];
    improvementDirections: ImprovementDirection[];
    implementations: ImprovementImplementation[];
    validations: ImprovementValidation[];
}
export interface ContinuousImprovementResult {
    cycleState: LearningCycleState;
    overallImprovement: {
        averageMetricImprovement: number;
        improvedMetrics: ImprovementMetricType[];
        declinedMetrics: ImprovementMetricType[];
    };
    nextActions: string[];
    improvementReport: string;
}
