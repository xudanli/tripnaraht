export declare class AirbnbMcpClientConnectAPI {
    private namespace?;
    private connectionIdOverride?;
    private client;
    private transport;
    private connectionId;
    private isConnected;
    constructor(namespace?: string, connectionIdOverride?: string);
    connect(): Promise<void>;
    reconnect(connectionId: string): Promise<void>;
    disconnect(): Promise<void>;
    listTools(): Promise<any>;
    callTool(name: string, arguments_?: Record<string, any>): Promise<any>;
    getConnectionId(): string | null;
    private ensureConnected;
}
