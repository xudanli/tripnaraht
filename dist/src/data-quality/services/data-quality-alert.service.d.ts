import { PrismaService } from '../../prisma/prisma.service';
export interface CreateAlertDto {
    monitorId?: string;
    geographicMonitorId?: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    alertType: string;
    message: string;
    details?: any;
}
export declare class DataQualityAlertService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    createAlert(dto: CreateAlertDto): Promise<void>;
    private sendNotification;
    acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void>;
    resolveAlert(alertId: string): Promise<void>;
    getPendingAlerts(limit?: number): Promise<({
        monitor: {
            status: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            dataSource: string;
            countryCode: string;
            lastUpdated: Date;
            dataType: string;
            accuracy: number;
            lastVerified: Date;
            completeness: number;
            timeliness: number;
            overallScore: number;
            recordCount: number;
            consistency: number;
            traceability: number;
        };
        geographicMonitor: {
            status: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            dataSource: string;
            countryCode: string;
            lastUpdated: Date;
            dataType: string;
            accuracy: number;
            coverageRate: number | null;
            lastVerified: Date;
            completeness: number;
            timeliness: number;
            overallScore: number;
            recordCount: number;
            consistency: number;
            traceability: number;
            spatialAccuracy: number;
            coordinateSystemConsistency: number;
            spatialCompleteness: number;
            spatialConsistency: number;
            queryLatencyP50: number | null;
            queryLatencyP95: number | null;
            queryLatencyP99: number | null;
            querySuccessRate: number | null;
            missingRegions: import("@prisma/client/runtime/library").JsonValue | null;
        };
    } & {
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        message: string;
        details: import("@prisma/client/runtime/library").JsonValue | null;
        severity: string;
        alertType: string;
        acknowledgedAt: Date | null;
        resolvedAt: Date | null;
        monitorId: string | null;
        geographicMonitorId: string | null;
        acknowledgedBy: string | null;
    })[]>;
    checkDataExpiry(): Promise<void>;
}
