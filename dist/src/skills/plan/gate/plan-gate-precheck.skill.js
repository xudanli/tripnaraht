"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlanGatePrecheckSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanGatePrecheckSkill = void 0;
const common_1 = require("@nestjs/common");
let PlanGatePrecheckSkill = PlanGatePrecheckSkill_1 = class PlanGatePrecheckSkill {
    constructor() {
        this.logger = new common_1.Logger(PlanGatePrecheckSkill_1.name);
        this.metadata = {
            name: 'plan.gate.precheck',
            description: '快速门控检查（数据足够时做硬判断，数据不足时标记需确认）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 plan.gate.precheck: planId=${input.planState.plan_id}`);
        try {
            const reasons = [];
            const missingEvidence = [];
            let status = 'ALLOW';
            if (!input.planState.constraints.time.days || input.planState.constraints.time.days <= 0) {
                status = 'REJECT';
                reasons.push('天数无效或未指定');
            }
            const infeasibleSegments = input.planState.mobility.transferSegments.filter(seg => seg.feasibility === 'infeasible');
            if (infeasibleSegments.length > 0) {
                status = 'REJECT';
                reasons.push(`${infeasibleSegments.length} 段不可达`);
            }
            const highRiskSegments = input.planState.mobility.transferSegments.filter(seg => seg.riskFlags.some(flag => flag.severity === 'high'));
            if (highRiskSegments.length > 0) {
                status = 'NEED_CONFIRM';
                reasons.push(`${highRiskSegments.length} 段存在高风险`);
            }
            if (input.planState.budget.overrun && input.planState.budget.overrun.overrunAmount > 0) {
                status = 'NEED_CONFIRM';
                reasons.push(`预算超支 ${input.planState.budget.overrun.overrunAmount}`);
            }
            if (input.planState.evidence_refs.length === 0) {
                missingEvidence.push('缺少证据引用');
            }
            if (!input.planState.world) {
                missingEvidence.push('缺少世界模型上下文');
            }
            if (missingEvidence.length > 0 && status === 'ALLOW') {
                status = 'NEED_CONFIRM';
            }
            return {
                gateStatus: {
                    status,
                    reasons,
                    missingEvidence,
                },
            };
        }
        catch (error) {
            this.logger.error(`预检查失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.PlanGatePrecheckSkill = PlanGatePrecheckSkill;
exports.PlanGatePrecheckSkill = PlanGatePrecheckSkill = PlanGatePrecheckSkill_1 = __decorate([
    (0, common_1.Injectable)()
], PlanGatePrecheckSkill);
//# sourceMappingURL=plan-gate-precheck.skill.js.map