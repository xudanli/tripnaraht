import type { ApiResponse, BuildContextPackageRequest, BuildContextPackageResponse, CompressContextRequest, CompressContextResponse, ProjectStateRequest, ProjectStateResponse, WriteBackRequest, GetMetricsQuery, GetMetricsResponse } from './context-api.types';
export declare function buildContextPackage(params: BuildContextPackageRequest): Promise<ApiResponse<BuildContextPackageResponse>>;
export declare function compressContext(params: CompressContextRequest): Promise<ApiResponse<CompressContextResponse>>;
export declare function projectState(params: ProjectStateRequest): Promise<ApiResponse<ProjectStateResponse>>;
export declare function writeBack(params: WriteBackRequest): Promise<ApiResponse<{
    message: string;
}>>;
export declare function getMetrics(query?: GetMetricsQuery): Promise<ApiResponse<GetMetricsResponse>>;
export declare const examples: {
    buildContextExample(): Promise<import("./context-api.types").ContextBlock[]>;
    getMetricsExample(tripId: string): Promise<{
        summary: import("./context-api.types").ContextMetricsSummary;
        recent: import("./context-api.types").ContextMetricsRecord[];
    }>;
};
