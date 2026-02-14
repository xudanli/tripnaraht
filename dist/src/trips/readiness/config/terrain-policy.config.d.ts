export interface RiskThresholds {
    highAltitudeM: number;
    rapidAscentM: number;
    steepSlopePct: number;
    bigAscentDayM: number;
}
export interface EffortLevelMapping {
    relaxMax: number;
    moderateMax: number;
    challengeMax: number;
    extremeMin: number;
}
export interface DecisionWeights {
    altitudePenalty: number;
    ascentPenalty: number;
    slopePenalty: number;
    rapidAscentPenalty: number;
}
export interface TerrainConstraints {
    firstDayMaxElevationM: number;
    maxDailyAscentM: number;
    maxConsecutiveHighAscentDays: number;
    highAltitudeBufferHours: number;
}
export interface TerrainActions {
    allowIntensityDowngrade: boolean;
    allowDaySplit: boolean;
    allowSteepSegmentReplacement: boolean;
    allowRestDayInsertion: boolean;
}
export declare const DEFAULT_TERRAIN_POLICY: {
    riskThresholds: RiskThresholds;
    effortLevelMapping: EffortLevelMapping;
    decisionWeights: DecisionWeights;
    terrainConstraints: TerrainConstraints;
    terrainActions: TerrainActions;
};
