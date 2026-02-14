import { PrismaService } from '../../prisma/prisma.service';
import { PostgreSQLMcpService } from '../../mcp/postgresql-mcp.service';
export declare class AgentRunAdminService {
    private readonly prisma;
    private readonly postgresqlMcp?;
    private readonly logger;
    constructor(prisma: PrismaService, postgresqlMcp?: PostgreSQLMcpService);
    private isValidUUID;
    getRuns(filters: {
        tripId?: string;
        userId?: string;
        status?: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
        planningPhase?: string;
        startDate?: Date;
        endDate?: Date;
        page?: number;
        limit?: number;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }): Promise<{
        items: any[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getRunById(runId: string): Promise<any | null>;
    getRunStats(filters?: {
        startDate?: Date;
        endDate?: Date;
        planningPhase?: string;
    }): Promise<any>;
    getAttempts(filters: {
        tripRunId?: string;
        status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
        page?: number;
        limit?: number;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }): Promise<{
        items: any[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getAttemptById(attemptId: string): Promise<any | null>;
    cancelRun(runId: string): Promise<boolean>;
    getPerformanceAnalysis(filters?: {
        startDate?: Date;
        endDate?: Date;
    }): Promise<any>;
    batchUpdateRunStatus(runIds: string[], status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'): Promise<number>;
    cleanupExpiredRuns(retentionDays?: number): Promise<number>;
}
