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
var ExecFallbackSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecFallbackSkill = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const crypto_1 = require("crypto");
let ExecFallbackSkill = ExecFallbackSkill_1 = class ExecFallbackSkill {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(ExecFallbackSkill_1.name);
        this.metadata = {
            name: 'exec.fallback',
            description: '生成兜底方案（当原计划无法执行时），保持路线哲学',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 exec.fallback: tripId=${input.tripId}, reason=${input.triggerReason}`);
        try {
            const userPrompt = this.buildPrompt(input);
            const fullPrompt = `你是一位贴心的旅行管家。你的任务是在原计划无法执行时，生成多个兜底方案。

兜底原则：
1. 保持路线哲学和核心体验
2. 最小化对整体行程的影响
3. 提供可行的替代方案
4. 明确说明影响和风险

请生成至少3个不同类型的修复方案：
1. minimal（最小改动）：尽可能保持原计划，只做必要调整
2. experience（体验优先）：优先保证核心体验，可能调整时间或顺序
3. safety（安全优先）：优先保证安全和可行性，可能替换地点或路线

每个方案必须包含：
- id: 方案ID
- type: 方案类型（minimal/experience/safety）
- title: 方案标题（如"最小改动"、"体验优先"、"安全优先"）
- description: 方案描述
- changes: 变更详情数组（每个变更包含 itemId, action, newTime/newPlace）
- impact: 影响评估（arrivalTime, missingPlaces, riskChange）
- recommended: 是否推荐（至少一个方案为true）

${userPrompt}`;
            const resultStr = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.OPENAI, fullPrompt, {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    triggerReason: { type: 'string' },
                    originalPlan: { type: 'object' },
                    explanation: { type: 'string' },
                    impact: {
                        type: 'object',
                        properties: {
                            schedule: { type: 'string' },
                            budget: { type: 'string' },
                            experience: { type: 'string' },
                        },
                    },
                    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                    solutions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                type: { type: 'string', enum: ['minimal', 'experience', 'safety'] },
                                title: { type: 'string' },
                                description: { type: 'string' },
                                changes: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            itemId: { type: 'string' },
                                            action: { type: 'string', enum: ['modify', 'remove', 'add'] },
                                            newTime: { type: 'string' },
                                            newPlace: { type: 'object' },
                                        },
                                    },
                                },
                                impact: {
                                    type: 'object',
                                    properties: {
                                        arrivalTime: { type: 'string' },
                                        missingPlaces: { type: 'number' },
                                        riskChange: { type: 'string', enum: ['low', 'medium', 'high'] },
                                    },
                                },
                                recommended: { type: 'boolean' },
                            },
                            required: ['id', 'type', 'title', 'description', 'changes', 'impact'],
                        },
                        minItems: 1,
                    },
                },
                required: ['id', 'triggerReason', 'originalPlan', 'explanation', 'impact', 'confidence', 'solutions'],
            });
            const result = JSON.parse(resultStr);
            if (result.solutions && result.solutions.length > 0) {
                const hasRecommended = result.solutions.some((s) => s.recommended === true);
                if (!hasRecommended) {
                    result.solutions[0].recommended = true;
                }
            }
            const fallbackPlan = {
                id: result.id || (0, crypto_1.randomUUID)(),
                triggerReason: result.triggerReason,
                originalPlan: result.originalPlan,
                solutions: result.solutions || [],
                explanation: result.explanation,
                impact: result.impact,
                confidence: result.confidence,
            };
            return {
                fallbackPlan,
            };
        }
        catch (error) {
            this.logger.error(`生成兜底方案失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildPrompt(input) {
        const parts = [];
        parts.push(`## 触发原因`);
        parts.push(input.triggerReason);
        parts.push(`\n## 原计划`);
        parts.push(JSON.stringify(input.originalPlan, null, 2));
        if (input.currentState) {
            parts.push(`\n## 当前状态`);
            parts.push(JSON.stringify(input.currentState, null, 2));
        }
        parts.push(`\n## 要求`);
        parts.push(`请生成兜底方案，保持路线哲学，最小化影响`);
        return parts.join('\n');
    }
};
exports.ExecFallbackSkill = ExecFallbackSkill;
exports.ExecFallbackSkill = ExecFallbackSkill = ExecFallbackSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], ExecFallbackSkill);
//# sourceMappingURL=exec-fallback.skill.js.map