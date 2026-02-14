export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}
export interface ConstraintDSL {
    hard_constraints?: {
        date_window?: {
            start: string;
            end: string;
            flexible: boolean;
        };
        budget?: {
            max: number;
            currency: string;
            flexible: boolean;
        };
        physical_limitations?: {
            no_long_hiking?: boolean;
            daily_activity_hours_max?: number;
            wheelchair_accessible?: boolean;
            no_stairs?: boolean;
        };
        travel_mode?: {
            allow_self_drive?: boolean;
            allow_public_transit?: boolean;
            max_transfers?: number;
            no_early_morning?: boolean;
            no_late_night?: boolean;
        };
    };
    soft_constraints?: {
        pace?: {
            preference: 'relaxed' | 'moderate' | 'intense';
            weight: number;
        };
        scenery?: {
            nature_vs_city: 'nature' | 'city' | 'balanced';
            weight: number;
        };
        photography?: {
            importance: number;
        };
        comfort_level?: {
            hotel_quality: 'low' | 'medium' | 'high';
            weight: number;
        };
    };
}
export interface ConstraintConflict {
    between: string[];
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    tradeoff_options: string[];
    affected_days?: number[];
    details?: Record<string, any>;
}
export interface DetectConflictsResponse {
    conflicts: ConstraintConflict[];
    has_conflicts: boolean;
    summary: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
}
export interface InfeasibilityReason {
    constraint: string;
    description: string;
    affected_activities?: Array<{
        activity: string;
        message: string;
    }>;
    fix_suggestions: string[];
}
export interface InfeasibilityExplanation {
    feasible: boolean;
    reasons: InfeasibilityReason[];
    summary?: string;
}
export interface CheckConstraintsResponse {
    isValid: boolean;
    violations: Array<{
        code: string;
        severity: 'error' | 'warning' | 'info';
        message: string;
        details?: Record<string, any>;
        suggestions?: string[];
    }>;
    summary: {
        errorCount: number;
        warningCount: number;
        infoCount: number;
    };
    conflicts?: DetectConflictsResponse;
    infeasibilityExplanation?: InfeasibilityExplanation;
}
export interface PlanScore {
    total: number;
    breakdown: {
        satisfaction: number;
        violationRisk: number;
        robustness: number;
        cost: number;
    };
}
export interface Tradeoff {
    constraint: string;
    sacrificed: string;
    reason: string;
    can_adjust: boolean;
    impact_score?: number;
}
export interface PlanVariant {
    id: 'conservative' | 'balanced' | 'aggressive';
    score: PlanScore;
    tradeoffs: Tradeoff[];
    feasibility: {
        isValid: boolean;
        violations: number;
        conflicts?: number;
    };
    planSummary: {
        days: number;
        totalActivities: number;
    };
}
export interface GenerateMultiplePlansResponse {
    variants: PlanVariant[];
    log: {
        runId: string;
        explanation: string;
    };
}
