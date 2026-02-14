import { ConfigService } from '@nestjs/config';
export declare class MLflowClientService {
    private readonly configService?;
    private readonly logger;
    private readonly mlflowTrackingUri;
    private readonly httpClient;
    constructor(configService?: ConfigService);
    createModelVersion(modelName: string, source: string, runId?: string, tags?: Record<string, string>): Promise<{
        model_version: {
            name: string;
            version: string;
            creation_timestamp: number;
            last_updated_timestamp: number;
            user_id: string;
            current_stage: string;
            description?: string;
            source: string;
            run_id?: string;
            status: string;
            status_message?: string;
            tags?: Array<{
                key: string;
                value: string;
            }>;
        };
    }>;
    getModelVersion(modelName: string, version: string): Promise<{
        model_version: {
            name: string;
            version: string;
            creation_timestamp: number;
            last_updated_timestamp: number;
            user_id: string;
            current_stage: string;
            description?: string;
            source: string;
            run_id?: string;
            status: string;
            status_message?: string;
            tags?: Array<{
                key: string;
                value: string;
            }>;
        };
    }>;
    listModelVersions(modelName: string, maxResults?: number): Promise<{
        model_versions: Array<{
            name: string;
            version: string;
            creation_timestamp: number;
            last_updated_timestamp: number;
            current_stage: string;
            source: string;
            run_id?: string;
            status: string;
        }>;
    }>;
    transitionModelVersionStage(modelName: string, version: string, stage: 'Staging' | 'Production' | 'Archived', archiveExistingVersions?: boolean): Promise<void>;
    getOrCreateExperiment(experimentName: string): Promise<string>;
    logMetrics(runId: string, metrics: Record<string, number>, step?: number, timestamp?: number): Promise<void>;
    logParams(runId: string, params: Record<string, string>): Promise<void>;
    healthCheck(): Promise<boolean>;
}
