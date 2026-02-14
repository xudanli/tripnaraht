export declare enum FitForType {
    PHOTOGRAPHY = "photography",
    HIKING = "hiking",
    SEA = "sea",
    FAMILY = "family",
    CHALLENGE = "challenge"
}
export declare enum IntensityLevel {
    RELAX = "relax",
    MODERATE = "moderate",
    CHALLENGE = "challenge"
}
export declare enum RiskType {
    HIGH_ALTITUDE = "high_altitude",
    WEATHER_WINDOW = "weather_window",
    ROAD_CLOSURE = "road_closure",
    FERRY = "ferry"
}
export declare class TerrainSignatureDto {
    avgElevationM?: number;
    elevationRangeM?: [number, number];
    maxSlope?: number;
}
export declare class RiskProfileDetailDto {
    altitude?: number;
    weather?: number;
    isolation?: number;
}
export declare class RouteDirectionCardDto {
    id: number;
    uuid: string;
    name: string;
    nameCN: string;
    nameEN?: string;
    tagline: string;
    longDescription: string;
    suitableFor: string[];
    notSuitableFor: string[];
    bestMonths: number[];
    avoidMonths?: number[];
    typicalDurationDays: number;
    terrainSignature: TerrainSignatureDto;
    experienceTags: string[];
    riskProfile: RiskProfileDetailDto;
    description?: string;
    whyThis?: string;
    countryCode?: string;
    version?: string;
    tags?: string[];
    entryHubs?: string[];
    regions?: string[];
}
