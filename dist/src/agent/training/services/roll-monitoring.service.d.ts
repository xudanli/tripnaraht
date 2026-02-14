import { ConfigService } from '@nestjs/config';
import { RollClientService } from './roll-client.service';
export declare class RollMonitoringService {
    private readonly configService;
    private readonly rollClient?;
    private readonly logger;
    private readonly enabled;
    private readonly bridgeUrl;
    constructor(configService: ConfigService, rollClient?: RollClientService);
    getMetrics(): Promise<{
        bridgeService?: any;
        rayCluster?: any;
        workers?: any;
    }>;
    getWorkersStatus(): Promise<any>;
    checkHealth(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: Record<string, any>;
    }>;
}
