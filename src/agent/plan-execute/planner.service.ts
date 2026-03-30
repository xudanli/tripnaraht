// src/agent/plan-execute/planner.service.ts
/**
 * Planner Service (DAG 生成器)
 * 
 * 负责生成 DAG (有向无环图)，明确每一步的依赖关系
 * 基于 LLMCompiler 理念：让 LLM 像编译器一样思考，识别并行任务
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { ActionRegistryService } from '../services/action-registry.service';
import { PlanTask } from './types';

/**
 * Logger 实例（用于错误日志）
 */
const promptLoaderLogger = new Logger('PlannerPromptLoader');

/**
 * 从 docs/SKILLS.md 中提取 Planner Prompt
 * 
 * 这样 Prompt 内容只在文档中维护，代码自动读取，保持单一数据源。
 */
function loadPlannerPromptFromDocs(): string {
  try {
    // 从项目根目录读取 docs/SKILLS.md
    // 使用 try-catch 包装，避免在模块加载时阻塞
    const docsPath = join(process.cwd(), 'docs', 'SKILLS.md');
    if (!require('fs').existsSync(docsPath)) {
      throw new Error(`文件不存在: ${docsPath}`);
    }
    const content = readFileSync(docsPath, 'utf-8');

    // 提取 "### 1. 🧠 The Planner" 到下一个 "###" 之间的 markdown 代码块内容
    const plannerSectionStart = content.indexOf('### 1. 🧠 The Planner');
    if (plannerSectionStart === -1) {
      throw new Error('找不到 Planner 章节');
    }

    // 找到下一个 ### 标题（Replanner）
    const replannerSectionStart = content.indexOf('### 2. 🔄 The Replanner', plannerSectionStart);
    const plannerSection = content.substring(plannerSectionStart, replannerSectionStart);

    // 提取 markdown 代码块中的内容（```markdown ... ```）
    const codeBlockMatch = plannerSection.match(/```markdown\n([\s\S]*?)\n```/);
    if (!codeBlockMatch || !codeBlockMatch[1]) {
      throw new Error('找不到 Planner Prompt 代码块');
    }

    return codeBlockMatch[1].trim();
  } catch (error: any) {
    // 降级方案：返回简化的英文 Prompt
    promptLoaderLogger.warn(`无法从 docs/SKILLS.md 加载 Planner Prompt: ${error.message}，使用降级方案`);
    return `You are the Lead Architect for TripNARA. Generate a DAG plan from user requests.`;
  }
}

