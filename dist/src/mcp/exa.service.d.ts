import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class ExaService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private client;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private getClient;
    webSearch(query: string, options?: {
        numResults?: number;
        useAutoprompt?: boolean;
        category?: string;
        startPublishedDate?: string;
        endPublishedDate?: string;
    }): Promise<any>;
    getCodeContext(query: string, options?: {
        numResults?: number;
        languages?: string[];
    }): Promise<any>;
    companyResearch(company: string, options?: {
        numResults?: number;
    }): Promise<any>;
    webSearchAdvanced(query: string, options?: {
        numResults?: number;
        useAutoprompt?: boolean;
        category?: string;
        startPublishedDate?: string;
        endPublishedDate?: string;
        contents?: {
            text?: boolean;
            html?: boolean;
            markdown?: boolean;
        };
        filters?: {
            domains?: string[];
            excludeDomains?: string[];
        };
    }): Promise<any>;
    deepSearch(query: string, options?: {
        numResults?: number;
    }): Promise<any>;
    crawlUrl(url: string, options?: {
        text?: boolean;
        html?: boolean;
        markdown?: boolean;
    }): Promise<any>;
    peopleSearch(query: string, options?: {
        numResults?: number;
    }): Promise<any>;
    deepResearcherStart(query: string, options?: {
        reportType?: string;
        numResults?: number;
    }): Promise<any>;
    deepResearcherCheck(taskId: string): Promise<any>;
    listTools(): Promise<any[]>;
    checkConnectionStatus(): Promise<{
        isConnected: boolean;
        hasApiKey: boolean;
    }>;
}
