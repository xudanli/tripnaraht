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
var PlannerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const action_registry_service_1 = require("../services/action-registry.service");
const promptLoaderLogger = new common_1.Logger('PlannerPromptLoader');
function loadPlannerPromptFromDocs() {
    try {
        const docsPath = (0, path_1.join)(process.cwd(), 'docs', 'SKILLS.md');
        if (!require('fs').existsSync(docsPath)) {
            throw new Error(`文件不存在: ${docsPath}`);
        }
        const content = (0, fs_1.readFileSync)(docsPath, 'utf-8');
        const plannerSectionStart = content.indexOf('### 1. 🧠 The Planner');
        if (plannerSectionStart === -1) {
            throw new Error('找不到 Planner 章节');
        }
        const replannerSectionStart = content.indexOf('### 2. 🔄 The Replanner', plannerSectionStart);
        const plannerSection = content.substring(plannerSectionStart, replannerSectionStart);
        const codeBlockMatch = plannerSection.match(/```markdown\n([\s\S]*?)\n```/);
        if (!codeBlockMatch || !codeBlockMatch[1]) {
            throw new Error('找不到 Planner Prompt 代码块');
        }
        return codeBlockMatch[1].trim();
    }
    catch (error) {
        promptLoaderLogger.warn(`无法从 docs/SKILLS.md 加载 Planner Prompt: ${error.message}，使用降级方案`);
        return `You are the Lead Architect for TripNARA. Generate a DAG plan from user requests.`;
    }
}
let cachedPlannerPrompt = null;
let PlannerService = PlannerService_1 = class PlannerService {
    constructor(llmService, actionRegistry) {
        this.llmService = llmService;
        this.actionRegistry = actionRegistry;
        this.logger = new common_1.Logger(PlannerService_1.name);
    }
    async generateDAGPlan(userGoal, context, provider) {
        this.logger.log(`生成 DAG 计划: ${userGoal.substring(0, 50)}...`);
        if (!this.llmService) {
            return this.createSimplePlan(userGoal);
        }
        try {
            if (!cachedPlannerPrompt) {
                cachedPlannerPrompt = loadPlannerPromptFromDocs();
            }
            const currentDate = new Date().toISOString().split('T')[0];
            const availableToolsSection = this.buildAvailableToolsSection();
            let systemPrompt = cachedPlannerPrompt
                .replace(/\{\{USER_QUERY\}\}/g, userGoal)
                .replace(/\{\{CONTEXT_SUMMARY\}\}/g, context || '无上下文')
                .replace(/\{\{CURRENT_DATE\}\}/g, currentDate);
            if (systemPrompt.includes('{{AVAILABLE_TOOLS}}')) {
                systemPrompt = systemPrompt.replace(/\{\{AVAILABLE_TOOLS\}\}/g, availableToolsSection);
            }
            else {
                const toolCategoriesPattern = /(#+ Tool Categories[\s\S]*?)(#+ Few-Shot Examples|## Example|# Few-Shot Examples)/;
                if (toolCategoriesPattern.test(systemPrompt)) {
                    systemPrompt = systemPrompt.replace(toolCategoriesPattern, `$1\n\n${availableToolsSection}\n\n$2`);
                }
                else {
                    systemPrompt = systemPrompt.replace(/(# Core Responsibilities[\s\S]*?)(# Tool Categories|# Few-Shot Examples|## Example)/, `$1\n\n${availableToolsSection}\n\n$2`);
                }
            }
            const schema = {
                type: 'object',
                properties: {
                    tasks: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                description: { type: 'string' },
                                dependencies: { type: 'array', items: { type: 'string' } },
                                toolCategory: { type: 'string' },
                            },
                            required: ['id', 'description', 'dependencies'],
                        },
                    },
                    reasoning: { type: 'string' },
                },
                required: ['tasks'],
            };
            const fullPrompt = systemPrompt;
            const llmProvider = provider || llm_request_dto_1.LlmProvider.OPENAI;
            const response = await this.llmService.callLlmWithSchema(llmProvider, fullPrompt, schema);
            const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleanedResponse);
            const tasks = Array.isArray(parsed) ? parsed : parsed.tasks || [];
            const normalizedTasks = this.normalizeTasks(tasks);
            this.validateDAG(normalizedTasks);
            this.logger.log(`DAG 计划生成完成: ${normalizedTasks.length} 个任务`);
            return normalizedTasks;
        }
        catch (error) {
            this.logger.error(`生成 DAG 计划失败: ${error.message}`, error.stack);
            return this.createSimplePlan(userGoal);
        }
    }
    normalizeTasks(tasks) {
        return tasks
            .filter((task) => task && task.id && task.description)
            .map((task) => ({
            id: String(task.id),
            description: String(task.description),
            toolCategory: task.toolCategory ? String(task.toolCategory) : undefined,
            dependencies: Array.isArray(task.dependencies)
                ? task.dependencies.map((d) => String(d))
                : [],
            status: 'pending',
            metadata: task.metadata || {},
        }));
    }
    validateDAG(tasks) {
        const visited = new Set();
        const recStack = new Set();
        const dfs = (taskId) => {
            if (recStack.has(taskId)) {
                throw new Error(`检测到循环依赖: ${taskId}`);
            }
            if (visited.has(taskId)) {
                return false;
            }
            visited.add(taskId);
            recStack.add(taskId);
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                for (const depId of task.dependencies) {
                    if (!tasks.find(t => t.id === depId)) {
                        throw new Error(`任务 ${taskId} 的依赖 ${depId} 不存在`);
                    }
                    if (dfs(depId)) {
                        return true;
                    }
                }
            }
            recStack.delete(taskId);
            return false;
        };
        for (const task of tasks) {
            if (!visited.has(task.id)) {
                if (dfs(task.id)) {
                    throw new Error('DAG 验证失败：存在循环依赖');
                }
            }
        }
    }
    buildAvailableToolsSection() {
        if (!this.actionRegistry) {
            return '**注意**: ActionRegistry 未可用，无法获取工具列表。请使用系统已注册的工具。';
        }
        const actions = this.actionRegistry.list();
        if (actions.length === 0) {
            return '**注意**: 当前没有注册的工具。';
        }
        const toolsByCategory = {};
        actions.forEach(action => {
            const category = action.name.split('.')[0];
            if (!toolsByCategory[category]) {
                toolsByCategory[category] = [];
            }
            toolsByCategory[category].push({
                name: action.name,
                description: action.description,
            });
        });
        const sections = [];
        sections.push('# Available Tools (可用工具列表)');
        sections.push('');
        sections.push('**重要**: 你只能使用以下已注册的工具。不要使用不存在的工具（如 `weather.query`、`general.execute` 等）。');
        sections.push('');
        const categoryOrder = ['trip', 'places', 'transport', 'itinerary', 'policy', 'readiness', 'webbrowse', 'railpass'];
        const otherCategories = Object.keys(toolsByCategory).filter(cat => !categoryOrder.includes(cat));
        const allCategories = [...categoryOrder, ...otherCategories];
        for (const category of allCategories) {
            if (!toolsByCategory[category])
                continue;
            sections.push(`## ${category} Tools`);
            sections.push('');
            toolsByCategory[category].forEach(tool => {
                sections.push(`- **${tool.name}**: ${tool.description}`);
            });
            sections.push('');
        }
        sections.push('**使用规则**:');
        sections.push('1. **必须**在任务的 `description` 中，使用反引号明确指定工具名称（如 "使用 `places.resolve_entities` 解析用户输入中的地点"）');
        sections.push('2. 工具名称必须用反引号包裹，格式：`工具名`（如 `webbrowse.browse`、`places.resolve_entities`）');
        sections.push('3. 不要使用未列出的工具');
        sections.push('4. 如果任务需要的信息无法通过现有工具获取，请在 `description` 中说明，系统会通过 Replanner 调整计划');
        sections.push('');
        sections.push('**示例**：');
        sections.push('- ✅ 正确: "使用 `webbrowse.browse` 查询冰岛7月的天气信息"');
        sections.push('- ✅ 正确: "使用 `places.resolve_entities` 解析用户输入中的地点"');
        sections.push('- ❌ 错误: "查询冰岛7月的天气"（没有指定工具名）');
        sections.push('- ❌ 错误: "使用 weather.query 查询天气"（工具不存在）');
        sections.push('');
        return sections.join('\n');
    }
    createSimplePlan(userGoal) {
        return [
            {
                id: 'task_1',
                description: `分析用户目标: ${userGoal}`,
                dependencies: [],
                status: 'pending',
            },
            {
                id: 'task_2',
                description: '执行主要任务',
                dependencies: ['task_1'],
                status: 'pending',
            },
            {
                id: 'task_3',
                description: '验证结果',
                dependencies: ['task_2'],
                status: 'pending',
            },
        ];
    }
};
exports.PlannerService = PlannerService;
exports.PlannerService = PlannerService = PlannerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        action_registry_service_1.ActionRegistryService])
], PlannerService);
//# sourceMappingURL=planner.service.js.map