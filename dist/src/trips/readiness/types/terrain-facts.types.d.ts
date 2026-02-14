export type EffortLevel = 'RELAX' | 'MODERATE' | 'CHALLENGE' | 'EXTREME';
export type RiskFlag = 'HIGH_ALTITUDE' | 'RAPID_ASCENT' | 'STEEP_SLOPE' | 'BIG_ASCENT_DAY';
export interface TerrainStats {
    minElevationM: number;
    maxElevationM: number;
    totalAscentM: number;
    totalDescentM: number;
    maxSlopePct: number;
    avgSlopePct: number;
    effortScore: number;
    totalDistanceM: number;
}
export interface TerrainFacts {
    terrainStats: TerrainStats;
    effortLevel: EffortLevel;
    riskFlags: Array<{
        type: RiskFlag;
        severity: 'LOW' | 'MEDIUM' | 'HIGH';
        message: string;
    }>;
    elevationProfileId: string;
    source: 'CN_DEM' | 'GLOBAL_DEM';
    computedAt: string;
}
export type RouteSegmentId = string;
export interface TerrainFactsWithId {
    segmentId: RouteSegmentId;
    terrainFacts: TerrainFacts;
}
