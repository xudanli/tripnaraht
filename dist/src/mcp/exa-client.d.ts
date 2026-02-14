export declare class ExaMcpClient {
    private serverUrl;
    private client;
    private transport;
    private isConnected;
    constructor(serverUrl?: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    callTool(name: string, args: Record<string, any>): Promise<any>;
    listTools(): Promise<any[]>;
    getIsConnected(): boolean;
}
