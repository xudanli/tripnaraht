"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertAbuBehavior = assertAbuBehavior;
exports.assertDrDreBehavior = assertDrDreBehavior;
exports.assertNeptuneBehavior = assertNeptuneBehavior;
exports.analyzeDiff = analyzeDiff;
function assertAbuBehavior(logs, expected) {
    const diff = [];
    const abuLogs = logs.filter(l => l.persona === 'ABU' && l.decisionStage === 'ABU_GATE');
    if (abuLogs.length === 0) {
        diff.push('缺少 Abu 决策日志');
        return { passed: false, diff };
    }
    const lastAbuLog = abuLogs[abuLogs.length - 1];
    if (lastAbuLog.action !== expected.action) {
        diff.push(`动作不匹配: 预期 ${expected.action}, 实际 ${lastAbuLog.action}`);
    }
    if (expected.action === 'REJECT') {
        if (lastAbuLog.reasonCodes.length === 0) {
            diff.push('REJECT 动作缺少 reason codes');
        }
        if (expected.reasonCodes) {
            for (const code of expected.reasonCodes) {
                if (!lastAbuLog.reasonCodes.includes(code)) {
                    diff.push(`缺少预期的 reason code: ${code}`);
                }
            }
        }
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
function assertDrDreBehavior(logs, expected) {
    const diff = [];
    if (!expected) {
        return { passed: true, diff: [] };
    }
    const drdreLogs = logs.filter(l => l.persona === 'DR_DRE' && l.decisionStage === 'PACE_ADJUST');
    if (expected.mustAdjust) {
        if (drdreLogs.length === 0) {
            diff.push('预期需要调整，但未找到 Dr.Dre 调整日志');
            return { passed: false, diff };
        }
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
    }
    else {
        if (drdreLogs.length > 0) {
            diff.push(`预期不需要调整，但找到了 ${drdreLogs.length} 条调整日志`);
        }
    }
    return {
        passed: diff.length === 0,
        diff,
    };
}
function assertNeptuneBehavior(logs, expected) {
    const diff = [];
    if (!expected) {
        return { passed: true, diff: [] };
    }
    const neptuneLogs = logs.filter(l => l.persona === 'NEPTUNE' && l.decisionStage === 'SPATIAL_REPAIR');
    if (expected.mustRepair) {
        if (neptuneLogs.length === 0) {
            diff.push('预期需要修复，但未找到 Neptune 修复日志');
            return { passed: false, diff };
        }
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
    }
    else {
        if (neptuneLogs.length > 0) {
            diff.push(`预期不需要修复，但找到了 ${neptuneLogs.length} 条修复日志`);
        }
    }
    return {
        passed: diff.length === 0,
        diff,
    };
}
function analyzeDiff(expected, actual) {
    const diff = {
        hasDiff: false,
    };
    const abuResult = assertAbuBehavior(actual.logs, expected.abuExpected);
    if (!abuResult.passed) {
        diff.abuDiff = abuResult.diff;
        diff.hasDiff = true;
    }
    if (expected.drdreExpected) {
        const drdreResult = assertDrDreBehavior(actual.logs, expected.drdreExpected);
        if (!drdreResult.passed) {
            diff.drdreDiff = drdreResult.diff;
            diff.hasDiff = true;
        }
    }
    if (expected.neptuneExpected) {
        const neptuneResult = assertNeptuneBehavior(actual.logs, expected.neptuneExpected);
        if (!neptuneResult.passed) {
            diff.neptuneDiff = neptuneResult.diff;
            diff.hasDiff = true;
        }
    }
    if (expected.routeDirectionId) {
        if (actual.routeDirectionId !== expected.routeDirectionId) {
            diff.routeDirectionDiff = `预期 ${expected.routeDirectionId}, 实际 ${actual.routeDirectionId || '未选择'}`;
            diff.hasDiff = true;
        }
    }
    if (actual.finalPlan) {
        if (actual.finalPlan.allowed !== expected.finalState.allowed) {
            diff.finalStateDiff = `预期 allowed=${expected.finalState.allowed}, 实际 allowed=${actual.finalPlan.allowed}`;
            diff.hasDiff = true;
        }
        if (expected.finalState.planDays &&
            actual.finalPlan.days !== expected.finalState.planDays) {
            diff.finalStateDiff = `${diff.finalStateDiff || ''}; 预期天数=${expected.finalState.planDays}, 实际天数=${actual.finalPlan.days}`;
            diff.hasDiff = true;
        }
    }
    return diff;
}
//# sourceMappingURL=e2e-assertions.js.map