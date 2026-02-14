export interface SecurityCheckResult {
    isSafe: boolean;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    warnings: string[];
    blocked: boolean;
}
export declare class PostgreSQLMcpSecurityService {
    private readonly logger;
    private readonly sqlInjectionPatterns;
    private readonly dangerousOperations;
    private readonly readOnlyOperations;
    checkSQLSafety(query: string, params?: any[]): SecurityCheckResult;
    private containsSQLKeywords;
    private countNestedQueries;
    isReadOnlyQuery(query: string): boolean;
    validateParameters(query: string, params?: any[]): {
        isValid: boolean;
        error?: string;
    };
}