// 缓存加载的 Prompt（避免每次调用都读取文件）
let cachedPlannerPrompt: string | null = null;

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly actionRegistry?: ActionRegistryService,
  ) {}

  /**
   * 生成 DAG 计划
   * 
   * @param userGoal 用户目标
   * @param context 上下文信息
   * @param provider LLM 提供商（可选，默认使用系统推荐的）
   * @returns PlanTask 数组（DAG）
   */
  async generateDAGPlan(
    userGoal: string,
    context: string,
    provider?: LlmProvider,
  ): Promise<PlanTask[]> {
    this.logger.log(`生成 DAG 计划: ${userGoal.substring(0, 50)}...`);

    if (!this.llmService) {
      // 降级：返回简单计划
      return this.createSimplePlan(userGoal);
    }

    try {
      // 从文档中加载 Prompt（带缓存）
      if (!cachedPlannerPrompt) {
        cachedPlannerPrompt = loadPlannerPromptFromDocs();
      }

      // 替换 Prompt 模板变量
      const currentDate = new Date().toISOString().split('T')[0];
      
      // 获取可用工具列表（如果 ActionRegistry 可用）
      const availableToolsSection = this.buildAvailableToolsSection();
      
      let systemPrompt = cachedPlannerPrompt
        .replace(/\{\{USER_QUERY\}\}/g, userGoal)
        .replace(/\{\{CONTEXT_SUMMARY\}\}/g, context || '无上下文')
        .replace(/\{\{CURRENT_DATE\}\}/g, currentDate);
      
      // 如果 Prompt 中包含 {{AVAILABLE_TOOLS}} 占位符，替换为实际工具列表
      if (systemPrompt.includes('{{AVAILABLE_TOOLS}}')) {
        systemPrompt = systemPrompt.replace(/\{\{AVAILABLE_TOOLS\}\}/g, availableToolsSection);
      } else {
        // 如果没有占位符，在 Tool Categories 部分后追加工具列表
        // 尝试匹配 "# Tool Categories" 或 "## Tool Categories" 后追加
        const toolCategoriesPattern = /(#+ Tool Categories[\s\S]*?)(#+ Few-Shot Examples|## Example|# Few-Shot Examples)/;
        if (toolCategoriesPattern.test(systemPrompt)) {
          systemPrompt = systemPrompt.replace(
            toolCategoriesPattern,
            `$1\n\n${availableToolsSection}\n\n$2`
          );
        } else {
          // 如果找不到 Tool Categories 部分，在 Core Responsibilities 后追加
          systemPrompt = systemPrompt.replace(
            /(# Core Responsibilities[\s\S]*?)(# Tool Categories|# Few-Shot Examples|## Example)/,
            `$1\n\n${availableToolsSection}\n\n$2`
          );
        }
      }

      // 定义输出 Schema
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

      // 构建完整的 prompt（系统提示词已经包含了用户查询）
      const fullPrompt = systemPrompt;

      // 使用指定的 provider 或系统默认的 provider
      const llmProvider = provider || LlmProvider.OPENAI;

      const response = await this.llmService.callLlmWithSchema(
        llmProvider,
        fullPrompt,
        schema,
      );

      // 清理响应（移除可能的 markdown 代码块）
      const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanedResponse);
      const tasks = Array.isArray(parsed) ? parsed : parsed.tasks || [];

      // 验证和规范化
      const normalizedTasks = this.normalizeTasks(tasks);

      // 验证 DAG 结构（无循环依赖）
      this.validateDAG(normalizedTasks);

      this.logger.log(`DAG 计划生成完成: ${normalizedTasks.length} 个任务`);

      return normalizedTasks;
    } catch (error: any) {
      this.logger.error(`生成 DAG 计划失败: ${error.message}`, error.stack);
      return this.createSimplePlan(userGoal);
    }
  }

  /**
   * 规范化任务列表
   */
  private normalizeTasks(tasks: any[]): PlanTask[] {
    return tasks
      .filter((task: any) => task && task.id && task.description)
      .map((task: any) => ({
        id: String(task.id),
        description: String(task.description),
        toolCategory: task.toolCategory ? String(task.toolCategory) : undefined,
        dependencies: Array.isArray(task.dependencies)
          ? task.dependencies.map((d: any) => String(d))
          : [],
        status: 'pending' as PlanTask['status'],
        metadata: task.metadata || {},
      }));
  }

  /**
   * 验证 DAG 结构（检测循环依赖）
   */
  private validateDAG(tasks: PlanTask[]): void {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (taskId: string): boolean => {
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
          // 验证依赖是否存在
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

  /**
   * 构建可用工具列表部分（用于注入到 Prompt 中）
   */
  private buildAvailableToolsSection(): string {
    if (!this.actionRegistry) {
      return '**注意**: ActionRegistry 未可用，无法获取工具列表。请使用系统已注册的工具。';
    }

    const actions = this.actionRegistry.list();
    
    if (actions.length === 0) {
      return '**注意**: 当前没有注册的工具。';
    }

    // 按类别分组工具
    const toolsByCategory: Record<string, Array<{ name: string; description: string }>> = {};
    
    actions.forEach(action => {
      const category = action.name.split('.')[0]; // 提取类别（如 'trip', 'places'）
      if (!toolsByCategory[category]) {
        toolsByCategory[category] = [];
      }
      toolsByCategory[category].push({
        name: action.name,
        description: action.description,
      });
    });

    // 构建工具列表文本
    const sections: string[] = [];
    sections.push('# Available Tools (可用工具列表)');
    sections.push('');
    sections.push('**重要**: 你只能使用以下已注册的工具。不要使用不存在的工具（如 `weather.query`、`general.execute` 等）。');
    sections.push('');

    // 按类别输出工具
    const categoryOrder = ['trip', 'places', 'transport', 'itinerary', 'policy', 'readiness', 'webbrowse', 'railpass'];
    const otherCategories = Object.keys(toolsByCategory).filter(cat => !categoryOrder.includes(cat));
    const allCategories = [...categoryOrder, ...otherCategories];

    for (const category of allCategories) {
      if (!toolsByCategory[category]) continue;
      
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

  /**
   * 创建简单计划（降级方案）
   */
  private createSimplePlan(userGoal: string): PlanTask[] {
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
}
