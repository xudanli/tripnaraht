import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class BrowserbaseMcpService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private client;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private ensureConnected;
    createSession(params: {
        url?: string;
        userAgent?: string;
        viewport?: {
            width?: number;
            height?: number;
        };
    }): Promise<any>;
    navigate(params: {
        sessionId: string;
        url: string;
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    }): Promise<any>;
    screenshot(params: {
        sessionId: string;
        fullPage?: boolean;
        quality?: number;
    }): Promise<any>;
    click(params: {
        sessionId: string;
        selector: string;
        waitForNavigation?: boolean;
    }): Promise<any>;
    evaluate(params: {
        sessionId: string;
        script: string;
    }): Promise<any>;
    listTools(): Promise<any[]>;
    isAvailable(): boolean;
    getAuthorizationUrl(): Promise<{
        authorizationUrl: string;
        connectionId: string;
    }>;
    verifyAuthorization(connectionId: string): Promise<{
        isAuthorized: boolean;
        message?: string;
    }>;
}
