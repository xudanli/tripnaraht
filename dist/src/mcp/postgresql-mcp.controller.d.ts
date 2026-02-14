import { PostgreSQLMcpService } from './postgresql-mcp.service';
import { PostgreSQLMcpMonitoringService } from './services/postgresql-mcp-monitoring.service';
import { QueryDto, ExecuteDto } from './dto/postgresql.dto';
export declare class PostgreSQLMcpController {
    private readonly postgresqlMcpService;
    private readonly monitoringService;
    private readonly logger;
    constructor(postgresqlMcpService: PostgreSQLMcpService, monitoringService: PostgreSQLMcpMonitoringService);
    query(dto: QueryDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    execute(dto: ExecuteDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    listTools(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    health(): Promise<import("../common/dto/standard-response.dto").StandardResponse<{
        available: boolean;
        service: string;
    }>>;
    getPerformanceStats(days?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getSlowQueries(limit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
