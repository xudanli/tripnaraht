export declare class RiskCalculator {
    static calculateRiskFromAlerts(alerts: Array<{
        severity?: 'info' | 'warning' | 'critical';
    }>): 0 | 1 | 2 | 3;
    static maxRiskLevel(...riskLevels: (0 | 1 | 2 | 3 | undefined)[]): 0 | 1 | 2 | 3;
}
