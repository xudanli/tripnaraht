export interface GPXPoint {
    lat: number;
    lng: number;
    elevation?: number;
    time?: Date;
}
export declare class CreateTrailDto {
    nameCN: string;
    nameEN?: string;
    description?: string;
    distanceKm?: number;
    elevationGainM?: number;
    elevationLossM?: number;
    maxElevationM?: number;
    minElevationM?: number;
    averageSlope?: number;
    difficultyLevel?: string;
    equivalentDistanceKm?: number;
    fatigueScore?: number;
    gpxData?: GPXPoint[];
    gpxFileUrl?: string;
    bounds?: {
        minlat: number;
        minlon: number;
        maxlat: number;
        maxlon: number;
    };
    startPlaceId?: number;
    endPlaceId?: number;
    waypointPlaceIds?: number[];
    metadata?: any;
    source?: string;
    sourceUrl?: string;
    rating?: number;
    estimatedDurationHours?: number;
}
