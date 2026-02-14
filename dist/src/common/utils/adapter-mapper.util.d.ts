export declare class AdapterMapper {
    static mapSeverity(severity: string | undefined, customMap?: Record<string, 'info' | 'warning' | 'critical'>): 'info' | 'warning' | 'critical';
    static mapWeatherCondition(condition: string | undefined, customMap?: Record<string, string>): string;
    static extractErrorMessage(error: unknown): string;
    static createDefaultErrorResponse<T extends {
        lastUpdated: Date;
        source: string;
        metadata?: any;
    }>(source: string, error: unknown, defaultData: Partial<T>): T;
}
