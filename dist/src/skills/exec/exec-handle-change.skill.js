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
var ExecHandleChangeSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecHandleChangeSkill = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
let ExecHandleChangeSkill = ExecHandleChangeSkill_1 = class ExecHandleChangeSkill {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(ExecHandleChangeSkill_1.name);
        this.metadata = {
            name: 'exec.handleChange',
            description: '处理执行期间的变更（时间、地点、活动取消、交通延误等），生成调整方案',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 exec.handleChange: tripId=${input.tripId}, changeType=${input.changeType}`);
        try {
            const userPrompt = this.buildPrompt(input);
            const fullPrompt = `你是一位贴心的旅行管家。你的任务是在执行期间处理各种变更，并生成调整方案。

变更处理原则：
1. 最小化对整体行程的影响
2. 保持路线哲学和核心体验
3. 提供多个替代方案供用户选择
4. 明确说明每个方案的影响

输出必须包含：
- 调整后的计划
- 影响分析（时间、预算、体验、风险）
- 替代方案（如果有）
- 建议行动
- 是否需要用户确认

${userPrompt}`;
            const resultStr = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.OPENAI, fullPrompt, {
                type: 'object',
                properties: {
                    changeId: { type: 'string' },
                    changeType: {
                        type: 'string',
                        enum: ['schedule_change', 'location_change', 'activity_cancelled', 'transport_delay', 'weather_impact', 'budget_overrun', 'user_request'],
                    },
                    originalPlan: { type: 'object' },
                    adjustedPlan: { type: 'object' },
                    impact: {
                        type: 'object',
                        properties: {
                            schedule: { type: 'string' },
                            budget: { type: 'string' },
                            experience: { type: 'string' },
                            risk: { type: 'string' },
                        },
                    },
                    alternatives: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                option: { type: 'string' },
                                description: { type: 'string' },
                                impact: { type: 'string' },
                            },
                        },
                    },
                    recommendations: { type: 'array', items: { type: 'string' } },
                    requiresConfirmation: { type: 'boolean' },
                },
                required: ['changeId', 'changeType', 'originalPlan', 'adjustedPlan', 'impact', 'recommendations', 'requiresConfirmation'],
            });
            const result = JSON.parse(resultStr);
            return {
                result,
            };
        }
        catch (error) {
            this.logger.error(`处理变更失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildPrompt(input) {
        const parts = [];
        parts.push(`## 变更信息`);
        parts.push(`变更类型: ${input.changeType}`);
        parts.push(`变更详情: ${JSON.stringify(input.changeDetails, null, 2)}`);
        if (input.currentPlan) {
            parts.push(`\n## 当前计划`);
            parts.push(JSON.stringify(input.currentPlan, null, 2));
        }
        parts.push(`\n## 要求`);
        parts.push(`请处理这个变更，生成调整方案，说明影响，并提供替代方案（如果有）`);
        return parts.join('\n');
    }
};
exports.ExecHandleChangeSkill = ExecHandleChangeSkill;
exports.ExecHandleChangeSkill = ExecHandleChangeSkill = ExecHandleChangeSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], ExecHandleChangeSkill);
//# sourceMappingURL=exec-handle-change.skill.js.map