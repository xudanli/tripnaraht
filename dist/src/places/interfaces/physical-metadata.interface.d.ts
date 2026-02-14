export interface PhysicalMetadata {
    base_fatigue_score: number;
    terrain_type: 'FLAT' | 'HILLY' | 'STAIRS_ONLY' | 'ELEVATOR_AVAILABLE';
    seated_ratio: number;
    intensity_factor?: number;
    has_elevator?: boolean;
    wheelchair_accessible?: boolean;
    estimated_duration_min?: number;
}
