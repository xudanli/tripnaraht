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
var PlanBudgetProposeTradeoffsSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanBudgetProposeTradeoffsSkill = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
let PlanBudgetProposeTradeoffsSkill = PlanBudgetProposeTradeoffsSkill_1 = class PlanBudgetProposeTradeoffsSkill {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(PlanBudgetProposeTradeoffsSkill_1.name);
        this.metadata = {
            name: 'plan.budget.proposeTradeoffs',
            description: '给出"最小牺牲"的降本方案，不破坏路线哲学',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['planState', 'targetSavings'],
                typeChecks: {
                    targetSavings: {
                        type: 'number',
                        min: 0,
                    },
                },
            },
        };
    }
    async execute(input) {
        this.logger.debug(`执行 plan.budget.proposeTradeoffs: planId=${input.planState.plan_id}, targetSavings=${input.targetSavings}`);
        try {
            const userPrompt = this.buildPrompt(input.planState, input.targetSavings);
            const fullPrompt = `你是一位经验丰富的旅行预算规划师。你的任务是在不破坏路线哲学的前提下，给出"最小牺牲"的降本方案。

降本方案类型：
1. 换城市：选择消费水平更低的替代城市
2. 减少移动日：合并行程，减少跨城交通
3. 换交通方式：选择更经济的交通方式（如大巴替代火车）
4. 降低住宿档位：从豪华降为中等，或从中等降为经济
5. 减少付费体验：减少或替换高成本的体验项目

每个方案必须包含：
- action: 具体行动
- savings: 能节省的金额
- sacrifice: 牺牲什么（体验、便利性等）
- impact: 对节奏/体验/风险的影响

优先推荐对路线哲学影响最小的方案。

${userPrompt}`;
            const resultStr = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, fullPrompt, {
                type: 'object',
                properties: {
                    options: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                action: { type: 'string' },
                                savings: { type: 'number' },
                                sacrifice: { type: 'string' },
                                impact: {
                                    type: 'object',
                                    properties: {
                                        pace: { type: 'string' },
                                        experience: { type: 'string' },
                                        risk: { type: 'string' },
                                    },
                                },
                            },
                            required: ['action', 'savings', 'sacrifice', 'impact'],
                        },
                    },
                },
                required: ['options'],
            });
            const result = JSON.parse(resultStr);
            return result;
        }
        catch (error) {
            this.logger.error(`生成降本方案失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildPrompt(planState, targetSavings) {
        var _a, _b, _c, _d, _e;
        const parts = [];
        parts.push(`## 当前计划`);
        parts.push(`目的地: ${planState.constraints.time.days} 天行程`);
        parts.push(`总预算: ${((_a = planState.constraints.budget) === null || _a === void 0 ? void 0 : _a.total) || '未指定'} ${((_b = planState.constraints.budget) === null || _b === void 0 ? void 0 : _b.currency) || 'CNY'}`);
        parts.push(`需要节省: ${targetSavings} ${((_c = planState.constraints.budget) === null || _c === void 0 ? void 0 : _c.currency) || 'CNY'}`);
        if (planState.budget.breakdown) {
            parts.push(`\n## 当前预算拆分`);
            planState.budget.breakdown.categories.forEach(cat => {
                parts.push(`${cat.category}: ${cat.estimated} (${cat.min}-${cat.max})`);
            });
        }
        if (planState.mobility.transferSegments.length > 0) {
            parts.push(`\n跨城段数: ${planState.mobility.transferSegments.length}`);
        }
        if ((_d = planState.constraints.accommodation) === null || _d === void 0 ? void 0 : _d.level) {
            parts.push(`住宿档位: ${planState.constraints.accommodation.level}`);
        }
        parts.push(`\n## 要求`);
        parts.push(`请给出"最小牺牲"的降本方案，目标节省 ${targetSavings} ${((_e = planState.constraints.budget) === null || _e === void 0 ? void 0 : _e.currency) || 'CNY'}`);
        parts.push(`每个方案必须说明：能省多少钱、牺牲什么、对节奏/体验/风险的影响`);
        return parts.join('\n');
    }
};
exports.PlanBudgetProposeTradeoffsSkill = PlanBudgetProposeTradeoffsSkill;
exports.PlanBudgetProposeTradeoffsSkill = PlanBudgetProposeTradeoffsSkill = PlanBudgetProposeTradeoffsSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], PlanBudgetProposeTradeoffsSkill);
//# sourceMappingURL=plan-budget-propose-tradeoffs.skill.js.map