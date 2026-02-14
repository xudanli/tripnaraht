export interface PacingConfig {
    max_daily_hp: number;
    hp_recovery_rate: number;
    walk_speed_factor: number;
    stairs_penalty_factor: number;
    forced_rest_interval_min: number;
    terrain_filter: 'ALL' | 'NO_STAIRS' | 'WHEELCHAIR_ONLY' | 'ELEVATOR_REQUIRED';
    desc?: string;
    min_hp_threshold?: number;
    level?: 'relaxed' | 'standard' | 'tight';
    maxDailyActivities?: number;
}
export declare enum MobilityProfile {
    IRON_LEGS = "IRON_LEGS",
    ACTIVE_SENIOR = "ACTIVE_SENIOR",
    CITY_POTATO = "CITY_POTATO",
    LIMITED = "LIMITED"
}
export declare enum InterestProfile {
    ELDERLY = "ELDERLY",
    ADULT = "ADULT",
    CHILD = "CHILD"
}
export interface TravelerInfo {
    interestProfile: InterestProfile;
    mobilityProfile: MobilityProfile;
    count: number;
}
