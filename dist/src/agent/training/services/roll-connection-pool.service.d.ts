import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class RollConnectionPoolService implements OnModuleDestroy {
    private readonly configService;
    private readonly logger;
    private readonly bridgeUrl;
    private readonly maxConnections;
    private readonly keepAlive;
    private readonly keepAliveTimeout;
    private agent;
    constructor(configService: ConfigService);
    private initializeAgent;
    getAgent(): any;
    getBridgeUrl(): string;
    onModuleDestroy(): void;
}
