export type OptimizationScenario = 'walking' | 'driving' | 'transit';
export interface ScenarioOptimizationConfig {
    scenario: OptimizationScenario;
    walking?: {
        dem_required: boolean;
        fitness_constraints: {
            max_walk_min?: number;
            max_total_walk_min?: number;
            max_ascent_m?: number;
            max_slope_pct?: number;
            require_rescue_access?: boolean;
        };
        terrain_analysis: boolean;
        pacing_adjustment?: {
            ascent_factor: number;
            slope_factor: number;
        };
    };
    driving?: {
        route_optimization: 'TIME' | 'DISTANCE' | 'TOLL_FREE' | 'SCENIC';
        traffic_aware: boolean;
        parking_consideration: boolean;
        fuel_stops?: {
            required: boolean;
            max_distance_between_stops_km?: number;
        };
    };
    transit?: {
        schedule_aware: boolean;
        transfer_penalty: number;
        walking_to_station_max_min: number;
        max_transfers?: number;
        prefer_direct_routes: boolean;
        time_window_aware: boolean;
    };
}
export interface ScenarioConstraints {
    scenario: OptimizationScenario;
    hard_constraints: {
        max_travel_time_min?: number;
        max_cost?: number;
        required_features?: string[];
        forbidden_features?: string[];
    };
    soft_preferences: {
        preferred_features?: string[];
        avoid_features?: string[];
        time_preferences?: {
            morning?: boolean;
            afternoon?: boolean;
            evening?: boolean;
        };
    };
}
