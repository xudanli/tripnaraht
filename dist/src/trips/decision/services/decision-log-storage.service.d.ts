import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionLogEntry, DecisionStage } from '../shared/decision-result.types';
export declare class DecisionLogStorageService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    private isValidUUID;
    saveLogEntry(entry: DecisionLogEntry, options?: {
        tripId?: string;
        countryCode?: string;
        routeDirectionId?: string;
        metadata?: Record<string, any>;
    }): Promise<void>;
    saveLogEntries(entries: DecisionLogEntry[], options?: {
        tripId?: string;
        countryCode?: string;
        routeDirectionId?: string;
        metadata?: Record<string, any>;
    }): Promise<void>;
    queryLogs(filters: {
        tripId?: string;
        countryCode?: string;
        routeDirectionId?: string;
        persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
        decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
        action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
        decisionStage?: DecisionStage;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }): Promise<DecisionLogEntry[]>;
    getLogById(logId: string): Promise<DecisionLogEntry | null>;
    updateLogMetadata(logId: string, metadata: Record<string, any>): Promise<DecisionLogEntry>;
    queryLogsPaginated(filters: {
        tripId?: string;
        userId?: string;
        persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
        decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
        action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
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
    getLogDetailById(logId: string): Promise<any | null>;
    queryRawLogs(filters: {
        tripId?: string;
        persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
        decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
        action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }): Promise<any[]>;
}
