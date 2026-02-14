import { RiskThresholds, EffortLevelMapping, TerrainConstraints } from './terrain-policy.config';
export interface CountryPack {
    countryCode: string;
    countryName: string;
    riskThresholds?: Partial<RiskThresholds>;
    effortLevelMapping?: Partial<EffortLevelMapping>;
    terrainConstraints?: Partial<TerrainConstraints>;
}
export declare const COUNTRY_PACKS: Record<string, CountryPack>;
export declare function getCountryPack(countryCode: string): CountryPack;
