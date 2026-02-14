export type ChineseRegion = 'MAINLAND' | 'TAIWAN' | 'HONGKONG' | 'SINGAPORE';
export type CityTier = 'TIER1' | 'TIER2' | 'TIER3' | 'TIER4' | 'OVERSEAS';
export type UserGroup = 'STUDENT' | 'WORKER' | 'RETIREE' | 'FREELANCER' | 'OTHER';
export interface LocalizationContext {
    language: 'zh-CN' | 'zh-TW' | 'zh-HK' | 'en';
    chineseRegion?: ChineseRegion;
    cityTier?: CityTier;
    cityName?: string;
    userGroup?: UserGroup;
    ageRange?: 'TEEN' | 'YOUNG_ADULT' | 'ADULT' | 'SENIOR';
}
export interface ChineseLocalizationRules {
    avoidInternetSlang: boolean;
    avoidForcedEntertainment: boolean;
    avoidLiteralTranslation: boolean;
    useNaturalDailyChinese: boolean;
    regionSpecificRules?: Record<ChineseRegion, string[]>;
}
export interface CityAdaptationRules {
    tier1: {
        characteristics: string[];
        communicationStyle: string;
        examples: string[];
    };
    tier2: {
        characteristics: string[];
        communicationStyle: string;
        examples: string[];
    };
    tier3: {
        characteristics: string[];
        communicationStyle: string;
        examples: string[];
    };
    overseas: {
        characteristics: string[];
        communicationStyle: string;
        examples: string[];
    };
}
export interface UserGroupAdaptationRules {
    student: {
        acknowledgeConstraints: string;
        optimizeForStudent: string;
        lowCostRoutes: string;
        timeMatching: string;
        specialSupport: string;
    };
    worker: {
        acknowledgeValue: string;
        timePlanning: string;
        rhythmArrangement: string;
        expectationManagement: string;
    };
}
export interface LocalizedContent {
    originalText: string;
    localizedText: string;
    appliedRules: string[];
    adaptationNotes: string[];
}
