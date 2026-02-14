import type { ApiResponse, GetContextMetricsResponse, GetContextPackagesResponse, GetContextPackageDetailResponse, GetContextAnalyticsResponse, GetContextMetricsQuery, GetContextPackagesQuery, GetContextAnalyticsQuery } from './frontend-context-api.types';
export declare function getContextMetrics(params?: GetContextMetricsQuery): Promise<ApiResponse<GetContextMetricsResponse>>;
export declare function getContextPackages(params?: GetContextPackagesQuery): Promise<ApiResponse<GetContextPackagesResponse>>;
export declare function getContextPackageDetail(id: string): Promise<ApiResponse<GetContextPackageDetailResponse>>;
export declare function getContextAnalytics(params?: GetContextAnalyticsQuery): Promise<ApiResponse<GetContextAnalyticsResponse>>;
export declare const examples: {
    getMetricsExample(): Promise<{
        summary: {
            timeRange: {
                start: string;
                end: string;
            };
            totalRecords: number;
            avgTokens: number;
            avgCompressionRate: number;
            avgHitRate?: number;
            avgNoiseRate: number;
            cacheHitRate: number;
            avgBuildTimeMs: number;
            qualityDistribution: {
                EXCELLENT: number;
                GOOD: number;
                FAIR: number;
                POOR: number;
            };
            topBlockTypes: Array<{
                type: string;
                count: number;
            }>;
        };
        byAgent: Record<string, {
            count: number;
            avgTokens: number;
            avgBuildTimeMs: number;
            cacheHitRate: number;
        }>;
        byPhase: Record<string, {
            count: number;
            avgTokens: number;
            avgBuildTimeMs: number;
            cacheHitRate: number;
        }>;
    }>;
    getPackagesExample(): Promise<{
        packages: import("./frontend-context-api.types").ContextPackageListItem[];
        total: number;
        totalPages: number;
    }>;
    getAnalyticsExample(): Promise<GetContextAnalyticsResponse>;
};
