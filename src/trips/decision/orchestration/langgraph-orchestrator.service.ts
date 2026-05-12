// src/trips/decision/orchestration/langgraph-orchestrator.service.ts
/**
 * LangGraph Orchestrator Service
 * 
 * 使用 LangGraph 编排多个 Agent 的协作流程
 * 
 * 设计原则：
 * - LangGraph 作为"调度员"而非"驾驶员"
 * - 保护 Hard Core（TripNARA Core Tool）的确定性逻辑
 * - 负责状态管理、分支控制、失败重试
 */

import { Injectable, Logger } from '@nestjs/common';
import { ILangGraphOrchestrator, LangGraphState, LangGraphNodeConfig } from './langgraph-orchestrator.interface';
import { mergePrdTraceIntoLangGraphMetadata } from './langgraph-prd-metadata.util';
import { PlannerAgentService } from './planner-agent.service';
import { NarratorAgentService } from './narrator-agent.service';
import { TripNaraCoreToolService } from '../tools/tripnara-core-tool.service';
// TODO: 未来使用完整的 LangGraph StateGraph
// import { StateGraph, END, START } from '@langchain/langgraph';

@Injectable()
export class LangGraphOrchestratorService implements ILangGraphOrchestrator {
  private readonly logger = new Logger(LangGraphOrchestratorService.name);
  // TODO: 未来使用完整的 LangGraph StateGraph
  // private graph: StateGraph<LangGraphState> | null = null;

  constructor(
    private readonly plannerAgent: PlannerAgentService,
    private readonly narratorAgent: NarratorAgentService,
    private readonly coreTool: TripNaraCoreToolService,
  ) {}

  /**
   * 执行编排流程
   */
  async execute(userQuery: string, context?: Record<string, any>): Promise<LangGraphState> {
    this.logger.debug(`执行 LangGraph 编排: ${userQuery.substring(0, 50)}...`);

    // 初始化状态
    const initialState: LangGraphState = {
      userQuery,
      metadata: mergePrdTraceIntoLangGraphMetadata(
        context as Record<string, unknown> | undefined,
      ) as LangGraphState['metadata'],
    };

    try {
      // 1. Planner Agent: 分析查询（传入完整 state，支持 Context Engineer 集成）
      const plannerResult = await this.plannerAgent.analyzeQuery(initialState);
      initialState.extractedParams = plannerResult.extractedParams;

      // 2. 根据下一步决定流程
      if (plannerResult.nextStep === 'CORE_DECISION') {
        // 直接进入核心决策
        const coreToolInput = this.buildCoreToolInput(plannerResult.extractedParams);
        const coreToolOutput = await this.coreTool.execute(coreToolInput);
        initialState.coreToolInput = coreToolInput;
        initialState.coreToolOutput = coreToolOutput;

        // 3. Narrator Agent: 生成解释（传入完整 state，支持 Context Engineer 集成）
        const explanation = await this.narratorAgent.generateExplanation(
          coreToolOutput,
          initialState,
          initialState.complianceResult
        );
        initialState.finalResponse = explanation;

        return initialState;
      } else if (plannerResult.nextStep === 'COMPLIANCE_CHECK') {
        // TODO: 实现合规检查流程
        this.logger.warn('合规检查流程尚未实现，直接进入核心决策');
        
        const coreToolInput = this.buildCoreToolInput(plannerResult.extractedParams);
        const coreToolOutput = await this.coreTool.execute(coreToolInput);
        initialState.coreToolInput = coreToolInput;
        initialState.coreToolOutput = coreToolOutput;

        const explanation = await this.narratorAgent.generateExplanation(
          coreToolOutput,
          initialState,
          initialState.complianceResult
        );
        initialState.finalResponse = explanation;

        return initialState;
      } else {
        // LOCAL_INSIGHT 等其他流程
        this.logger.warn(`未实现的流程: ${plannerResult.nextStep}，直接进入核心决策`);
        
        const coreToolInput = this.buildCoreToolInput(plannerResult.extractedParams);
        const coreToolOutput = await this.coreTool.execute(coreToolInput);
        initialState.coreToolInput = coreToolInput;
        initialState.coreToolOutput = coreToolOutput;

        const explanation = await this.narratorAgent.generateExplanation(
          coreToolOutput,
          initialState,
          initialState.complianceResult
        );
        initialState.finalResponse = explanation;

        return initialState;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`LangGraph 编排失败: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      
      initialState.error = errorMessage;
      initialState.finalResponse = `抱歉，处理您的请求时出现错误：${errorMessage}`;
      
      return initialState;
    }
  }

  /**
   * 注册 Agent（用于扩展）
   */
  registerAgent(agentType: any, _agent: any): void {
    this.logger.debug(`注册 Agent: ${agentType}`);
    // TODO: 实现 Agent 注册逻辑
  }

  /**
   * 获取编排图结构（用于可视化）
   */
  getGraphStructure(): {
    nodes: LangGraphNodeConfig[];
    edges: Array<{ from: string; to: string; condition?: string }>;
  } {
    return {
      nodes: [
        {
          id: 'planner',
          agentType: 'PLANNER',
          description: '意图识别、任务拆解、参数提取',
        },
        {
          id: 'core_decision',
          agentType: 'CORE_DECISION',
          description: 'TripNARA 核心决策引擎',
        },
        {
          id: 'narrator',
          agentType: 'NARRATOR',
          description: '结果润色、故事层文案生成',
        },
      ],
      edges: [
        { from: 'planner', to: 'core_decision' },
        { from: 'core_decision', to: 'narrator' },
      ],
    };
  }

  /**
   * 构建 TripNARA Core Tool 输入
   */
  private buildCoreToolInput(extractedParams?: LangGraphState['extractedParams']): any {
    if (!extractedParams) {
      throw new Error('缺少提取的参数');
    }

    if (!extractedParams.countryCode) {
      throw new Error('缺少国家代码');
    }

    if (!extractedParams.month) {
      throw new Error('缺少月份');
    }

    if (!extractedParams.routeDirectionId) {
      throw new Error('缺少路线方向 ID');
    }

    if (!extractedParams.humanCapability) {
      throw new Error('缺少用户能力参数');
    }

    return {
      countryCode: extractedParams.countryCode,
      month: extractedParams.month,
      routeDirectionId: extractedParams.routeDirectionId,
      humanCapability: extractedParams.humanCapability,
      metadata: {
        source: 'langgraph_orchestrator',
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * 使用 LangGraph StateGraph 构建完整图（未来实现）
   * 
   * 注意：当前使用简化实现（顺序执行），未来可以迁移到完整的 LangGraph StateGraph
   * 
   * 未来实现示例：
   * ```typescript
   * const graph = new StateGraph<LangGraphState>({
   *   channels: {
   *     userQuery: { reducer: (x: string) => x },
   *     extractedParams: { reducer: (x: any) => x },
   *     // ...
   *   },
   * })
   *   .addNode('planner', plannerNode)
   *   .addNode('core_decision', coreDecisionNode)
   *   .addNode('narrator', narratorNode)
   *   .addEdge(START, 'planner')
   *   .addEdge('planner', 'core_decision')
   *   .addEdge('core_decision', 'narrator')
   *   .addEdge('narrator', END);
   * ```
   */
}

