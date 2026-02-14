import { ConfigService } from '@nestjs/config';
export declare class SystemService {
    private configService?;
    constructor(configService?: ConfigService);
    getStatus(): {
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
    };
    private getOcrProvider;
    private getPoiProvider;
    private getAsrProvider;
    private getTtsProvider;
    private getLlmProvider;
    getAdminMetrics(): Promise<{
        system: {
            cpuUsage: number;
            memoryUsage: number;
            diskUsage: number;
            uptime: number;
        };
        api: {
            totalRequests: number;
            requestsPerSecond: number;
            avgResponseTime: number;
            p95ResponseTime: number;
            p99ResponseTime: number;
            errorRate: number;
            successRate: number;
        };
        database: {
            connectionPoolSize: number;
            activeConnections: number;
            idleConnections: number;
            queryCount: number;
            avgQueryTime: number;
            slowQueries: number;
        };
        cache: {
            hitRate: number;
            missRate: number;
            totalKeys: number;
            memoryUsage: number;
        };
        timestamp: string;
    }>;
    getAdminPerformance(options?: {
        startTime?: Date;
        endTime?: Date;
        granularity?: 'hour' | 'day';
    }): Promise<{
        timeSeries: any[];
        summary: {
            peakRequestsPerSecond: number;
            peakResponseTime: number;
            peakErrorRate: number;
        };
    }>;
    getAdminErrors(options?: {
        startTime?: Date;
        endTime?: Date;
        level?: 'error' | 'warn';
    }): Promise<{
        summary: {
            totalErrors: number;
            errorRate: number;
            uniqueErrors: number;
        };
        byType: {};
        topErrors: any[];
        trends: {
            errorsByHour: any[];
        };
    }>;
    getAdminRequests(options?: {
        startTime?: Date;
        endTime?: Date;
        granularity?: 'hour' | 'day';
    }): Promise<{
        summary: {
            totalRequests: number;
            requestsPerSecond: number;
            uniqueUsers: number;
            uniqueIPs: number;
        };
        byEndpoint: any[];
        byMethod: {
            GET: number;
            POST: number;
            PUT: number;
            DELETE: number;
            PATCH: number;
        };
        byStatus: {
            '2xx': number;
            '3xx': number;
            '4xx': number;
            '5xx': number;
        };
        timeSeries: any[];
    }>;
    getAdminDatabase(): Promise<{
        connectionPool: {
            size: number;
            active: number;
            idle: number;
            waiting: number;
        };
        queries: {
            total: number;
            avgTime: number;
            slowQueries: number;
            slowQueryThreshold: number;
        };
        tables: {
            total: number;
            largest: any[];
        };
        health: {
            status: string;
            lastCheck: string;
        };
    }>;
    getAdminCache(): Promise<{
        status: string;
        hitRate: number;
        missRate: number;
        totalKeys: number;
        memoryUsage: {
            used: number;
            max: number;
            percentage: number;
        };
        operations: {
            hits: number;
            misses: number;
            sets: number;
            deletes: number;
        };
        topKeys: any[];
        evictions: number;
    }>;
}
