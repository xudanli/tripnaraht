// src/agent/services/llm-plan-service.ts
import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { AgentState } from '../interfaces/agent-state.interface';
import { ActionRegistryService } from './action-registry.service';

/**
 * Action Selection Result
 */
interface ActionSelectionResult {
  action_name: string;
  input: Record<string, any>;
  reasoning: string;
  confidence: number;
}

/**
 * LLM Plan Service
 * 
 * 使用 LLM 在 Plan 阶段智能选择 Actions
 */
@Injectable()
export class LlmPlanService {
  private readonly logger = new Logger(LlmPlanService.name);
  private readonly enabled: boolean;

  constructor(
    private llmService: LlmService,
    private actionRegistry: ActionRegistryService,
  ) {
    // 检查是否启用 LLM Plan（默认启用，但可以通过环境变量禁用）
    this.enabled = process.env.ENABLE_LLM_PLAN !== 'false';
    if (!this.enabled) {
      this.logger.log('LLM Plan is disabled');
    }
  }

  /**
   * 使用 LLM 选择下一个 Action
   * 
   * @param state 当前 Agent 状态
   * @returns 选中的 Action 或 null
   */
  async selectAction(state: AgentState): Promise<{ name: string; input: any } | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      // 构建 Prompt
      const prompt = this.buildPrompt(state);

      // 定义输出 Schema
      const schema = {
        type: 'object',
        properties: {
          action_name: {
            type: 'string',
            description: '要执行的 Action 名称（如 "places.resolve_entities"）',
          },
          input: {
            type: 'object',
            description: 'Action 的输入参数',
          },
          reasoning: {
            type: 'string',
            description: '选择此 Action 的原因',
          },
          confidence: {
            type: 'number',
            description: '置信度 (0-1)',
            minimum: 0,
            maximum: 1,
          },
          should_continue: {
            type: 'boolean',
            description: '是否应该继续执行（如果所有步骤已完成，则为 false）',
          },
        },
        required: ['action_name', 'input', 'reasoning', 'confidence', 'should_continue'],
      };

      // 调用 LLM（使用默认 provider）
      // 注意：callLlm 是私有方法，我们需要使用公开的方法
      // 为了简化，我们创建一个通用的调用方法
      const response = await this.callLlmWithSchema(prompt, schema);

      // 解析响应
      const result = JSON.parse(response) as ActionSelectionResult & { should_continue: boolean };

      if (!result.should_continue) {
        this.logger.debug('LLM determined that no more actions are needed');
        return null;
      }

      // 验证 Action 是否存在
      const actionDef = this.actionRegistry.get(result.action_name);
      if (!actionDef) {
        this.logger.warn(`LLM selected unknown action: ${result.action_name}, falling back to rule-based planning`);
        return null;
      }

      this.logger.debug(
        `LLM selected action: ${result.action_name} (confidence: ${result.confidence}, reasoning: ${result.reasoning})`
      );

      return {
        name: result.action_name,
        input: result.input,
      };
    } catch (error: any) {
      this.logger.error(`LLM Plan error: ${error?.message || String(error)}`, error?.stack);
      // 出错时回退到规则引擎
      return null;
    }
  }

  /**
   * 构建 Prompt
   */
  private buildPrompt(state: AgentState): string {
    // 获取所有可用的 Actions
    const availableActions = this.actionRegistry.list();
    const actionDescriptions = availableActions
      .map(action => {
        const preconditions = action.metadata.preconditions?.join(', ') || 'none';
        return `- ${action.name}: ${action.description} (preconditions: ${preconditions}, cost: ${action.metadata.cost})`;
      })
      .join('\n');

    // 构建状态摘要
    const stateSummary = {
      nodes: state.draft.nodes.length,
      hasFacts: state.memory.semantic_facts.pois.length > 0,
      hasTimeMatrix: state.compute.time_matrix_robust !== null || state.compute.time_matrix_api !== null,
      hasOptimizationResults: state.compute.optimization_results.length > 0,
      hasTimeline: state.result.timeline.length > 0,
      status: state.result.status,
      userInput: state.user_input,
      step: state.react.step,
    };

    return `你是一个智能旅行规划助手，负责选择下一个要执行的 Action 来推进行程规划流程。

## 当前状态

${JSON.stringify(stateSummary, null, 2)}

## 可用的 Actions

${actionDescriptions}

## 任务

根据当前状态，选择下一个最合适的 Action 来推进行程规划。请考虑：

1. **前置条件**：确保所选 Action 的前置条件已满足
2. **优先级**：按照以下顺序考虑：
   - 如果缺少 POI 节点，应该先解析实体（places.resolve_entities）
   - 如果节点已解析但缺少事实，应该获取 POI 事实（places.get_poi_facts）
   - 如果节点和事实都有但缺少时间矩阵，应该构建时间矩阵（transport.build_time_matrix）
   - 如果所有前置条件满足，应该执行优化（itinerary.optimize_day_vrptw）
   - 如果优化已完成，应该验证可行性（policy.validate_feasibility）
3. **成本**：优先选择成本较低的 Actions
4. **效率**：选择能够最大程度推进流程的 Action

## 输出格式

请返回一个 JSON 对象，包含：
- action_name: Action 名称
- input: Action 的输入参数（根据 Action 的 input_schema）
- reasoning: 选择此 Action 的原因（1-2句话）
- confidence: 置信度（0-1）
- should_continue: 如果所有步骤已完成，返回 false

请确保返回的 JSON 格式正确，并且 action_name 必须是上述可用 Actions 之一。`;
  }

  /**
   * 调用 LLM（使用反射访问 LlmService 的私有方法）
   * 注意：这是临时方案，理想情况下应该修改 LlmService 添加公开的通用调用方法
   */
  private async callLlmWithSchema(prompt: string, schema: any): Promise<string> {
    try {
      // 使用类型断言访问私有方法（临时方案）
      const llmServiceAny = this.llmService as any;
      if (typeof llmServiceAny.callLlm === 'function') {
        // 获取默认 provider
        const defaultProvider = llmServiceAny.defaultProvider || 'OPENAI';
        return await llmServiceAny.callLlm(defaultProvider, prompt, schema);
      } else {
        this.logger.warn('LlmService.callLlm method not available, LLM Plan will be disabled');
        throw new Error('LLM call method not available');
      }
    } catch (error: any) {
      this.logger.error(`Failed to call LLM: ${error?.message || String(error)}`);
      throw error;
    }
  }
}

