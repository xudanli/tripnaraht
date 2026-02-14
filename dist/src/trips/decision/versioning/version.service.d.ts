export interface PlannerVersion {
    plannerVersion: string;
    policyVersion: string;
    releasedAt: string;
    changelog?: string;
}
export interface FeatureFlag {
    name: string;
    enabled: boolean;
    rolloutPercentage: number;
    targetUsers?: string[];
    targetDestinations?: string[];
}
export interface VersionConfig {
    currentVersion: PlannerVersion;
    featureFlags: Record<string, FeatureFlag>;
    fallbackVersion?: PlannerVersion;
}
export declare class VersionService {
    private readonly logger;
    private versionConfig;
    constructor();
    getCurrentVersion(): PlannerVersion;
    isFeatureEnabled(flagName: string, context?: {
        userId?: string;
        destination?: string;
    }): boolean;
    updateVersionConfig(config: Partial<VersionConfig>): void;
    setFeatureFlag(flagName: string, flag: Partial<FeatureFlag>): void;
    rollbackToVersion(version: PlannerVersion): void;
    restoreVersion(): void;
    getAllFeatureFlags(): Record<string, FeatureFlag>;
    private hashString;
}
