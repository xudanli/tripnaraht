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
var DetailExplainDecisionSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DetailExplainDecisionSkill = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
let DetailExplainDecisionSkill = DetailExplainDecisionSkill_1 = class DetailExplainDecisionSkill {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(DetailExplainDecisionSkill_1.name);
        this.metadata = {
            name: 'detail.explainDecision',
            description: '解释决策（基于决策日志），生成面向用户的解释',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 detail.explainDecision: tripId=${input.tripId}, decisionId=${input.decisionId || 'all'}`);
        try {
            const decisionLogs = input.decisionLogs || [];
            const explanations = [];
            for (const log of decisionLogs) {
                const userPrompt = this.buildPrompt(log);
                const fullPrompt = `你是一位贴心的旅行管家。你的任务是基于决策日志，生成面向用户的决策解释。

解释原则：
1. 使用第一人称（"我"代表对应的人格）
2. 简洁明了，避免技术术语
3. 说明原因和影响
4. 引用相关证据

${userPrompt}`;
                const explanationResult = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.OPENAI, fullPrompt, {
                    type: 'object',
                    properties: {
                        decisionId: { type: 'string' },
                        decisionType: { type: 'string' },
                        explanation: { type: 'string' },
                        evidence: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    source: { type: 'string' },
                                    excerpt: { type: 'string' },
                                    relevance: { type: 'string' },
                                },
                            },
                        },
                        persona: { type: 'string', enum: ['ABU', 'DR_DRE', 'NEPTUNE'] },
                        timestamp: { type: 'string' },
                    },
                    required: ['decisionId', 'decisionType', 'explanation', 'evidence', 'persona', 'timestamp'],
                });
                try {
                    const parsed = JSON.parse(explanationResult);
                    explanations.push(parsed);
                }
                catch (e) {
                    this.logger.warn(`Failed to parse explanation result: ${explanationResult}`);
                }
            }
            return {
                explanations,
            };
        }
        catch (error) {
            this.logger.error(`解释决策失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildPrompt(log) {
        const parts = [];
        parts.push(`## 决策日志`);
        parts.push(JSON.stringify(log, null, 2));
        parts.push(`\n## 要求`);
        parts.push(`请生成面向用户的决策解释，使用第一人称，说明原因和影响`);
        return parts.join('\n');
    }
};
exports.DetailExplainDecisionSkill = DetailExplainDecisionSkill;
exports.DetailExplainDecisionSkill = DetailExplainDecisionSkill = DetailExplainDecisionSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], DetailExplainDecisionSkill);
//# sourceMappingURL=detail-explain-decision.skill.js.map