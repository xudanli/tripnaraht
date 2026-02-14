import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class RailService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private client;
    private isConnected;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private ensureConnected;
    searchRoutes(params: {
        origin: string;
        destination: string;
        date?: string;
    }): Promise<any>;
    getSchedule(params: {
        origin: string;
        destination: string;
        date: string;
    }): Promise<any>;
    isServiceAvailable(): boolean;
    listTools(): Promise<string[]>;
}
