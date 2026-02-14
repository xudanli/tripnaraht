export interface MultiDayClusteringInput {
    pois: Array<{
        id: number;
        geo: {
            lat: number;
            lng: number;
        };
        service_duration_min: number;
        time_windows?: Array<[string, string]>;
        must_day?: number;
        priority?: number;
        is_hard_node?: boolean;
    }>;
    N: number;
    day_boundaries: Array<{
        date: string;
        start: string;
        end: string;
    }>;
    constraints?: {
        max_pois_per_day?: number;
        target_service_per_day?: number;
        hard_assignments?: Array<{
            poi_id: number;
            day: number;
        }>;
    };
    config?: ClusteringConfig;
}
export interface ClusteringConfig {
    kmeans_iterations?: number;
    kmeans_tolerance?: number;
    repair_iterations?: number;
    balance_threshold?: number;
    max_radius_km?: number;
    compactness_weight?: number;
    balance_weight?: number;
    avg_travel_buffer_min?: number;
}
export interface MultiDayClusteringResult {
    day_clusters: Array<{
        day: number;
        date: string;
        poi_ids: number[];
    }>;
    diagnostics: {
        compactness_by_day: Array<{
            day: number;
            radius_90th_percentile: number;
            intra_day_distance_sum: number;
            centroid: {
                lat: number;
                lng: number;
            };
        }>;
        load_by_day: Array<{
            day: number;
            poi_count: number;
            total_service_min: number;
            estimated_total_min: number;
        }>;
        variance_metrics: {
            count_std: number;
            count_cv: number;
            service_std: number;
            service_cv: number;
            balance_score: number;
        };
        moves?: Array<{
            poi_id: number;
            from_day: number;
            to_day: number;
            reason: string;
        }>;
    };
}
