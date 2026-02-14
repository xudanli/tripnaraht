import { DecisionParams } from '../shared/world-model.types';
export interface UserPersonaKeywords {
    pace?: ('slow' | 'relaxed' | 'normal' | 'fast' | 'intense')[];
    preferences?: ('photography' | 'hiking' | 'culture' | 'nature' | 'adventure' | 'comfort')[];
    riskTolerance?: ('low' | 'medium' | 'high')[];
    fitness?: ('low' | 'medium' | 'high' | 'extreme')[];
}
export interface UserPersonaMappingRule {
    keywords: UserPersonaKeywords;
    decisionParams: Partial<DecisionParams>;
    description: string;
}
export declare const USER_PERSONA_MAPPING_CONFIG: UserPersonaMappingRule[];
export declare function mapUserPersonaToDecisionParams(keywords: UserPersonaKeywords): DecisionParams;
export declare function extractPersonaKeywordsFromPreferences(preferences: {
    pace?: string;
    preferences?: string[];
    riskTolerance?: string;
    fitness?: string;
}): UserPersonaKeywords;
