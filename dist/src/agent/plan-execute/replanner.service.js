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
var ReplannerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplannerService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
function loadReplannerPromptFromDocs() {
    try {
        const docsPath = (0, path_1.join)(process.cwd(), 'docs', 'SKILLS.md');
        if (!require('fs').existsSync(docsPath)) {
            throw new Error(`文件不存在: ${docsPath}`);
        }
        const content = (0, fs_1.readFileSync)(docsPath, 'utf-8');
        const replannerSectionStart = content.indexOf('### 2. 🔄 The Replanner');
        if (replannerSectionStart === -1) {
            throw new Error('找不到 Replanner 章节');
        }
        const executorSectionStart = content.indexOf('### 3. 🛠️ The Executor', replannerSectionStart);
        const replannerSection = content.substring(replannerSectionStart, executorSectionStart);
        const codeBlockMatch = replannerSection.match(/```markdown\n([\s\S]*?)\n```/);
        if (!codeBlockMatch || !codeBlockMatch[1]) {
            throw new Error('找不到 Replanner Prompt 代码块');
        }
        return codeBlockMatch[1].trim();
    }
    catch (error) {
        const logger = new common_1.Logger('ReplannerPromptLoader');
        logger.warn(`无法从 docs/SKILLS.md 加载 Replanner Prompt: ${error.message}，使用降级方案`);
        return `You are the Strategic Replanner for TripNARA. Update the execution plan based on results.`;
    }
}
let cachedReplannerPrompt = null;
let ReplannerService = ReplannerService_1 = class ReplannerService {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(ReplannerService_1.name);
    }
    async createInitialPlan(userGoal, context) {
        this.logger.debug(`创建初始计划: ${userGoal}`);
        if (!this.llmService) {
            return this.createSimplePlan(userGoal);
        }
        const prompt = `Create an initial execution plan to achieve the following goal:

**User Goal**: ${userGoal}

**Context**:
- Current State: ${context.currentState}
- Completed Steps: ${context.completedSteps.join(', ') || 'None'}
- Constraints: ${JSON.stringify(context.constraints, null, 2)}

Generate a plan with 3-8 steps. Each step should:
1. Have a unique ID (e.g., "step-1", "step-2")
2. Have a clear description of what action to take
3. Specify dependencies (steps that must complete first)
4. Have status "pending"

Return ONLY a JSON array of PlanStep objects:
[
  { "id": "step-1", "description": "...", "status": "pending", "dependencies": [] },
  { "id": "step-2", "description": "...", "status": "pending", "dependencies": ["step-1"] }
]`;
        try {
            if (!cachedReplannerPrompt) {
                cachedReplannerPrompt = loadReplannerPromptFromDocs();
            }
            const systemPrompt = cachedReplannerPrompt
                .replace(/\{\{USER_GOAL\}\}/g, userGoal)
                .replace(/\{\{CURRENT_PLAN_JSON\}\}/g, '[]')
                .replace(/\{\{EXECUTION_SUMMARY\}\}/g, '初始计划生成')
                .replace(/\{\{LAST_ERROR\}\}/g, '');
            const fullPrompt = `${systemPrompt}\n\n## User Request\n\n${prompt}\n\n## Response\n\n请返回 JSON 格式的计划数组。`;
            const schema = {
                type: 'object',
                properties: {
                    plan: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                description: { type: 'string' },
                                status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'] },
                                dependencies: { type: 'array', items: { type: 'string' } },
                                result: { type: 'string' },
                                error: { type: 'string' },
                            },
                            required: ['id', 'description', 'status', 'dependencies'],
                        },
                    },
                },
                required: ['plan'],
            };
            const response = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.OPENAI, fullPrompt, schema);
            const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleanedResponse);
            const plan = Array.isArray(parsed) ? parsed : parsed.plan || [];
            return this.normalizePlan(plan);
        }
        catch (error) {
            this.logger.error(`创建初始计划失败: ${error.message}`, error.stack);
            return this.createSimplePlan(userGoal);
        }
    }
    async replan(userGoal, currentPlan, memory, provider) {
        this.logger.debug(`重规划: ${currentPlan.length} 个步骤`);
        if (!this.llmService) {
            return { hasUpdates: false, newPlan: currentPlan };
        }
        const recentContext = currentPlan
            .filter(s => s.status === 'completed' || s.status === 'failed')
            .map(s => {
            const memoryData = memory[s.id];
            const result = s.status === 'completed'
                ? `✅ ${s.result || '完成'}`
                : `❌ ${s.error || s.result || '失败'}`;
            return `Step [${s.id}] (${s.status}): ${s.description}\n  Result: ${result}`;
        })
            .join('\n\n');
        const userPrompt = JSON.stringify({
            userGoal,
            currentPlan: currentPlan.map(s => ({
                id: s.id,
                description: s.description,
                status: s.status,
                dependencies: s.dependencies,
                result: s.result,
                error: s.error,
            })),
            executionSummary: recentContext || 'No completed steps yet.',
        }, null, 2);
        try {
            if (!cachedReplannerPrompt) {
                cachedReplannerPrompt = loadReplannerPromptFromDocs();
            }
            const systemPrompt = cachedReplannerPrompt
                .replace(/\{\{USER_GOAL\}\}/g, userGoal)
                .replace(/\{\{CURRENT_PLAN_JSON\}\}/g, JSON.stringify(currentPlan.map(s => ({
                id: s.id,
                description: s.description,
                status: s.status,
                dependencies: s.dependencies,
                result: s.result,
                error: s.error,
            })), null, 2))
                .replace(/\{\{EXECUTION_SUMMARY\}\}/g, recentContext || 'No completed steps yet.')
                .replace(/\{\{LAST_ERROR\}\}/g, '');
            const fullPrompt = systemPrompt;
            const schema = {
                type: 'object',
                properties: {
                    reasoning: { type: 'string' },
                    plan: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                description: { type: 'string' },
                                toolCategory: { type: 'string' },
                                status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed', 'skipped'] },
                                dependencies: { type: 'array', items: { type: 'string' } },
                                result: { type: 'string' },
                                error: { type: 'string' },
                                metadata: { type: 'object' },
                            },
                            required: ['id', 'description', 'status', 'dependencies'],
                        },
                    },
                    changes: {
                        type: 'object',
                        properties: {
                            added: { type: 'number' },
                            removed: { type: 'number' },
                            modified: { type: 'number' },
                        },
                    },
                },
                required: ['plan'],
            };
            const llmProvider = provider || llm_request_dto_1.LlmProvider.OPENAI;
            const response = await this.llmService.callLlmWithSchema(llmProvider, fullPrompt, schema);
            const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const result = JSON.parse(cleanedResponse);
            const newPlan = result.plan || result;
            const normalizedPlan = this.normalizePlan(newPlan);
            const calculatedChanges = this.calculateChanges(currentPlan, normalizedPlan);
            const changes = result.changes || calculatedChanges;
            const hasUpdates = changes.added > 0 || changes.removed > 0 || changes.modified > 0;
            if (hasUpdates) {
                this.logger.log(`重规划完成: 新增 ${changes.added}, 删除 ${changes.removed}, 修改 ${changes.modified}`);
            }
            return {
                hasUpdates,
                newPlan: normalizedPlan,
                reasoning: result.reasoning,
                changes,
            };
        }
        catch (error) {
            this.logger.error(`重规划失败: ${error.message}`, error.stack);
            return { hasUpdates: false, newPlan: currentPlan };
        }
    }
    normalizePlan(plan) {
        return plan
            .filter((step) => step && step.id && step.description)
            .map((step) => ({
            id: String(step.id),
            description: String(step.description),
            toolCategory: step.toolCategory ? String(step.toolCategory) : undefined,
            status: (step.status || 'pending'),
            dependencies: Array.isArray(step.dependencies)
                ? step.dependencies.map((d) => String(d))
                : [],
            result: step.result ? String(step.result) : undefined,
            error: step.error ? String(step.error) : undefined,
            metadata: step.metadata || {},
        }))
            .filter((step) => {
            return step.dependencies.every(depId => plan.some(p => String(p.id) === depId));
        });
    }
    calculateChanges(oldPlan, newPlan) {
        const oldIds = new Set(oldPlan.map(s => s.id));
        const newIds = new Set(newPlan.map(s => s.id));
        const added = newPlan.filter(s => !oldIds.has(s.id)).length;
        const removed = oldPlan.filter(s => !newIds.has(s.id)).length;
        const modified = newPlan.filter(newStep => {
            const oldStep = oldPlan.find(s => s.id === newStep.id);
            if (!oldStep)
                return false;
            return (oldStep.description !== newStep.description ||
                JSON.stringify(oldStep.dependencies) !== JSON.stringify(newStep.dependencies) ||
                oldStep.status !== newStep.status);
        }).length;
        return { added, removed, modified };
    }
    createSimplePlan(userGoal) {
        return [
            {
                id: 'step-1',
                description: `分析用户目标: ${userGoal}`,
                status: 'pending',
                dependencies: [],
            },
            {
                id: 'step-2',
                description: '执行主要任务',
                status: 'pending',
                dependencies: ['step-1'],
            },
            {
                id: 'step-3',
                description: '验证结果',
                status: 'pending',
                dependencies: ['step-2'],
            },
        ];
    }
};
exports.ReplannerService = ReplannerService;
exports.ReplannerService = ReplannerService = ReplannerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], ReplannerService);
//# sourceMappingURL=replanner.service.js.map