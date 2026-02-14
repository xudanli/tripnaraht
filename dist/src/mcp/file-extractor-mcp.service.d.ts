import { OnModuleInit } from '@nestjs/common';
import { FileExtractorDirectService } from './file-extractor-direct.service';
export declare class FileExtractorMcpService implements OnModuleInit {
    private readonly directService?;
    private readonly logger;
    private client;
    private isAvailableFlag;
    private useDirectService;
    constructor(directService?: FileExtractorDirectService);
    onModuleInit(): Promise<void>;
    isAvailable(): boolean;
    extractMetadata(url: string): Promise<any>;
    extractFileContent(url: string, options?: {
        page?: number;
        limit?: number;
        search?: string;
        sheet?: string;
        caseSensitive?: boolean;
    }): Promise<any>;
    listTools(): Promise<any>;
}
