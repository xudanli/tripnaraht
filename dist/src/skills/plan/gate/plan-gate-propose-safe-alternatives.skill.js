"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PlanGateProposeSafeAlternativesSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanGateProposeSafeAlternativesSkill = void 0;
const common_1 = require("@nestjs/common");
const decision_neptune_repair_skill_1 = require("../../decision/decision-neptune-repair.skill");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
let PlanGateProposeSafeAlternativesSkill = PlanGateProposeSafeAlternativesSkill_1 = class PlanGateProposeSafeAlternativesSkill {
    constructor(llmService, neptuneRepair) {
        this.llmService = llmService;
        this.neptuneRepair = neptuneRepair;
        this.logger = new common_1.Logger(PlanGateProposeSafeAlternativesSkill_1.name);
        this.metadata = {
            name: 'plan.gate.proposeSafeAlternatives',
            description: '为被拒绝或需确认的方案生成安全替代方案（Neptune 风格）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        var _a;
        this.logger.debug(`执行 plan.gate.proposeSafeAlternatives: planId=${input.planState.plan_id}, issue=${input.issue}`);
        try {
            if (this.neptuneRepair && input.planState.world) {
                try {
                    const neptuneResult = await this.neptuneRepair.execute({
                        world: input.planState.world,
                        brokenPlan: input.planState.itinerary,
                        issue: input.issue,
                    });
                    if (neptuneResult.repairedPlan) {
                        return {
                            alternatives: [{
                                    type: 'alternative_route',
                                    description: 'Neptune 修复方案',
                                    evidenceComparison: {
                                        whySafer: ((_a = neptuneResult.replacements) === null || _a === void 0 ? void 0 : _a.map(r => r.explanation || '').join(', ')) || '已修复安全问题',
                                        whyMoreExecutable: '保持路线哲学的前提下替换了不可用路段',
                                    },
                                }],
                        };
                    }
                }
                catch (error) {
                    this.logger.warn(`Neptune Repair 失败，使用 LLM 生成替代方案: ${error}`);
                }
            }
            const userPrompt = this.buildPrompt(input.planState, input.issue);
            const fullPrompt = `你是一位经验丰富的空间修复师（Neptune）。你的任务是为被拒绝或需确认的方案生成安全替代方案。

替代方案类型：
1. alternative_route（替代路线）：选择更安全的路线骨架
2. alternative_segment（替代段）：替换高风险段
3. alternative_timing（替代时间窗）：调整时间避开风险

每个替代方案必须包含：
- type: 替代类型
- description: 具体替代方案描述
- evidenceComparison: 为什么更安全、为什么更可执行

优先推荐保持路线哲学的方案。

${userPrompt}`;
            const resultStr = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, fullPrompt, {
                type: 'object',
                properties: {
                    alternatives: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['alternative_route', 'alternative_segment', 'alternative_timing'],
                                },
                                description: { type: 'string' },
                                evidenceComparison: {
                                    type: 'object',
                                    properties: {
                                        whySafer: { type: 'string' },
                                        whyMoreExecutable: { type: 'string' },
                                    },
                                    required: ['whySafer', 'whyMoreExecutable'],
                                },
                            },
                            required: ['type', 'description', 'evidenceComparison'],
                        },
                    },
                },
                required: ['alternatives'],
            });
            const result = JSON.parse(resultStr);
            return result;
        }
        catch (error) {
            this.logger.error(`生成替代方案失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildPrompt(planState, issue) {
        const parts = [];
        parts.push(`## 当前方案问题`);
        parts.push(issue);
        parts.push(`\n## 当前方案信息`);
        parts.push(`天数: ${planState.constraints.time.days} 天`);
        if (planState.gate.reasons.length > 0) {
            parts.push(`\n## 门控原因`);
            planState.gate.reasons.forEach(reason => {
                parts.push(`- ${reason}`);
            });
        }
        if (planState.mobility.transferSegments.length > 0) {
            parts.push(`\n## 跨城段`);
            planState.mobility.transferSegments.forEach(seg => {
                parts.push(`- ${seg.from.city} → ${seg.to.city}: ${seg.feasibility}`);
                if (seg.riskFlags.length > 0) {
                    seg.riskFlags.forEach(flag => {
                        parts.push(`  - 风险: ${flag.type} (${flag.severity}) - ${flag.description}`);
                    });
                }
            });
        }
        parts.push(`\n## 要求`);
        parts.push(`请生成安全替代方案，说明为什么更安全、为什么更可执行`);
        return parts.join('\n');
    }
};
exports.PlanGateProposeSafeAlternativesSkill = PlanGateProposeSafeAlternativesSkill;
exports.PlanGateProposeSafeAlternativesSkill = PlanGateProposeSafeAlternativesSkill = PlanGateProposeSafeAlternativesSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        decision_neptune_repair_skill_1.DecisionNeptuneRepairSkill])
], PlanGateProposeSafeAlternativesSkill);
//# sourceMappingURL=plan-gate-propose-safe-alternatives.skill.js.map