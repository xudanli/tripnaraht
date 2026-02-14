export declare class RiskThresholdsDto {
    highAltitudeM?: number;
    rapidAscentM?: number;
    steepSlopePct?: number;
    bigAscentDayM?: number;
}
export declare class EffortLevelMappingDto {
    relaxMax?: number;
    moderateMax?: number;
    challengeMax?: number;
    extremeMin?: number;
}
export declare class TerrainConstraintsDto {
    firstDayMaxElevationM?: number;
    maxDailyAscentM?: number;
    maxConsecutiveHighAscentDays?: number;
    highAltitudeBufferHours?: number;
}
export declare class CountryPackDto {
    countryCode: string;
    countryName: string;
    riskThresholds?: RiskThresholdsDto;
    effortLevelMapping?: EffortLevelMappingDto;
    terrainConstraints?: TerrainConstraintsDto;
}
export declare class CreateOrUpdateCountryPackDto {
    countryName: string;
    riskThresholds?: RiskThresholdsDto;
    effortLevelMapping?: EffortLevelMappingDto;
    terrainConstraints?: TerrainConstraintsDto;
}
