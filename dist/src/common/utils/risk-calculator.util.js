"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskCalculator = void 0;
class RiskCalculator {
    static calculateRiskFromAlerts(alerts) {
        if (!alerts || alerts.length === 0) {
            return 0;
        }
        const hasCritical = alerts.some(a => a.severity === 'critical');
        const hasWarning = alerts.some(a => a.severity === 'warning');
        if (hasCritical) {
            return 3;
        }
        if (hasWarning) {
            return 2;
        }
        return 0;
    }
    static maxRiskLevel(...riskLevels) {
        const validLevels = riskLevels.filter((level) => level !== undefined && level >= 0 && level <= 3);
        if (validLevels.length === 0) {
            return 0;
        }
        return Math.max(...validLevels);
    }
}
exports.RiskCalculator = RiskCalculator;
//# sourceMappingURL=risk-calculator.util.js.map