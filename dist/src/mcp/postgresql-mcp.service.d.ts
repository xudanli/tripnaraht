import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PostgreSQLMcpSecurityService } from './services/postgresql-mcp-security.service';
import { PostgreSQLMcpMonitoringService } from './services/postgresql-mcp-monitoring.service';
export declare class PostgreSQLMcpService implements OnModuleInit, OnModuleDestroy {
    private readonly securityService;
    private readonly monitoringService?;
    private readonly logger;
    private client;
    constructor(securityService: PostgreSQLMcpSecurityService, monitoringService?: PostgreSQLMcpMonitoringService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private ensureConnected;
    query(query: string, params?: any[]): Promise<any>;
    execute(query: string, params?: any[]): Promise<any>;
    listTools(): Promise<any[]>;
    isAvailable(): boolean;
}
