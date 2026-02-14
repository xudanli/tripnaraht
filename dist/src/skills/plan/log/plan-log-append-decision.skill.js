"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlanLogAppendDecisionSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanLogAppendDecisionSkill = void 0;
const common_1 = require("@nestjs/common");
let PlanLogAppendDecisionSkill = PlanLogAppendDecisionSkill_1 = class PlanLogAppendDecisionSkill {
    constructor() {
        this.logger = new common_1.Logger(PlanLogAppendDecisionSkill_1.name);
        this.metadata = {
            name: 'plan.log.appendDecision',
            description: '把每一次结论写成可追溯日志',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 plan.log.appendDecision: decisionId=${input.decision_id}`);
        try {
            const decisionLogRef = {
                decision_id: input.decision_id,
                diff: input.diff,
                evidence_refs: input.evidence_refs,
                rule_version: input.rule_version,
                timestamp: new Date().toISOString(),
            };
            this.logger.debug(`决策日志已记录: ${input.decision_id}`);
            return {
                decisionLogRef,
            };
        }
        catch (error) {
            this.logger.error(`记录决策日志失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.PlanLogAppendDecisionSkill = PlanLogAppendDecisionSkill;
exports.PlanLogAppendDecisionSkill = PlanLogAppendDecisionSkill = PlanLogAppendDecisionSkill_1 = __decorate([
    (0, common_1.Injectable)()
], PlanLogAppendDecisionSkill);
//# sourceMappingURL=plan-log-append-decision.skill.js.map