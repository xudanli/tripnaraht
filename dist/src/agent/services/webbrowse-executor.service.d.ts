import { ConfigService } from '@nestjs/config';
export interface WebBrowseResult {
    success: boolean;
    url?: string;
    content?: string;
    title?: string;
    error?: string;
    screenshot?: string;
    metadata?: {
        loadTime?: number;
        contentLength?: number;
        statusCode?: number;
    };
}
export declare class WebBrowseExecutorService {
    private configService?;
    private readonly logger;
    private readonly enabled;
    private browser;
    private readonly maxConcurrentPages;
    private activePages;
    constructor(configService?: ConfigService);
    private getBrowser;
    browse(url: string, options?: {
        waitForSelector?: string;
        waitForTimeout?: number;
        takeScreenshot?: boolean;
        extractText?: boolean;
        extractLinks?: boolean;
        userAgent?: string;
        viewport?: {
            width: number;
            height: number;
        };
    }): Promise<WebBrowseResult>;
    browseMany(urls: string[], options?: {
        waitForSelector?: string;
        waitForTimeout?: number;
        takeScreenshot?: boolean;
        extractText?: boolean;
    }): Promise<WebBrowseResult[]>;
    cleanup(): Promise<void>;
    isAvailable(): Promise<boolean>;
}
