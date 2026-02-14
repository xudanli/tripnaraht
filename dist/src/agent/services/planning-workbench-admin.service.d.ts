import { PrismaService } from '../../prisma/prisma.service';
export declare class PlanningWorkbenchAdminService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getSessions(filters: {
        tripId?: string;
        userId?: string;
        status?: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
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
    getSessionById(sessionId: string): Promise<any | null>;
    getSessionStats(filters?: {
        startDate?: Date;
        endDate?: Date;
    }): Promise<any>;
    getPlans(filters: {
        tripId?: string;
        status?: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
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
    getPlanById(planId: string): Promise<any | null>;
}
