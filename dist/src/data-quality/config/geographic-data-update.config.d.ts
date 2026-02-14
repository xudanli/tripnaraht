export declare enum UpdateFrequency {
    DAILY = "DAILY",
    WEEKLY = "WEEKLY",
    MONTHLY = "MONTHLY",
    QUARTERLY = "QUARTERLY",
    YEARLY = "YEARLY"
}
export interface GeographicDataUpdateConfig {
    frequency: UpdateFrequency;
    monitorIntegrity: boolean;
    alertOnMissing: boolean;
    types?: string[];
}
export declare const GEOGRAPHIC_DATA_UPDATE_CONFIG: Record<string, GeographicDataUpdateConfig>;
export declare function getFrequencyMs(frequency: UpdateFrequency): number;
export declare function shouldUpdate(lastUpdated: Date, frequency: UpdateFrequency): boolean;
