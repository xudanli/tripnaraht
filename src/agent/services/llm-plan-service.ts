// src/agent/services/llm-plan-service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { AgentState } from '../interfaces/agent-state.interface';
import { ActionRegistryService } from './action-registry.service';
import { TripNaraSystemPromptService } from './tripnara-system-prompt.service';

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
    @Optional() private systemPromptService?: TripNaraSystemPromptService,
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

      // 清理响应：移除 markdown 代码块标记
      const cleanedResponse = this.cleanJsonResponse(response);

      // 解析响应
      const result = JSON.parse(cleanedResponse) as ActionSelectionResult & { should_continue: boolean };

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
      
      // 检查是否是网络错误（ECONNRESET 等）
      const errorMessage = error?.message || String(error);
      const isNetworkError = errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('no response received') ||
        errorMessage.includes('network');
      
      if (isNetworkError) {
        this.logger.warn('LLM Plan failed due to network error, falling back to rule-based planning');
      }
      
      // 出错时回退到规则引擎（返回 null，而不是错误的 mock 数据）
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
        // 为 trip.apply_user_edit 添加详细的参数说明
        let paramDetails = '';
        if (action.name === 'trip.apply_user_edit') {
          paramDetails = `
  参数格式：
  {
    "trip_id": "行程ID（字符串）",
    "edits": [
      {
        "type": "add" | "update" | "delete" | "move",
        "itemId": "行程项ID（update/delete/move时需要）",
        "placeId": "地点ID（add时需要）",
        "tripDayId": "日期ID（add时需要）",
        "startTime": "开始时间（ISO字符串，add/update/move时需要）",
        "endTime": "结束时间（ISO字符串，add/update/move时需要）",
        "updates": { ... }（update时需要）,
        "newTripDayId": "新日期ID（move时需要）",
        "newStartTime": "新开始时间（move时需要）",
        "newEndTime": "新结束时间（move时需要）"
      }
    ]
  }
  重要：
  - edits 必须是数组，即使只有一个编辑操作也要放在数组中
  - edits 数组不能为空
  - 只有当用户提供了完整的编辑信息（包括 placeId、tripDayId、startTime、endTime 等）时，才应该使用此 action
  - 如果用户只是说"添加地点X"但没有提供完整信息，应该先使用 places.resolve_entities 来解析地点，而不是使用此 action`;
        }
        return `- ${action.name}: ${action.description} (preconditions: ${preconditions}, cost: ${action.metadata.cost})${paramDetails}`;
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

    // 获取 TripNARA 系统提示（如果可用）
    const systemPrompt = this.systemPromptService?.getSystemPrompt() || '';
    const systemPromptSection = systemPrompt 
      ? `\n\n---\n\n${systemPrompt}\n\n---\n\n`
      : '';

    return `${systemPromptSection}你是一个智能旅行规划助手（TripNARA），负责选择下一个要执行的 Action 来推进行程规划流程。

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
5. **参数完整性**：
   - 如果选择 trip.apply_user_edit，必须确保能够提供完整的 edits 数组（包括 type、placeId、tripDayId、startTime、endTime 等）
   - 如果用户输入只是"添加地点X"但没有提供完整信息，应该先使用 places.resolve_entities 来解析地点，而不是使用 trip.apply_user_edit
   - 只有当用户输入或状态中已经包含完整的编辑信息时，才应该使用 trip.apply_user_edit
   - **重要**：如果当前状态显示 nodes: 0（没有节点），通常应该先使用 places.resolve_entities 来解析地点，而不是直接使用 trip.apply_user_edit
   - **重要**：如果无法构造完整的 edits 数组（缺少 placeId、tripDayId、startTime、endTime 等），应该选择其他 action，而不是使用 trip.apply_user_edit

## 输出格式

请返回一个 JSON 对象，包含：
- action_name: Action 名称
- input: Action 的输入参数（根据 Action 的 input_schema）
- reasoning: 选择此 Action 的原因（1-2句话）
- confidence: 置信度（0-1）
- should_continue: 如果所有步骤已完成，返回 false

请确保返回的 JSON 格式正确，并且 action_name 必须是上述可用 Actions 之一。

## 重要提醒

**关于 trip.apply_user_edit**：
- 此 action 需要完整的 edits 数组，包含所有必需的字段（type、placeId、tripDayId、startTime、endTime 等）
- 如果用户输入只是"添加地点X"但没有提供完整信息（如 placeId、tripDayId、startTime、endTime），不应该选择此 action
- 在这种情况下，应该先选择 places.resolve_entities 来解析地点，或者选择其他合适的 action
- 只有在能够构造完整的 edits 数组时，才应该选择 trip.apply_user_edit

**关于 trip.load_draft**：
- 此 action 需要 trip_id 参数
- 如果 trip_id 不可用（不在 input 中，也不在 agent state 中），不应该选择此 action
- 应该先确保 trip_id 可用，或者选择其他不需要 trip_id 的 action`;
  }

  /**
   * 清理 JSON 响应：移除 markdown 代码块标记
   * 
   * @param response LLM 原始响应
   * @returns 清理后的 JSON 字符串
   */
  private cleanJsonResponse(response: string): string {
    let cleaned = response.trim();

    // 移除 markdown 代码块标记（```json 或 ```）
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');

    // 移除可能的其他标记
    cleaned = cleaned.trim();

    return cleaned;
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

