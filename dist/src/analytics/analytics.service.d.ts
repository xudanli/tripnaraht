import { PrismaService } from '../prisma/prisma.service';
import { PostgreSQLMcpService } from '../mcp/postgresql-mcp.service';
export declare class AnalyticsService {
    private readonly prisma;
    private readonly postgresqlMcp?;
    private readonly logger;
    constructor(prisma: PrismaService, postgresqlMcp?: PostgreSQLMcpService);
    executeAnalyticsQuery(query: string, params?: any[]): Promise<any>;
    getTripStatistics(startDate: Date, endDate: Date): Promise<any>;
    getUserActivityStats(startDate: Date, endDate: Date): Promise<any>;
    getDecisionStatistics(startDate: Date, endDate: Date): Promise<any>;
    getRouteDirectionUsageStats(countryCode?: string): Promise<any>;
    getPOIAccessStats(startDate: Date, endDate: Date): Promise<any>;
}
