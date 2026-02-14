import { ContextEngineerService } from './services/context-engineer.service';
import { ContextMetricsService } from './services/context-metrics.service';
import { ContextPrometheusMetricsService } from './services/context-prometheus-metrics.service';
import { ContextPerformanceAnalysisService } from './services/context-performance-analysis.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { BuildContextPackageDto, CompressContextDto, ProjectStateDto, WriteBackDto, GetMetricsQueryDto } from './dto/context.dto';
import { GetContextPackagesQueryDto, GetContextMetricsQueryDto, GetContextAnalyticsQueryDto } from './dto/admin-context.dto';
export declare class ContextController {
    private readonly contextEngineer;
    private readonly metricsService?;
    private readonly prometheusMetrics?;
    private readonly performanceAnalysis?;
    private readonly skillsRegistry?;
    private readonly logger;
    constructor(contextEngineer: ContextEngineerService, metricsService?: ContextMetricsService, prometheusMetrics?: ContextPrometheusMetricsService, performanceAnalysis?: ContextPerformanceAnalysisService, skillsRegistry?: SkillsRegistryService);
    build(dto: BuildContextPackageDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    compress(dto: CompressContextDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    projectState(dto: ProjectStateDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    writeBack(dto: WriteBackDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminMetrics(query: GetContextMetricsQueryDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminPackages(query: GetContextPackagesQueryDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminPackageDetail(id: string): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminAnalytics(query: GetContextAnalyticsQueryDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    private calculateTokenUsageTrend;
    private calculateCacheHitRateTrend;
    private calculateCompressionAnalysis;
    private calculateQualityAnalysis;
    private calculateTopBlockTypes;
    private calculatePerformanceBottlenecks;
    private groupByTime;
    getMetrics(query: GetMetricsQueryDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getPrometheusMetrics(): Promise<string>;
    getPerformanceReport(startTime?: string, endTime?: string, format?: 'json' | 'markdown', includeLearning?: boolean, includeBottlenecks?: boolean): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any> | {
        format: string;
        content: string;
    }>;
}
