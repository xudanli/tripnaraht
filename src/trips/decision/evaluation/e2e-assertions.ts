// src/trips/decision/evaluation/e2e-assertions.ts
/**
 * E2E Assertions
 * 
 * 用于验证 E2E Case 的断言函数
 */

import { DecisionLogEntry } from '../shared/decision-result.types';
import { AbuExpected, DrDreExpected, NeptuneExpected, E2EDiff } from './e2e-case.types';

/**
 * 断言 Abu 行为
 */
export function assertAbuBehavior(
  logs: DecisionLogEntry[],
  expected: AbuExpected
): { passed: boolean; diff: string[] } {
  const diff: string[] = [];
  
  // 过滤 Abu 在 ABU_GATE 阶段的日志
  const abuLogs = logs.filter(
    l => l.persona === 'ABU' && l.decisionStage === 'ABU_GATE'
  );

  // 必须有一个 Abu 决策
  if (abuLogs.length === 0) {
    diff.push('缺少 Abu 决策日志');
    return { passed: false, diff };
  }

  const lastAbuLog = abuLogs[abuLogs.length - 1];

  // 动作必须匹配
  if (lastAbuLog.action !== expected.action) {
    diff.push(
      `动作不匹配: 预期 ${expected.action}, 实际 ${lastAbuLog.action}`
    );
  }

  // 如果预期 REJECT，必须有 reason codes
  if (expected.action === 'REJECT') {
    if (lastAbuLog.reasonCodes.length === 0) {
      diff.push('REJECT 动作缺少 reason codes');
    }

    // 必须包含预期的 reason codes
    if (expected.reasonCodes) {
      for (const code of expected.reasonCodes) {
        if (!lastAbuLog.reasonCodes.includes(code)) {
          diff.push(`缺少预期的 reason code: ${code}`);
        }
      }
    }

    // 必须检测到预期的违规
    if (expected.violations) {
      const explanation = lastAbuLog.explanation.toLowerCase();
      for (const violation of expected.violations) {
        if (!explanation.includes(violation.toLowerCase())) {
          diff.push(`未检测到预期的违规: ${violation}`);
        }
      }
    }
  }

  return {
    passed: diff.length === 0,
    diff,
  };
}

/**
 * 断言 Dr.Dre 行为
 */
export function assertDrDreBehavior(
  logs: DecisionLogEntry[],
  expected: DrDreExpected
): { passed: boolean; diff: string[] } {
  const diff: string[] = [];

  if (!expected) {
    return { passed: true, diff: [] };
  }

  const drdreLogs = logs.filter(
    l => l.persona === 'DR_DRE' && l.decisionStage === 'PACE_ADJUST'
  );

  if (expected.mustAdjust) {
    if (drdreLogs.length === 0) {
      diff.push('预期需要调整，但未找到 Dr.Dre 调整日志');
      return { passed: false, diff };
    }

    // 检查调整类型
    if (expected.adjustmentTypes) {
      const actualTypes = drdreLogs
        .map(l => l.reasonCodes)
        .flat()
        .join('|');

      for (const type of expected.adjustmentTypes) {
        if (!actualTypes.includes(type)) {
          diff.push(`缺少预期的调整类型: ${type}`);
        }
      }
    }
  } else {
    // 如果预期不需要调整，但找到了调整日志，记录差异（但不一定失败）
    if (drdreLogs.length > 0) {
      diff.push(`预期不需要调整，但找到了 ${drdreLogs.length} 条调整日志`);
    }
  }

  return {
    passed: diff.length === 0,
    diff,
  };
}

/**
 * 断言 Neptune 行为
 */
export function assertNeptuneBehavior(
  logs: DecisionLogEntry[],
  expected: NeptuneExpected
): { passed: boolean; diff: string[] } {
  const diff: string[] = [];

  if (!expected) {
    return { passed: true, diff: [] };
  }

  const neptuneLogs = logs.filter(
    l => l.persona === 'NEPTUNE' && l.decisionStage === 'SPATIAL_REPAIR'
  );

  if (expected.mustRepair) {
    if (neptuneLogs.length === 0) {
      diff.push('预期需要修复，但未找到 Neptune 修复日志');
      return { passed: false, diff };
    }

    // 检查替换类型
    if (expected.replacementTypes) {
      const actualTypes = neptuneLogs
        .map(l => l.reasonCodes)
        .flat()
        .join('|');

      for (const type of expected.replacementTypes) {
        if (!actualTypes.includes(type)) {
          diff.push(`缺少预期的替换类型: ${type}`);
        }
      }
    }
  } else {
    // 如果预期不需要修复，但找到了修复日志，记录差异（但不一定失败）
    if (neptuneLogs.length > 0) {
      diff.push(`预期不需要修复，但找到了 ${neptuneLogs.length} 条修复日志`);
    }
  }

  return {
    passed: diff.length === 0,
    diff,
  };
}

/**
 * 分析差异
 */
export function analyzeDiff(
  expected: {
    abuExpected: AbuExpected;
    drdreExpected?: DrDreExpected;
    neptuneExpected?: NeptuneExpected;
    routeDirectionId?: string;
    finalState: { allowed: boolean; planDays?: number };
  },
  actual: {
    logs: DecisionLogEntry[];
    routeDirectionId?: string;
    finalPlan?: { days: number; allowed: boolean };
  }
): E2EDiff {
  const diff: E2EDiff = {
    hasDiff: false,
  };

  // Abu 差异
  const abuResult = assertAbuBehavior(actual.logs, expected.abuExpected);
  if (!abuResult.passed) {
    diff.abuDiff = abuResult.diff;
    diff.hasDiff = true;
  }

  // Dr.Dre 差异
  if (expected.drdreExpected) {
    const drdreResult = assertDrDreBehavior(actual.logs, expected.drdreExpected);
    if (!drdreResult.passed) {
      diff.drdreDiff = drdreResult.diff;
      diff.hasDiff = true;
    }
  }

  // Neptune 差异
  if (expected.neptuneExpected) {
    const neptuneResult = assertNeptuneBehavior(
      actual.logs,
      expected.neptuneExpected
    );
    if (!neptuneResult.passed) {
      diff.neptuneDiff = neptuneResult.diff;
      diff.hasDiff = true;
    }
  }

  // RouteDirection 差异
  if (expected.routeDirectionId) {
    if (actual.routeDirectionId !== expected.routeDirectionId) {
      diff.routeDirectionDiff = `预期 ${expected.routeDirectionId}, 实际 ${actual.routeDirectionId || '未选择'}`;
      diff.hasDiff = true;
    }
  }

  // 最终状态差异
  if (actual.finalPlan) {
    if (actual.finalPlan.allowed !== expected.finalState.allowed) {
      diff.finalStateDiff = `预期 allowed=${expected.finalState.allowed}, 实际 allowed=${actual.finalPlan.allowed}`;
      diff.hasDiff = true;
    }

    if (
      expected.finalState.planDays &&
      actual.finalPlan.days !== expected.finalState.planDays
    ) {
      diff.finalStateDiff = `${diff.finalStateDiff || ''}; 预期天数=${expected.finalState.planDays}, 实际天数=${actual.finalPlan.days}`;
      diff.hasDiff = true;
    }
  }

  return diff;
}
