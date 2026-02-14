"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ExplainabilityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExplainabilityService = void 0;
const common_1 = require("@nestjs/common");
let ExplainabilityService = ExplainabilityService_1 = class ExplainabilityService {
    constructor() {
        this.logger = new common_1.Logger(ExplainabilityService_1.name);
    }
    explainPlan(plan, log, violations) {
        const whyThisPlan = [];
        const slots = [];
        if (log.explanation) {
            whyThisPlan.push({
                type: 'reason',
                title: '规划策略',
                message: log.explanation,
            });
        }
        if (log.strategyMix && log.strategyMix.length > 0) {
            const strategyNames = {
                abu: '核心体验保护',
                drdre: '时间窗调度',
                neptune: '动态修复',
            };
            whyThisPlan.push({
                type: 'reason',
                title: '使用的策略',
                message: `采用 ${log.strategyMix.map(s => strategyNames[s] || s).join(' + ')} 策略`,
            });
        }
        for (const action of log.chosenActions || []) {
            whyThisPlan.push({
                type: 'reason',
                title: this.getActionTitle(action.actionType),
                message: this.getActionMessage(action),
                details: action.payload,
                actionable: true,
                actionType: this.mapActionType(action.actionType),
            });
        }
        for (const day of plan.days) {
            for (const slot of day.timeSlots) {
                slots.push(this.explainSlot(slot, day.date));
            }
        }
        const violationItems = violations
            ? violations.map(v => ({
                severity: v.severity,
                message: v.message,
                suggestions: v.suggestions || [],
            }))
            : [];
        return {
            summary: this.generateSummary(plan, log, violations),
            whyThisPlan,
            violations: violationItems.length > 0 ? violationItems : undefined,
            slots,
        };
    }
    explainChanges(oldPlan, newPlan, diff, log) {
        const whyChanged = [];
        if (diff.summary.totalChanged > 0) {
            whyChanged.push({
                type: 'change',
                title: '计划调整',
                message: `共调整了 ${diff.summary.totalChanged} 个活动项`,
                details: {
                    moved: diff.summary.moved,
                    removed: diff.summary.removed,
                    added: diff.summary.added,
                    swapped: diff.summary.swapped,
                },
            });
        }
        if (log.violations && log.violations.length > 0) {
            for (const violation of log.violations) {
                whyChanged.push({
                    type: 'warning',
                    title: '检测到问题',
                    message: `原因：${violation.code}`,
                    details: violation.details,
                    actionable: true,
                    actionType: 'adjust',
                });
            }
        }
        const baseExplanation = this.explainPlan(newPlan, log);
        return {
            ...baseExplanation,
            whyChanged,
            summary: `计划已更新：${log.explanation || '根据最新信息调整'}`,
        };
    }
    explainSlot(slot, date) {
        const reasons = slot.reasons || [];
        const warnings = [];
        const suggestions = [];
        if (slot.priorityTag === 'core') {
            reasons.push('这是核心体验，已优先保留');
        }
        else if (slot.priorityTag === 'anchor') {
            reasons.push('这是固定锚点，不可调整');
        }
        if (slot.locked) {
            warnings.push('此活动已锁定，系统不会自动调整');
        }
        if (slot.travelLegFromPrev && slot.travelLegFromPrev.durationMin > 0) {
            reasons.push(`从上一站到此需要 ${slot.travelLegFromPrev.durationMin} 分钟`);
        }
        return {
            slotId: slot.id,
            title: slot.title,
            reasons,
            warnings: warnings.length > 0 ? warnings : undefined,
            suggestions: suggestions.length > 0 ? suggestions : undefined,
        };
    }
    generateSummary(plan, log, violations) {
        const parts = [];
        parts.push(`为您规划了 ${plan.days.length} 天的行程`);
        const totalSlots = plan.days.reduce((sum, day) => sum + day.timeSlots.length, 0);
        parts.push(`包含 ${totalSlots} 个活动项`);
        if (violations && violations.length > 0) {
            const errorCount = violations.filter(v => v.severity === 'error').length;
            if (errorCount > 0) {
                parts.push(`⚠️ 发现 ${errorCount} 个需要调整的问题`);
            }
        }
        return parts.join('，') + '。';
    }
    getActionTitle(actionType) {
        const titles = {
            prioritize: '优先级调整',
            drop: '活动移除',
            swap: '活动替换',
            reorder: '顺序调整',
            insert_buffer: '缓冲时间',
            shorten: '时长缩短',
        };
        return titles[actionType] || actionType;
    }
    getActionMessage(action) {
        const reasonCodes = action.reasonCodes || [];
        const messages = {
            RISK_BASED: '基于风险评估',
            MIN_EDIT_REPAIR: '最小改动修复',
            TIME_WINDOW_MISS: '时间窗冲突',
            BUDGET_OVERRUN: '预算超支',
        };
        return reasonCodes.map(code => messages[code] || code).join('、') || '';
    }
    mapActionType(actionType) {
        switch (actionType) {
            case 'prioritize':
            case 'reorder':
                return 'adjust';
            case 'swap':
            case 'drop':
                return 'replace';
            default:
                return 'accept';
        }
    }
};
exports.ExplainabilityService = ExplainabilityService;
exports.ExplainabilityService = ExplainabilityService = ExplainabilityService_1 = __decorate([
    (0, common_1.Injectable)()
], ExplainabilityService);
//# sourceMappingURL=explainability.service.js.map