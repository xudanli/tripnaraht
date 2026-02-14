export interface BrowserbaseCreateSessionParams {
    url?: string;
    userAgent?: string;
    viewport?: {
        width?: number;
        height?: number;
    };
}
export interface BrowserbaseCreateSessionResult {
    sessionId: string;
    url?: string;
}
export interface BrowserbaseNavigateParams {
    sessionId: string;
    url: string;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}
export interface BrowserbaseScreenshotParams {
    sessionId: string;
    fullPage?: boolean;
    quality?: number;
}
export interface BrowserbaseClickParams {
    sessionId: string;
    selector: string;
    waitForNavigation?: boolean;
}
export interface BrowserbaseEvaluateParams {
    sessionId: string;
    script: string;
}
export declare class BrowserbaseMcpClient {
    private namespace?;
    private connectionIdOverride?;
    private client;
    private transport;
    private connectionId;
    private isConnected;
    private readonly serverUrl;
    constructor(serverUrl?: string, namespace?: string, connectionIdOverride?: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getConnectionId(): string | null;
    isClientConnected(): boolean;
    listTools(): Promise<any[]>;
    createSession(params: BrowserbaseCreateSessionParams): Promise<BrowserbaseCreateSessionResult>;
    navigate(params: BrowserbaseNavigateParams): Promise<any>;
    screenshot(params: BrowserbaseScreenshotParams): Promise<{
        image: string;
        base64?: string;
    }>;
    click(params: BrowserbaseClickParams): Promise<any>;
    evaluate(params: BrowserbaseEvaluateParams): Promise<any>;
}
