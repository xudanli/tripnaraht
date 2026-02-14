export interface PermissionConfig {
    userId?: string;
    role?: string;
    allowedOperations?: ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE')[];
    allowedTables?: string[];
    maxQueryLength?: number;
    maxParamsCount?: number;
}
export interface PermissionCheckResult {
    allowed: boolean;
    reason?: string;
}
export declare class PostgreSQLMcpPermissionService {
    private readonly logger;
    private readonly defaultConfig;
    private readonly rolePermissions;
    checkPermission(query: string, config?: PermissionConfig): PermissionCheckResult;
    private mergeConfig;
    private extractOperation;
    private extractTables;
    checkParamsCount(params: any[] | undefined, config?: PermissionConfig): PermissionCheckResult;
}
