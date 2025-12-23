// src/common/utils/risk-calculator.util.ts

/**
 * 风险计算工具
 * 
 * 统一处理风险等级计算逻辑
 */
export class RiskCalculator {
  /**
   * 从警报数组中计算最高风险等级
   */
  static calculateRiskFromAlerts(
    alerts: Array<{ severity?: 'info' | 'warning' | 'critical' }>
  ): 0 | 1 | 2 | 3 {
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

  /**
   * 计算多个风险等级中的最大值
   */
  static maxRiskLevel(...riskLevels: (0 | 1 | 2 | 3 | undefined)[]): 0 | 1 | 2 | 3 {
    const validLevels = riskLevels.filter((level): level is 0 | 1 | 2 | 3 => 
      level !== undefined && level >= 0 && level <= 3
    );
    
    if (validLevels.length === 0) {
      return 0;
    }

    return Math.max(...validLevels) as 0 | 1 | 2 | 3;
  }
}

