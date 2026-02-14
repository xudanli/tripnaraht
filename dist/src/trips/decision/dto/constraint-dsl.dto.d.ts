import { ConstraintDSL } from '../constraints/constraint-dsl.types';
export declare class ConstraintDSLDto implements ConstraintDSL {
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
export declare class DetectConflictsRequestDto {
    constraints: ConstraintDSLDto;
    plan?: any;
    state?: any;
}
export declare class GenerateMultiplePlansRequestDto {
    state: any;
    constraints: ConstraintDSLDto;
}
