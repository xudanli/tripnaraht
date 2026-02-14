export declare enum RouteProvider {
    GOOGLE = "google",
    MAPBOX = "mapbox"
}
export declare enum RouteProfile {
    WALKING = "walking",
    DRIVING = "driving",
    BICYCLING = "bicycling",
    CYCLING = "cycling",
    TRANSIT = "transit"
}
export declare class RouteDifficultyRequestDto {
    provider: RouteProvider;
    origin: string;
    destination: string;
    profile?: RouteProfile;
    sampleM?: number;
    category?: string;
    accessType?: string;
    visitDuration?: string;
    typicalStay?: string;
    elevationMeters?: number;
    latitude?: number;
    hasAcclimatization?: boolean;
    avgSleepElevation?: number;
    exposureHours?: number;
    feelsLikeTemp?: number;
    coldDurationHours?: number;
    loadWeightKg?: number;
    subCategory?: string;
    trailDifficulty?: string;
    z?: number;
    workers?: number;
    placeId?: number;
    includeGeoJson?: boolean;
    includeGpx?: boolean;
}
export declare class RouteDifficultyResponseDto {
    distance_km: number;
    elevation_gain_m: number;
    slope_avg: number;
    label: string;
    S_km: number;
    notes: string[];
    geojson?: any;
    gpx?: string;
}
