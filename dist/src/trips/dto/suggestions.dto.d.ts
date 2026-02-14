export declare enum SuggestionPersona {
    ABU = "abu",
    DR_DRE = "drdre",
    NEPTUNE = "neptune"
}
export declare enum SuggestionScope {
    TRIP = "trip",
    DAY = "day",
    ITEM = "item",
    SEGMENT = "segment"
}
export declare enum SuggestionSeverity {
    INFO = "info",
    WARN = "warn",
    BLOCKER = "blocker"
}
export declare enum SuggestionStatus {
    NEW = "new",
    SEEN = "seen",
    APPLIED = "applied",
    DISMISSED = "dismissed"
}
export declare class EvidenceLinkDto {
    id: string;
    type: string;
    title: string;
    description?: string;
    link?: string;
    source?: string;
    timestamp?: string;
}
export declare class SuggestionActionDto {
    id: string;
    label: string;
    type: string;
    primary?: boolean;
    icon?: string;
}
export declare class RefreshPolicyDto {
    triggers: string[];
}
export declare class SuggestionDto {
    id: string;
    persona: SuggestionPersona;
    scope: SuggestionScope;
    scopeId?: string;
    severity: SuggestionSeverity;
    status: SuggestionStatus;
    title: string;
    summary: string;
    description?: string;
    evidence?: EvidenceLinkDto[];
    actions: SuggestionActionDto[];
    createdAt: string;
    updatedAt?: string;
    refreshPolicy?: RefreshPolicyDto;
    metadata?: Record<string, any>;
}
export declare class SuggestionListResponseDto {
    items: SuggestionDto[];
    total: number;
    filters?: {
        persona?: SuggestionPersona;
        scope?: SuggestionScope;
        scopeId?: string;
        severity?: SuggestionSeverity;
        status?: SuggestionStatus;
    };
}
export declare class SuggestionStatsDto {
    tripId: string;
    byPersona: {
        abu: {
            total: number;
            bySeverity: {
                blocker: number;
                warn: number;
                info: number;
            };
        };
        drdre: {
            total: number;
            bySeverity: {
                blocker: number;
                warn: number;
                info: number;
            };
        };
        neptune: {
            total: number;
            bySeverity: {
                blocker: number;
                warn: number;
                info: number;
            };
        };
    };
    byScope: {
        trip: number;
        day: Record<string, number>;
        item: Record<string, number>;
    };
}
export declare class ApplySuggestionRequestDto {
    actionId: string;
    params?: Record<string, any>;
    preview?: boolean;
}
export declare class AppliedChangeDto {
    type: string;
    description: string;
}
export declare class ImpactMetricsDto {
    fatigue?: number;
    buffer?: number;
    cost?: number;
}
export declare class ImpactRiskDto {
    id: string;
    severity: SuggestionSeverity;
    title: string;
}
export declare class ImpactAnalysisDto {
    metrics?: ImpactMetricsDto;
    risks?: ImpactRiskDto[];
}
export declare class ApplySuggestionResponseDto {
    success: boolean;
    suggestionId: string;
    appliedChanges: AppliedChangeDto[];
    impact?: ImpactAnalysisDto;
    triggeredSuggestions?: string[];
}
