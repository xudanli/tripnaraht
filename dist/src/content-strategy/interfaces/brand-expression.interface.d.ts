import { UserContext } from './copy-standards.interface';
export interface ExpressionContext {
    scenario?: CommunicationScenario;
    userContext?: UserContext;
    dataContext?: Record<string, any>;
}
export type CommunicationScenario = 'risk_warning' | 'decision_support' | 'encouragement' | 'story_sharing' | 'error_handling' | 'information_sharing' | 'rejection' | 'confirmation';
export interface RationalExpression {
    factLayer: {
        facts: string[];
        data: Record<string, any>;
    };
    relationLayer: {
        relations: string[];
        connections: Array<{
            from: string;
            to: string;
            relation: string;
        }>;
    };
    predictionLayer: {
        predictions: Array<{
            scenario: string;
            probability: number;
            explanation: string;
        }>;
    };
    suggestionLayer: {
        suggestions: string[];
        rationale: string[];
    };
}
export interface WarmthExpression {
    understanding: {
        message: string;
        empathy: string[];
    };
    companion: {
        message: string;
        support: string[];
    };
    encouragement: {
        message: string;
        positive: string[];
    };
    detail: {
        personalized: string[];
        attention: string[];
    };
}
export interface CommunicationContext {
    scenario: CommunicationScenario;
    userContext?: UserContext;
    content?: any;
}
export interface BalancedCopy {
    rational: {
        text: string;
        layers: RationalExpression;
    };
    warmth: {
        text: string;
        dimensions: WarmthExpression;
    };
    combined: string;
    ratio: {
        rational: number;
        warmth: number;
    };
}
