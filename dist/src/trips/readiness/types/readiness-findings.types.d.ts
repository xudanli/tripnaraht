import { ActionLevel, ReadinessCategory, RuleSeverity, HazardType, Task, LocalizedString } from './readiness-pack.types';
export interface FrontendUserQuestion {
    id: string;
    text: string | {
        zh: string;
        en: string;
    };
    type: 'single' | 'multiple' | 'text';
    required?: boolean;
    options?: Array<string | {
        zh: string;
        en: string;
    }>;
    placeholder?: string | {
        zh: string;
        en: string;
    };
    validation?: {
        minLength?: number;
        maxLength?: number;
        pattern?: string;
    };
}
export interface ReadinessFindingItem {
    id: string;
    category: ReadinessCategory;
    severity: RuleSeverity;
    level: ActionLevel;
    message: string;
    tasks?: Task[];
    askUser?: string[] | FrontendUserQuestion[];
    evidence?: Array<{
        sourceId: string;
        sectionId?: string;
        quote?: string;
    }>;
}
export interface ReadinessFinding {
    destinationId: string;
    packId: string;
    packVersion: string;
    blockers: ReadinessFindingItem[];
    must: ReadinessFindingItem[];
    should: ReadinessFindingItem[];
    optional: ReadinessFindingItem[];
    risks: Array<{
        type: HazardType;
        severity: RuleSeverity;
        summary: string;
        mitigations: string[];
        quantification?: RiskQuantification;
    }>;
    missingInfo?: string[];
}
export interface ReadinessDisclaimer {
    message: string;
    lastUpdated?: string;
    dataSources?: string[];
    userActionRequired?: string[];
}
export interface TrustMetrics {
    capability: {
        score: number;
        factors: Array<{
            type: 'DATA_SOURCE' | 'GEO_FEATURES' | 'RULE_ACCURACY' | 'EVIDENCE_QUALITY';
            description: LocalizedString;
            score: number;
        }>;
        explanation: LocalizedString;
    };
    benevolence: {
        score: number;
        factors: Array<{
            type: 'SAFETY_FOCUS' | 'USER_BENEFIT' | 'TRANSPARENCY' | 'LIMITATIONS_DISCLOSED';
            description: LocalizedString;
            score: number;
        }>;
        explanation: LocalizedString;
    };
    predictability: {
        score: number;
        factors: Array<{
            type: 'RULE_TRANSPARENCY' | 'CONSISTENCY' | 'EXPLAINABILITY';
            description: LocalizedString;
            score: number;
        }>;
        explanation: LocalizedString;
    };
    overall: number;
}
export interface RiskQuantification {
    score: number;
    probability?: number;
    metrics?: Array<{
        name: LocalizedString;
        value: LocalizedString;
        unit?: LocalizedString;
        description?: LocalizedString;
    }>;
    comparison?: {
        baseline: LocalizedString;
        difference: LocalizedString;
        context?: LocalizedString;
    };
    levelExplanation?: LocalizedString;
    timeWindow?: {
        start?: string;
        end?: string;
        description?: LocalizedString;
    };
    geographicScope?: {
        description: LocalizedString;
        affectedAreas?: string[];
    };
}
export interface ReadinessCheckResult {
    findings: ReadinessFinding[];
    summary: {
        totalBlockers: number;
        totalMust: number;
        totalShould: number;
        totalOptional: number;
        totalRisks: number;
    };
    disclaimer?: ReadinessDisclaimer;
    trustMetrics?: TrustMetrics;
}
