import { ISODate, MoneyCurrency } from '../world-model';
export interface ConstraintDSL {
    hard_constraints?: HardConstraints;
    soft_constraints?: SoftConstraints;
    conflicts?: ConstraintConflict[];
}
export interface HardConstraints {
    date_window?: {
        start: ISODate;
        end: ISODate;
        flexible: boolean;
    };
    budget?: {
        max: number;
        currency: MoneyCurrency;
        flexible: boolean;
    };
    physical_limitations?: {
        no_long_hiking?: boolean;
        daily_activity_hours_max?: number;
        wheelchair_accessible?: boolean;
        no_stairs?: boolean;
        max_daily_ascent_m?: number;
        max_elevation_m?: number;
        max_slope_pct?: number;
        rapid_ascent_forbidden?: boolean;
    };
    travel_mode?: {
        allow_self_drive?: boolean;
        allow_public_transit?: boolean;
        max_transfers?: number;
        no_early_morning?: boolean;
        no_late_night?: boolean;
    };
    requirements?: {
        requires_permit?: boolean;
        requires_guide?: boolean;
    };
}
export interface SoftConstraints {
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
    activity_intensity?: {
        preference: 'low' | 'medium' | 'high';
        weight: number;
    };
    risk_tolerance?: {
        level: 'low' | 'medium' | 'high';
        weight: number;
    };
    cost_sensitivity?: {
        level: 'low' | 'medium' | 'high';
        weight: number;
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
export interface ConstraintConflictResult {
    conflicts: ConstraintConflict[];
    has_conflicts: boolean;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
}
export interface TradeoffExplanation {
    conflict_type: string;
    current_state: {
        constraint_a_value: any;
        constraint_b_value: any;
        conflict_reason: string;
    };
    options: Array<{
        option: string;
        impact: {
            constraint_a_change: string;
            constraint_b_change: string;
            overall_impact: 'positive' | 'negative' | 'neutral';
        };
        recommendation: 'recommended' | 'optional' | 'not_recommended';
    }>;
}
