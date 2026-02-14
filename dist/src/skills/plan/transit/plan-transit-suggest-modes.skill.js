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
var PlanTransitSuggestModesSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanTransitSuggestModesSkill = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
let PlanTransitSuggestModesSkill = PlanTransitSuggestModesSkill_1 = class PlanTransitSuggestModesSkill {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(PlanTransitSuggestModesSkill_1.name);
        this.metadata = {
            name: 'plan.transit.suggestModes',
            description: '为同一段 A→B 给出多模式交通对比（飞机/火车/大巴/自驾）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 plan.transit.suggestModes: ${input.from.city} → ${input.to.city}`);
        try {
            const userPrompt = this.buildPrompt(input);
            const fullPrompt = `你是一位经验丰富的交通规划师。你的任务是为同一段 A→B 给出多模式交通对比。

交通方式：
1. flight（飞机）：速度快但成本高，适合长距离
2. train（火车）：平衡速度和成本，适合中长距离
3. bus（大巴）：成本低但时间长，适合短距离或预算有限
4. self_drive（自驾）：灵活但需要租车，适合多目的地
5. other（其他）：轮渡、包车等

每个方式需要评估：
- time: 总耗时（分钟）
- cost: 预估成本
- reliability: 可靠性（high/medium/low）
- effort: 所需精力（low/medium/high）
- recommendation: 推荐理由或为什么不推荐

优先推荐平衡时间、成本和可靠性的方案。

${userPrompt}`;
            const resultStr = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, fullPrompt, {
                type: 'object',
                properties: {
                    modes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                mode: {
                                    type: 'string',
                                    enum: ['flight', 'train', 'bus', 'self_drive', 'other'],
                                },
                                time: { type: 'number' },
                                cost: { type: 'number' },
                                reliability: { type: 'string', enum: ['high', 'medium', 'low'] },
                                effort: { type: 'string', enum: ['low', 'medium', 'high'] },
                                recommendation: { type: 'string' },
                                whyRecommended: { type: 'string' },
                                whyNotRecommended: { type: 'string' },
                            },
                            required: ['mode', 'time', 'cost', 'reliability', 'effort', 'recommendation'],
                        },
                    },
                },
                required: ['modes'],
            });
            const result = JSON.parse(resultStr);
            return result;
        }
        catch (error) {
            this.logger.error(`建议交通方式失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildPrompt(input) {
        const parts = [];
        parts.push(`## 路线信息`);
        parts.push(`起点: ${input.from.city}`);
        parts.push(`终点: ${input.to.city}`);
        if (input.date) {
            parts.push(`日期: ${input.date}`);
        }
        if (input.from.coordinates && input.to.coordinates) {
            parts.push(`坐标: ${input.from.coordinates} → ${input.to.coordinates}`);
        }
        parts.push(`\n## 要求`);
        parts.push(`请为这段路线提供多种交通方式对比，包括：飞机、火车、大巴、自驾`);
        parts.push(`每个方式评估：时间、成本、可靠性、所需精力，并给出推荐理由`);
        return parts.join('\n');
    }
};
exports.PlanTransitSuggestModesSkill = PlanTransitSuggestModesSkill;
exports.PlanTransitSuggestModesSkill = PlanTransitSuggestModesSkill = PlanTransitSuggestModesSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], PlanTransitSuggestModesSkill);
//# sourceMappingURL=plan-transit-suggest-modes.skill.js.map