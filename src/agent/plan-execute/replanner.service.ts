// src/agent/plan-execute/replanner.service.ts
/**
 * Replanner Service
 * 
 * 负责基于执行结果动态调整计划
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { PlanTask, PlanStep, ReplanResult, ContextSummary } from './types';

/**
 * 从 docs/SKILLS.md 中提取 Replanner Prompt
 * 
 * 这样 Prompt 内容只在文档中维护，代码自动读取，保持单一数据源。
 */
function loadReplannerPromptFromDocs(): string {
  try {
    // 使用 try-catch 包装，避免在模块加载时阻塞
    const docsPath = join(process.cwd(), 'docs', 'SKILLS.md');
    if (!require('fs').existsSync(docsPath)) {
      throw new Error(`文件不存在: ${docsPath}`);
    }
    const content = readFileSync(docsPath, 'utf-8');

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
  } catch (error: any) {
    // 降级方案：返回简化的英文 Prompt
    const logger = new Logger('ReplannerPromptLoader');
    logger.warn(`无法从 docs/SKILLS.md 加载 Replanner Prompt: ${error.message}，使用降级方案`);
    return `You are the Strategic Replanner for TripNARA. Update the execution plan based on results.`;
  }
}

// 缓存加载的 Prompt（避免每次调用都读取文件）
let cachedReplannerPrompt: string | null = null;

@Injectable()
export class ReplannerService {
  private readonly logger = new Logger(ReplannerService.name);

  constructor(
    @Optional() private readonly llmService?: LlmService,
  ) {}

  /**
   * 创建初始计划
   */
  async createInitialPlan(
    userGoal: string,
    context: ContextSummary,
  ): Promise<PlanTask[]> {
    this.logger.debug(`创建初始计划: ${userGoal}`);

    if (!this.llmService) {
      // 降级：返回简单计划
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
      // 从文档中加载 Prompt（带缓存）
      if (!cachedReplannerPrompt) {
        cachedReplannerPrompt = loadReplannerPromptFromDocs();
      }

      // 替换 Prompt 模板变量（创建初始计划时使用简化版本）
      const systemPrompt = cachedReplannerPrompt
        .replace(/\{\{USER_GOAL\}\}/g, userGoal)
        .replace(/\{\{CURRENT_PLAN_JSON\}\}/g, '[]')
        .replace(/\{\{EXECUTION_SUMMARY\}\}/g, '初始计划生成')
        .replace(/\{\{LAST_ERROR\}\}/g, '');

      // 构建完整的 prompt
      const fullPrompt = `${systemPrompt}\n\n## User Request\n\n${prompt}\n\n## Response\n\n请返回 JSON 格式的计划数组。`;
      
      // 定义输出 Schema
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

      const response = await this.llmService.callLlmWithSchema(
        LlmProvider.OPENAI, // 使用 OpenAI provider
        fullPrompt,
        schema,
      );

      // 清理响应（移除可能的 markdown 代码块）
      const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanedResponse);
      const plan = Array.isArray(parsed) ? parsed : parsed.plan || [];

      // 验证和规范化
      return this.normalizePlan(plan);
    } catch (error: any) {
      this.logger.error(`创建初始计划失败: ${error.message}`, error.stack);
      return this.createSimplePlan(userGoal);
    }
  }

  /**
   * 重规划
   * 
   * @param userGoal 用户目标
   * @param currentPlan 当前计划
   * @param memory 执行记忆
   * @param provider LLM 提供商（可选，默认使用系统推荐的）
   * @returns 重规划结果
   */
  async replan(
    userGoal: string,
    currentPlan: PlanTask[],
    memory: Record<string, any>,
    provider?: LlmProvider,
  ): Promise<ReplanResult> {
    this.logger.debug(`重规划: ${currentPlan.length} 个步骤`);

    if (!this.llmService) {
      // 降级：不进行重规划
      return { hasUpdates: false, newPlan: currentPlan };
    }

    // 1. 提取最近完成/失败的任务结果
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

    // 2. 构建重规划提示
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
      // 从文档中加载 Prompt（带缓存）
      if (!cachedReplannerPrompt) {
        cachedReplannerPrompt = loadReplannerPromptFromDocs();
      }

      // 替换 Prompt 模板变量
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

      // 构建完整的 prompt
      const fullPrompt = systemPrompt;
      
      // 定义输出 Schema
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

      // 使用指定的 provider 或系统默认的 provider
      const llmProvider = provider || LlmProvider.OPENAI;

      const response = await this.llmService.callLlmWithSchema(
        llmProvider,
        fullPrompt,
        schema,
      );

      // 清理响应（移除可能的 markdown 代码块）
      const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(cleanedResponse);
      const newPlan = result.plan || result;

      // 验证和规范化
      const normalizedPlan = this.normalizePlan(newPlan);

      // 计算变更
      const calculatedChanges = this.calculateChanges(currentPlan, normalizedPlan);
      const changes = result.changes || calculatedChanges;

      // 检查是否有实际更新
      const hasUpdates = changes.added > 0 || changes.removed > 0 || changes.modified > 0;

      if (hasUpdates) {
        this.logger.log(`重规划完成: 新增 ${changes.added}, 删除 ${changes.removed}, 修改 ${changes.modified}`);
      }

      return {
        hasUpdates,
        newPlan: normalizedPlan as PlanStep[],
        reasoning: result.reasoning,
        changes,
      };
    } catch (error: any) {
      this.logger.error(`重规划失败: ${error.message}`, error.stack);
      // 失败时返回原计划
      return { hasUpdates: false, newPlan: currentPlan };
    }
  }

  /**
   * 规范化计划（验证和修复）
   */
  private normalizePlan(plan: any[]): PlanTask[] {
    return plan
      .filter((step: any) => step && step.id && step.description)
      .map((step: any) => ({
        id: String(step.id),
        description: String(step.description),
        toolCategory: step.toolCategory ? String(step.toolCategory) : undefined,
        status: (step.status || 'pending') as PlanTask['status'],
        dependencies: Array.isArray(step.dependencies)
          ? step.dependencies.map((d: any) => String(d))
          : [],
        result: step.result ? String(step.result) : undefined,
        error: step.error ? String(step.error) : undefined,
        metadata: step.metadata || {},
      }))
      .filter((step: PlanTask) => {
        // 验证依赖关系
        return step.dependencies.every(depId => 
          plan.some(p => String(p.id) === depId)
        );
      });
  }

  /**
   * 计算变更统计
   */
  private calculateChanges(
    oldPlan: PlanTask[],
    newPlan: PlanTask[],
  ): ReplanResult['changes'] {
    const oldIds = new Set(oldPlan.map(s => s.id));
    const newIds = new Set(newPlan.map(s => s.id));

    const added = newPlan.filter(s => !oldIds.has(s.id)).length;
    const removed = oldPlan.filter(s => !newIds.has(s.id)).length;

    // 检查修改（ID 相同但描述或依赖改变）
    const modified = newPlan.filter(newStep => {
      const oldStep = oldPlan.find(s => s.id === newStep.id);
      if (!oldStep) return false;

      return (
        oldStep.description !== newStep.description ||
        JSON.stringify(oldStep.dependencies) !== JSON.stringify(newStep.dependencies) ||
        oldStep.status !== newStep.status
      );
    }).length;

    return { added, removed, modified };
  }

  /**
   * 创建简单计划（降级方案）
   */
  private createSimplePlan(userGoal: string): PlanTask[] {
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
}
