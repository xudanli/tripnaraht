export type UserPersona = 'RATIONAL_EXPLORER' | 'EXPERIENCE_SEEKER' | 'CONSERVATIVE_SAFETY';
export interface Culture {
    language: 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';
    region?: string;
    city?: string;
}
export interface UserProfile {
    userId?: string;
    preferences?: {
        pace?: string;
        riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
        interests?: string[];
        fitness?: string;
    };
    history?: {
        pastTrips?: any[];
        decisions?: any[];
    };
    culture?: Culture;
}
export interface PersonaCharacteristics {
    type: UserPersona;
    confidence: number;
    traits: string[];
    communicationPreferences: {
        tone: 'FORMAL' | 'CASUAL' | 'FRIENDLY' | 'PROFESSIONAL';
        detailLevel: 'MINIMAL' | 'MODERATE' | 'DETAILED';
        focus: string[];
    };
}
export interface PersonaCommunication {
    style: {
        tone: string;
        language: string[];
        emphasis: string[];
    };
    contentFocus: {
        primary: string[];
        secondary: string[];
        avoid: string[];
    };
    approach: {
        introduction: string;
        explanation: string;
        callToAction: string;
    };
}
export interface CulturalAdaptation {
    adaptedText: string;
    culturalElements: {
        expressions: string[];
        references: string[];
        style: string;
    };
}
