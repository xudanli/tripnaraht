import { PrismaService } from '../../../prisma/prisma.service';
import { ETLExportResult } from '../interfaces/trajectory.interface';
import { DataQualityResult } from './data-quality-checker.service';
export interface DatasetVersionMetadata {
    version: string;
    created_at: string;
    data_source: {
        date_range?: {
            start: string;
            end: string;
        };
        filter_criteria: {
            min_validation_score?: number;
            min_total_reward?: number;
            model_version?: string;
            country_code?: string;
            trajectory_ids?: string[];
            request_ids?: string[];
        };
        total_trajectories: number;
    };
    quality_report: {
        score: number;
        stats: DataQualityResult['stats'];
        issues_count: number;
    };
    code_version: {
        git_commit_hash: string;
        git_branch?: string;
        etl_service_version?: string;
    };
    config_hash: string;
    file_info: {
        format: string;
        file_path: string;
        file_size_bytes: number;
        record_count: number;
    };
    anonymization?: {
        enabled: boolean;
        config_hash?: string;
    };
}
export interface DatasetVersion {
    version: string;
    metadata: DatasetVersionMetadata;
    created_at: string;
    updated_at: string;
}
export declare class DatasetVersionManagerService {
    private readonly prisma;
    private readonly logger;
    private readonly versionsDir;
    private readonly metadataFile;
    constructor(prisma: PrismaService);
    createDatasetVersion(exportResult: ETLExportResult, qualityResult: DataQualityResult, dataSource: {
        date_range?: {
            start: string;
            end: string;
        };
        filter_criteria: Record<string, any>;
        total_trajectories: number;
    }, anonymization?: {
        enabled: boolean;
        config_hash?: string;
    }): Promise<DatasetVersion>;
    getDatasetVersion(version: string): Promise<DatasetVersion | null>;
    listDatasetVersions(): Promise<DatasetVersion[]>;
    compareVersions(version1: string, version2: string): Promise<{
        version1: DatasetVersion;
        version2: DatasetVersion;
        differences: {
            data_source: {
                total_trajectories_diff: number;
                filter_criteria_diff: Record<string, any>;
            };
            quality: {
                score_diff: number;
                stats_diff: Record<string, any>;
            };
            code_version: {
                commit_hash_diff: boolean;
            };
            config_hash_diff: boolean;
        };
    }>;
    private getNextVersion;
    private getCodeVersion;
    private calculateConfigHash;
    private updateVersionIndex;
    private compareVersionNumbers;
    private diffObjects;
    private ensureVersionsDir;
}
