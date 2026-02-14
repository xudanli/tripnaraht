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
var PlanBudgetEstimateBaselineSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanBudgetEstimateBaselineSkill = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
let PlanBudgetEstimateBaselineSkill = PlanBudgetEstimateBaselineSkill_1 = class PlanBudgetEstimateBaselineSkill {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(PlanBudgetEstimateBaselineSkill_1.name);
        this.metadata = {
            name: 'plan.budget.estimateBaseline',
            description: '快速给出预算拆分与区间估算（交通/住宿/餐饮/门票/体验/缓冲）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    extractJSON(response) {
        if (!response || typeof response !== 'string') {
            throw new Error('响应为空或格式不正确');
        }
        let cleaned = response.trim();
        cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
        cleaned = cleaned.replace(/\n?\s*```$/i, '');
        cleaned = cleaned.trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleaned = jsonMatch[0];
        }
        cleaned = cleaned.trim();
        try {
            return JSON.parse(cleaned);
        }
        catch (parseError) {
            this.logger.error(`JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`);
            this.logger.error(`清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`);
            throw parseError;
        }
    }
    async execute(input) {
        var _a, _b;
        this.logger.debug(`执行 plan.budget.estimateBaseline: planId=${input.planState.plan_id}`);
        try {
            const userPrompt = this.buildPrompt(input.planState, input.destination);
            const fullPrompt = `你是一位经验丰富的旅行预算规划师。你的任务是基于行程信息快速估算预算拆分。

预算类别：
1. transportation（交通）：包括跨城交通、市内交通
2. accommodation（住宿）：根据住宿档位估算
3. food（餐饮）：根据目的地和天数估算
4. tickets（门票）：景点门票、活动门票
5. experiences（体验）：特殊体验、向导等
6. buffer（缓冲）：应急和意外支出，通常占总预算的 10-15%

每个类别需要提供：
- min: 最低估算
- max: 最高估算
- estimated: 最可能值
- assumptions: 假设条件（例如：酒店档位、交通方式、旺季/淡季）

confidence: 估算的置信度（low/medium/high）

${userPrompt}`;
            try {
                const budgetBreakdownStr = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, fullPrompt, {
                    type: 'object',
                    properties: {
                        categories: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    category: {
                                        type: 'string',
                                        enum: ['transportation', 'accommodation', 'food', 'tickets', 'experiences', 'buffer'],
                                    },
                                    min: { type: 'number' },
                                    max: { type: 'number' },
                                    estimated: { type: 'number' },
                                    assumptions: { type: 'array', items: { type: 'string' } },
                                },
                                required: ['category', 'min', 'max', 'estimated', 'assumptions'],
                            },
                        },
                        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                        assumptions: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['categories', 'confidence', 'assumptions'],
                });
                const budgetBreakdown = this.extractJSON(budgetBreakdownStr);
                return {
                    budgetBreakdown,
                };
            }
            catch (llmError) {
                const isTimeout = ((_a = llmError.message) === null || _a === void 0 ? void 0 : _a.includes('超时')) || ((_b = llmError.message) === null || _b === void 0 ? void 0 : _b.includes('timeout'));
                if (isTimeout) {
                    this.logger.warn(`预算估算超时，使用默认预算拆分: ${llmError.message}`);
                }
                else {
                    this.logger.warn(`预算估算失败，使用默认预算拆分: ${llmError.message}`);
                }
                return this.getDefaultBudgetBreakdown(input.planState, input.destination);
            }
        }
        catch (error) {
            this.logger.error(`估算预算失败: ${error.message}`, error.stack);
            return this.getDefaultBudgetBreakdown(input.planState, input.destination);
        }
    }
    buildPrompt(planState, destination) {
        var _a, _b;
        const parts = [];
        parts.push(`## 行程信息`);
        parts.push(`目的地: ${destination.city || destination.country || '未指定'}`);
        parts.push(`天数: ${planState.constraints.time.days} 天`);
        if ((_a = planState.constraints.budget) === null || _a === void 0 ? void 0 : _a.total) {
            parts.push(`总预算: ${planState.constraints.budget.total} ${planState.constraints.budget.currency || 'CNY'}`);
        }
        if (planState.constraints.travelMode) {
            parts.push(`交通模式: ${planState.constraints.travelMode}`);
        }
        if ((_b = planState.constraints.accommodation) === null || _b === void 0 ? void 0 : _b.level) {
            parts.push(`住宿档位: ${planState.constraints.accommodation.level}`);
        }
        if (planState.mobility.transferSegments.length > 0) {
            parts.push(`跨城段数: ${planState.mobility.transferSegments.length}`);
        }
        parts.push(`\n## 要求`);
        parts.push(`请快速估算预算拆分，包括：交通、住宿、餐饮、门票、体验、缓冲`);
        parts.push(`每个类别提供 min/max/estimated 和 assumptions`);
        return parts.join('\n');
    }
    getDefaultBudgetBreakdown(planState, destination) {
        var _a;
        const days = planState.constraints.time.days;
        const totalBudget = ((_a = planState.constraints.budget) === null || _a === void 0 ? void 0 : _a.total) || 20000;
        const perDayBudget = totalBudget / days;
        return {
            budgetBreakdown: {
                categories: [
                    {
                        category: 'transportation',
                        min: perDayBudget * 0.15 * days,
                        max: perDayBudget * 0.25 * days,
                        estimated: perDayBudget * 0.20 * days,
                        assumptions: ['基于默认交通方式估算'],
                    },
                    {
                        category: 'accommodation',
                        min: perDayBudget * 0.25 * days,
                        max: perDayBudget * 0.40 * days,
                        estimated: perDayBudget * 0.30 * days,
                        assumptions: ['基于中等档位住宿估算'],
                    },
                    {
                        category: 'food',
                        min: perDayBudget * 0.20 * days,
                        max: perDayBudget * 0.30 * days,
                        estimated: perDayBudget * 0.25 * days,
                        assumptions: ['基于目的地消费水平估算'],
                    },
                    {
                        category: 'tickets',
                        min: perDayBudget * 0.10 * days,
                        max: perDayBudget * 0.20 * days,
                        estimated: perDayBudget * 0.15 * days,
                        assumptions: ['基于景点门票估算'],
                    },
                    {
                        category: 'experiences',
                        min: perDayBudget * 0.05 * days,
                        max: perDayBudget * 0.15 * days,
                        estimated: perDayBudget * 0.10 * days,
                        assumptions: ['基于可选体验项目估算'],
                    },
                    {
                        category: 'buffer',
                        min: totalBudget * 0.10,
                        max: totalBudget * 0.15,
                        estimated: totalBudget * 0.12,
                        assumptions: ['应急和意外支出'],
                    },
                ],
                confidence: 'low',
                assumptions: ['LLM 调用失败，使用默认预算拆分'],
            },
        };
    }
};
exports.PlanBudgetEstimateBaselineSkill = PlanBudgetEstimateBaselineSkill;
exports.PlanBudgetEstimateBaselineSkill = PlanBudgetEstimateBaselineSkill = PlanBudgetEstimateBaselineSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], PlanBudgetEstimateBaselineSkill);
//# sourceMappingURL=plan-budget-estimate-baseline.skill.js.map