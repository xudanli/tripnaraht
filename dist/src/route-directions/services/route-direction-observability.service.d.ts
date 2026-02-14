export interface RouteDirectionTrace {
    requestId: string;
    startTime: number;
    endTime?: number;
    latencies: {
        rdSelectMs?: number;
        poiPoolQueryMs?: number;
        constraintsInjectMs?: number;
        planGenerateMs?: number;
        neptuneRepairMs?: number;
    };
    quality: {
        poiPoolSize?: number;
        hardConstraintsHitCount?: number;
        softConstraintsHitCount?: number;
        repairActionCount?: number;
        selectedRdId?: number;
        selectedRdName?: string;
    };
    errors: {
        corridorGeomInvalid?: boolean;
        poiQueryTimeout?: boolean;
        noCandidatesFallbackUsed?: boolean;
        errorMessages?: string[];
    };
    decisionContext?: {
        countryCode?: string;
        month?: number;
        userIntent?: {
            preferences?: string[];
            pace?: string;
            riskTolerance?: string;
        };
        scoreBreakdown?: {
            tagMatch?: number;
            seasonMatch?: number;
            paceMatch?: number;
            riskMatch?: number;
            totalScore?: number;
        };
        matchedSignals?: Record<string, any>;
    };
    poiPoolEvolution?: {
        initialSize?: number;
        afterRdFilter?: number;
        afterConstraints?: number;
        finalSize?: number;
        filters?: Array<{
            stage: string;
            sizeBefore: number;
            sizeAfter: number;
            reason?: string;
        }>;
    };
}
export declare class RouteDirectionObservabilityService {
    private readonly logger;
    private readonly traces;
    private readonly maxTracesInMemory;
    private readonly metrics;
    createTrace(requestId: string): RouteDirectionTrace;
    recordRdSelectLatency(requestId: string, latencyMs: number): void;
    recordPoiPoolQueryLatency(requestId: string, latencyMs: number): void;
    recordConstraintsInjectLatency(requestId: string, latencyMs: number): void;
    recordPlanGenerateLatency(requestId: string, latencyMs: number): void;
    recordNeptuneRepairLatency(requestId: string, latencyMs: number): void;
    recordPoiPoolSize(requestId: string, size: number, stage?: string): void;
    recordPoiPoolFilter(requestId: string, stage: string, sizeBefore: number, sizeAfter: number, reason?: string): void;
    recordHardConstraintsHit(requestId: string, count: number): void;
    recordSoftConstraintsHit(requestId: string, count: number): void;
    recordRepairActionCount(requestId: string, count: number): void;
    recordSelectedRd(requestId: string, rdId: number, rdName: string, decisionContext?: RouteDirectionTrace['decisionContext']): void;
    recordCorridorGeomInvalid(requestId: string, errorMessage?: string): void;
    recordPoiQueryTimeout(requestId: string, timeoutMs?: number): void;
    recordNoCandidatesFallback(requestId: string, reason?: string): void;
    completeTrace(requestId: string): RouteDirectionTrace | null;
    getTrace(requestId: string): RouteDirectionTrace | null;
    generateTraceReport(requestId: string): {
        latencyBreakdown: {
            slowestStage?: string;
            slowestLatency?: number;
            totalLatency?: number;
            breakdown: Record<string, number>;
        };
        rdSelection: {
            selectedRdId?: number;
            selectedRdName?: string;
            whySelected?: {
                scoreBreakdown?: Record<string, number>;
                matchedSignals?: Record<string, any>;
            };
        };
        poiPoolEvolution: {
            initialSize?: number;
            finalSize?: number;
            shrinkage?: number;
            shrinkagePercentage?: number;
            filters?: Array<{
                stage: string;
                sizeBefore: number;
                sizeAfter: number;
                reason?: string;
            }>;
        };
    };
    getMetrics(): {
        latencies: {
            rdSelectMs: {
                avg: number;
                p95: number;
                p99: number;
            };
            poiPoolQueryMs: {
                avg: number;
                p95: number;
                p99: number;
            };
            constraintsInjectMs: {
                avg: number;
                p95: number;
                p99: number;
            };
            planGenerateMs: {
                avg: number;
                p95: number;
                p99: number;
            };
            neptuneRepairMs: {
                avg: number;
                p95: number;
                p99: number;
            };
        };
        quality: {
            poiPoolSize: {
                avg: number;
                min: number;
                max: number;
            };
            hardConstraintsHitCount: {
                avg: number;
                max: number;
            };
            softConstraintsHitCount: {
                avg: number;
                max: number;
            };
            repairActionCount: {
                avg: number;
                max: number;
            };
            selectedRdIdDistribution: Record<number, number>;
        };
        errors: {
            corridorGeomInvalid: number;
            poiQueryTimeout: number;
            noCandidatesFallbackUsed: number;
        };
    };
    cleanupOldTraces(maxAgeMs?: number): void;
}
