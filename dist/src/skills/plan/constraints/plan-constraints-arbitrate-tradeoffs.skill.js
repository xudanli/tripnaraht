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
var PlanConstraintsArbitrateTradeoffsSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanConstraintsArbitrateTradeoffsSkill = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
let PlanConstraintsArbitrateTradeoffsSkill = PlanConstraintsArbitrateTradeoffsSkill_1 = class PlanConstraintsArbitrateTradeoffsSkill {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(PlanConstraintsArbitrateTradeoffsSkill_1.name);
        this.metadata = {
            name: 'plan.constraints.arbitrateTradeoffs',
            description: '给"最小牺牲"仲裁结果，并要求用户确认关键取舍',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 plan.constraints.arbitrateTradeoffs: planId=${input.planState.plan_id}, conflicts=${input.conflicts.conflicts.length}`);
        try {
            const userPrompt = this.buildPrompt(input.planState, input.conflicts);
            const fullPrompt = `你是一位经验丰富的约束仲裁师。你的任务是在多个约束冲突中给出"最小牺牲"的仲裁结果。

仲裁原则：
1. 优先解决 critical 和 high 严重度的冲突
2. 选择对路线哲学影响最小的方案
3. 如果涉及关键取舍，必须标记需要用户确认
4. 提供多个备选方案供用户选择

每个方案必须包含：
- action: 具体行动
- description: 详细描述
- impact: 对整体计划的影响

${userPrompt}`;
            const resultStr = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, fullPrompt, {
                type: 'object',
                properties: {
                    recommendedResolution: {
                        type: 'object',
                        properties: {
                            action: { type: 'string' },
                            description: { type: 'string' },
                            impact: { type: 'string' },
                        },
                        required: ['action', 'description', 'impact'],
                    },
                    options: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                action: { type: 'string' },
                                description: { type: 'string' },
                                impact: { type: 'string' },
                            },
                            required: ['action', 'description', 'impact'],
                        },
                    },
                    userConfirmationRequired: { type: 'boolean' },
                },
                required: ['recommendedResolution', 'options', 'userConfirmationRequired'],
            });
            const result = JSON.parse(resultStr);
            return result;
        }
        catch (error) {
            this.logger.error(`仲裁取舍失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildPrompt(planState, conflicts) {
        const parts = [];
        parts.push(`## 当前计划`);
        parts.push(`天数: ${planState.constraints.time.days} 天`);
        parts.push(`\n## 检测到的冲突`);
        conflicts.conflicts.forEach(conflict => {
            parts.push(`- ${conflict.type} (${conflict.severity}): ${conflict.description}`);
            if (conflict.affectedDays) {
                parts.push(`  影响天数: ${conflict.affectedDays.join(', ')}`);
            }
            if (conflict.affectedSegments) {
                parts.push(`  影响段: ${conflict.affectedSegments.join(', ')}`);
            }
        });
        parts.push(`\n## 要求`);
        parts.push(`请给出"最小牺牲"的仲裁结果，优先解决 critical 和 high 严重度的冲突`);
        parts.push(`如果涉及关键取舍，标记需要用户确认`);
        return parts.join('\n');
    }
};
exports.PlanConstraintsArbitrateTradeoffsSkill = PlanConstraintsArbitrateTradeoffsSkill;
exports.PlanConstraintsArbitrateTradeoffsSkill = PlanConstraintsArbitrateTradeoffsSkill = PlanConstraintsArbitrateTradeoffsSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], PlanConstraintsArbitrateTradeoffsSkill);
//# sourceMappingURL=plan-constraints-arbitrate-tradeoffs.skill.js.map