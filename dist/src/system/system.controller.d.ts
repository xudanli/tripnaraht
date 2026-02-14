import { SystemService } from './system.service';
export declare class SystemController {
    private readonly systemService;
    constructor(systemService: SystemService);
    getStatus(): import("../common/dto/standard-response.dto").StandardResponse<{
        ocrProvider: "google" | "unavailable" | "mock";
        poiProvider: "osm" | "google" | "unavailable" | "mock";
        asrProvider: "openai" | "google" | "unavailable" | "mock" | "azure";
        ttsProvider: "openai" | "google" | "unavailable" | "mock" | "azure";
        llmProvider: "openai" | "google" | "anthropic" | "unavailable" | "mock";
        rateLimit: {
            enabled: boolean;
            remaining: any;
            resetAt: any;
        };
        features: {
            vision: {
                enabled: boolean;
                maxFileSize: number;
                supportedFormats: string[];
            };
            voice: {
                enabled: boolean;
                asrEnabled: boolean;
                ttsEnabled: boolean;
            };
            whatIf: {
                enabled: boolean;
                maxSamples: number;
            };
        };
    }>;
    getAdminMetrics(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminPerformance(startTime?: string, endTime?: string, granularity?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminErrors(startTime?: string, endTime?: string, level?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminRequests(startTime?: string, endTime?: string, granularity?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminDatabase(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminCache(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
