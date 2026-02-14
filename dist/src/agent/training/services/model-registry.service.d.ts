import { ConfigService } from '@nestjs/config';
import { ModelVersion, ModelRegistryEntry } from '../interfaces/training-platform.interface';
import { MLflowClientService } from './mlflow-client.service';
export declare class ModelRegistryService {
    private readonly configService;
    private readonly mlflowClient;
    private readonly logger;
    private readonly mlflowTrackingUri;
    private readonly mlflowModelName;
    private readonly registry;
    private currentProductionVersion;
    private currentStagingVersion;
    constructor(configService: ConfigService, mlflowClient: MLflowClientService);
    registerModel(modelVersion: ModelVersion, evalMetrics?: Record<string, number>): Promise<ModelRegistryEntry>;
    getModelVersion(version: string): Promise<ModelRegistryEntry | undefined>;
    listModelVersions(): Promise<ModelRegistryEntry[]>;
    rollbackToVersion(version: string): Promise<ModelRegistryEntry>;
    setProductionVersion(version: string): Promise<void>;
    setStagingVersion(version: string): Promise<void>;
    compareVersions(version1: string, version2: string): Promise<{
        version1: ModelRegistryEntry;
        version2: ModelRegistryEntry;
        differences: {
            training_metrics: Record<string, {
                v1: number;
                v2: number;
                diff: number;
            }>;
            eval_metrics: Record<string, {
                v1: number;
                v2: number;
                diff: number;
            }>;
            training_config: Record<string, any>;
        };
    }>;
    getCurrentProductionVersion(): string | null;
    getCurrentStagingVersion(): string | null;
    private registerToMLflow;
    private getFromMLflow;
    private listFromMLflow;
    private setProductionVersionInMLflow;
    private compareVersionNumbers;
}
