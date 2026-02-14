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
var PlanPaceAdjustScheduleSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanPaceAdjustScheduleSkill = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
let PlanPaceAdjustScheduleSkill = PlanPaceAdjustScheduleSkill_1 = class PlanPaceAdjustScheduleSkill {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(PlanPaceAdjustScheduleSkill_1.name);
        this.metadata = {
            name: 'plan.pace.adjustSchedule',
            description: '根据用户反馈调整节奏（太累/太赶），不破坏主线',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 plan.pace.adjustSchedule: planId=${input.planState.plan_id}, feedback=${input.userFeedback}`);
        try {
            const userPrompt = this.buildPrompt(input.planState, input.userFeedback);
            const fullPrompt = `你是一位经验丰富的节奏规划师（Dr.Dre）。你的任务是根据用户反馈调整行程节奏，但不破坏主线。

调整策略：
- too_tired（太累）：减少每日活动、插入休息日、延长停留时间
- too_rushed（太赶）：合并或删除次要活动、减少移动日
- too_relaxed（太松弛）：增加活动密度、优化时间利用

调整原则：
1. 保持路线哲学和核心锚点不变
2. 优先调整次要活动
3. 最小化对预算和可达性的影响
4. 明确说明每个变更的影响

${userPrompt}`;
            const resultStr = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, fullPrompt, {
                type: 'object',
                properties: {
                    adjustedTimeline: {
                        type: 'object',
                        properties: {
                            days: { type: 'number' },
                            changes: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        day: { type: 'number' },
                                        action: {
                                            type: 'string',
                                            enum: ['delete', 'replace', 'move', 'add_rest'],
                                        },
                                        description: { type: 'string' },
                                    },
                                    required: ['day', 'action', 'description'],
                                },
                            },
                        },
                        required: ['days', 'changes'],
                    },
                    diff: {
                        type: 'object',
                        properties: {
                            deleted: { type: 'array', items: { type: 'string' } },
                            replaced: { type: 'array', items: { type: 'string' } },
                            moved: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        from: { type: 'number' },
                                        to: { type: 'number' },
                                    },
                                },
                            },
                            added: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['deleted', 'replaced', 'moved', 'added'],
                    },
                    impact: {
                        type: 'object',
                        properties: {
                            experience: { type: 'string' },
                            budget: { type: 'string' },
                            feasibility: { type: 'string' },
                        },
                    },
                },
                required: ['adjustedTimeline', 'diff', 'impact'],
            });
            const result = JSON.parse(resultStr);
            return result;
        }
        catch (error) {
            this.logger.error(`调整节奏失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildPrompt(planState, feedback) {
        const parts = [];
        parts.push(`## 当前计划`);
        parts.push(`天数: ${planState.constraints.time.days} 天`);
        parts.push(`用户反馈: ${feedback === 'too_tired' ? '太累' : feedback === 'too_rushed' ? '太赶' : '太松弛'}`);
        if (planState.pace.fatigueScore) {
            parts.push(`当前疲劳评分: ${planState.pace.fatigueScore.paceScore}/100`);
            if (planState.pace.fatigueScore.fatigueDrivers.length > 0) {
                parts.push(`疲劳驱动因素:`);
                planState.pace.fatigueScore.fatigueDrivers.forEach(driver => {
                    parts.push(`- ${driver.type}: ${driver.description} (严重度: ${driver.severity})`);
                });
            }
        }
        if (planState.mobility.transferSegments.length > 0) {
            parts.push(`跨城段数: ${planState.mobility.transferSegments.length}`);
        }
        parts.push(`\n## 要求`);
        parts.push(`请根据用户反馈调整节奏，但不破坏主线`);
        parts.push(`说明：删除了什么、替换了什么、移动了什么、新增了什么`);
        parts.push(`评估对体验/预算/可达性的影响`);
        return parts.join('\n');
    }
};
exports.PlanPaceAdjustScheduleSkill = PlanPaceAdjustScheduleSkill;
exports.PlanPaceAdjustScheduleSkill = PlanPaceAdjustScheduleSkill = PlanPaceAdjustScheduleSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], PlanPaceAdjustScheduleSkill);
//# sourceMappingURL=plan-pace-adjust-schedule.skill.js.map