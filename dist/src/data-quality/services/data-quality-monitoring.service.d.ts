import { PrismaService } from '../../prisma/prisma.service';
import { DataQualityFrameworkService } from './data-quality-framework.service';
import { DataQualityAlertService } from './data-quality-alert.service';
import { PostgreSQLMcpService } from '../../mcp/postgresql-mcp.service';
interface DataSourceConfig {
    dataSource: string;
    dataType: string;
    countryCode: string;
    freshnessThresholdHours: number;
    qualityThreshold: number;
}
export declare class DataQualityMonitoringService {
    private readonly prisma;
    private readonly dataQualityFramework;
    private readonly alertService;
    private readonly postgresqlMcp?;
    private readonly logger;
    constructor(prisma: PrismaService, dataQualityFramework: DataQualityFrameworkService, alertService: DataQualityAlertService, postgresqlMcp?: PostgreSQLMcpService);
    runMonitoringTask(): Promise<void>;
    monitorAllSources(): Promise<void>;
    monitorSource(config: DataSourceConfig): Promise<void>;
    assessSourceQuality(config: DataSourceConfig): Promise<{
        completeness: number;
        accuracy: number;
        consistency: number;
        timeliness: number;
        traceability: number;
        overallScore: number;
        recordCount: number;
        lastUpdated: Date;
    }>;
    private assessCompleteness;
    private assessAccuracy;
    private assessConsistency;
    checkDataIntegrity(): Promise<{
        issues: Array<{
            issueType: string;
            count: number;
            description: string;
        }>;
        overallHealth: number;
    }>;
    private assessTimeliness;
    private assessTraceability;
    private calculateOverallScore;
    private checkAlertRules;
    private upsertMonitorRecord;
    private getDataSourceConfigs;
    private fetchDataSourceData;
    private getRequiredFields;
    private getValidationRules;
    private getFreshnessThreshold;
}
export {};
