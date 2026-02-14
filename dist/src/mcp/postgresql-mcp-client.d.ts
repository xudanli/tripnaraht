export interface PostgreSQLQueryParams {
    query: string;
    params?: any[];
}
export interface PostgreSQLQueryResult {
    rows: any[];
    rowCount: number;
    columns?: string[];
}
export interface PostgreSQLExecuteParams {
    query: string;
    params?: any[];
}
export interface PostgreSQLExecuteResult {
    rowCount: number;
    lastInsertId?: string;
}
export declare class PostgreSQLMcpClient {
    private client;
    private transport;
    private isConnected;
    private readonly serverUrl;
    constructor(serverUrl?: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    query(params: PostgreSQLQueryParams): Promise<PostgreSQLQueryResult>;
    execute(params: PostgreSQLExecuteParams): Promise<PostgreSQLExecuteResult>;
    listTools(): Promise<any[]>;
    isClientConnected(): boolean;
}
