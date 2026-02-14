export interface Stage1Response {
    firstScreenCopy: string;
    onboardingQuestionnaire: {
        questions: Array<{
            id: string;
            question: string;
            type: 'single_choice' | 'multiple_choice' | 'text' | 'number';
            options?: string[];
            required: boolean;
        }>;
    };
    quickFeedback: {
        message: string;
        actions: Array<{
            label: string;
            action: string;
        }>;
    };
}
export interface Stage2Response {
    informationCards: Array<{
        type: 'BASIC_INFO' | 'CURRENT_CONDITIONS' | 'MATCHING' | 'RISK_OVERVIEW';
        title: string;
        content: any;
    }>;
    comparisonTool: {
        routes: Array<{
            id: string;
            name: string;
            comparison: Record<string, any>;
        }>;
    };
    riskHonesty: {
        risks: Array<{
            type: string;
            description: string;
            level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
            preparation: string[];
        }>;
    };
    sourceAnnotation: {
        sources: Array<{
            type: string;
            name: string;
            confidence: 'HIGH' | 'MEDIUM' | 'LOW';
            url?: string;
        }>;
    };
}
export interface Stage3Response {
    matchingAnalysis: {
        overallScore: number;
        dimensions: Array<{
            dimension: string;
            score: number;
            explanation: string;
        }>;
        summary: string;
    };
    feasibilityAssessment: {
        feasibility: 'FEASIBLE' | 'CONDITIONAL' | 'DIFFICULT' | 'NOT_FEASIBLE';
        factors: Array<{
            factor: string;
            status: 'PASS' | 'WARNING' | 'FAIL';
            explanation: string;
        }>;
        completionProbability?: number;
    };
    costBenefitClarification: {
        costs: Array<{
            category: string;
            amount: number;
            explanation: string;
        }>;
        benefits: Array<{
            category: string;
            value: string;
            explanation: string;
        }>;
        summary: string;
    };
    decisionReflection: {
        questions: string[];
        considerations: string[];
    };
}
export interface UserDecision {
    choice: 'GO' | 'NO_GO' | 'DEFER';
    reasoning?: string;
    confidence?: number;
    decisionTime?: Date;
}
export interface Stage4Response {
    confirmation?: {
        message: string;
        nextSteps: Array<{
            step: string;
            description: string;
            priority: 'HIGH' | 'MEDIUM' | 'LOW';
        }>;
        preparationChecklist: string[];
    };
    noGoResponse?: {
        message: string;
        alternatives: string[];
        encouragement: string;
    };
    deferResponse?: {
        message: string;
        suggestedTiming: string;
        preparationAdvice: string[];
    };
}
