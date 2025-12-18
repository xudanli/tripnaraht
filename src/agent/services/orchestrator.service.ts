// src/agent/services/orchestrator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AgentState } from '../interfaces/agent-state.interface';
import { RouteType } from '../interfaces/router.interface';
import { ActionRegistryService } from './action-registry.service';
import { CriticService } from './critic.service';
import { AgentStateService } from './agent-state.service';
import { EventTelemetryService } from './event-telemetry.service';
import { ActionCacheService } from './action-cache.service';
import { ActionDependencyAnalyzerService } from './action-dependency-analyzer.service';
import { LlmPlanService } from './llm-plan-service';

/**
 * Orchestrator Service
 * 
 * System 2 的 ReAct 循环：Plan → Act → Observe → Critic → Repair
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private actionRegistry: ActionRegistryService,
    private critic: CriticService,
    private stateService: AgentStateService,
    private eventTelemetry?: EventTelemetryService,
    private actionCache?: ActionCacheService,
    private dependencyAnalyzer?: ActionDependencyAnalyzerService,
    private llmPlan?: LlmPlanService,
  ) {}

  /**
   * 执行 System 2 ReAct 循环
   */
  async execute(
    state: AgentState,
    budget: {
      max_seconds: number;
      max_steps: number;
      max_browser_steps: number;
    }
  ): Promise<AgentState> {
    const startTime = Date.now();
    let currentState = state;

    this.logger.debug(`Starting System2 ReAct loop for request: ${currentState.request_id}`);

    try {
      // 初始化 ReAct 状态
      currentState = this.stateService.update(currentState.request_id, {
        react: {
          ...currentState.react,
          step: 0,
          observations: [],
          decision_log: [],
        },
        result: {
          ...currentState.result,
          status: 'DRAFT',
        },
      });

      // ReAct 循环
      while (this.shouldContinue(currentState, budget, startTime)) {
        // 重新获取最新状态（确保使用最新状态进行 Plan）
        currentState = this.stateService.get(currentState.request_id) || currentState;
        
        // Plan: 选择可以执行的 Actions（可能返回多个可并行执行的 Actions）
        const actions = await this.plan(currentState);
        
        if (!actions || actions.length === 0) {
          this.logger.debug('No actions selected, breaking loop');
          break;
        }

        // 如果只有一个 Action，使用原有的串行执行
        if (actions.length === 1) {
          const action = actions[0];
          this.logger.debug(`Step ${currentState.react.step}: Executing action ${action.name}`);

          // Act: 执行 Action
          currentState = await this.act(currentState, action);
          
          // 重新获取最新状态（确保使用最新状态）
          currentState = this.stateService.get(currentState.request_id) || currentState;

          // Observe: 收集观察结果
          currentState = await this.observe(currentState, action);
        } else {
          // 多个 Actions 可以并行执行
          this.logger.debug(`Step ${currentState.react.step}: Executing ${actions.length} actions in parallel: ${actions.map(a => a.name).join(', ')}`);

          // Act: 并行执行 Actions
          currentState = await this.actParallel(currentState, actions);
          
          // 重新获取最新状态
          currentState = this.stateService.get(currentState.request_id) || currentState;

          // Observe: 收集所有 Actions 的观察结果
          for (const action of actions) {
            currentState = await this.observe(currentState, action);
            currentState = this.stateService.get(currentState.request_id) || currentState;
          }
        }
        
        // 再次获取最新状态
        currentState = this.stateService.get(currentState.request_id) || currentState;

        // Critic: 检查可行性
        const criticResult = await this.critic.validateFeasibility(currentState);

        // 记录决策日志（为每个 Action 创建一条日志）
        // 注意：reason_code 应该在 Plan 阶段确定，而不是在 Critic 之后
        // 因为 reason_code 应该反映为什么选择这个 action，而不是 critic 的结果
        const decisionLogEntries = actions.map(action => {
          // 根据当前状态和 action 确定 reason_code
          let reasonCode = 'UNKNOWN';
          
          if (action.name === 'places.resolve_entities') {
            reasonCode = currentState.draft.nodes.length === 0 ? 'MISSING_NODES' : 'NODES_ALREADY_EXIST';
          } else if (action.name === 'places.get_poi_facts') {
            reasonCode = currentState.memory.semantic_facts.pois.length === 0 ? 'MISSING_POI_FACTS' : 'FETCHING_FACTS';
          } else if (action.name === 'transport.build_time_matrix') {
            reasonCode = currentState.compute.time_matrix_robust === null ? 'MISSING_TIME_MATRIX' : 'BUILDING_MATRIX';
          } else if (action.name === 'itinerary.optimize_day_vrptw') {
            reasonCode = currentState.compute.optimization_results.length === 0 ? 'MISSING_OPTIMIZATION' : 'OPTIMIZING';
          } else if (action.name === 'policy.validate_feasibility') {
            reasonCode = criticResult.pass ? 'VALIDATION_PASSED' : (criticResult.violations[0]?.type || 'VALIDATION_FAILED');
          } else if (action.name.startsWith('webbrowse.')) {
            reasonCode = 'WEB_BROWSE_REQUIRED';
          } else {
            // 如果没有匹配，使用 critic 结果
            reasonCode = criticResult.pass ? 'CRITIC_PASSED' : (criticResult.violations[0]?.type || 'UNKNOWN');
          }
          
          return {
            step: currentState.react.step,
            chosen_action: action.name,
            reason_code: reasonCode,
            facts: this.extractFacts(criticResult),
            policy_id: 'REACT_LOOP',
          };
        });

        currentState = this.stateService.updateNested(
          currentState.request_id,
          ['react', 'decision_log'],
          [...currentState.react.decision_log, ...decisionLogEntries]
        );

        // 如果 Critic 通过，可以提前结束
        if (criticResult.pass) {
          this.logger.debug('Critic passed, marking as READY');
          currentState = this.stateService.update(currentState.request_id, {
            result: {
              ...currentState.result,
              status: 'READY',
            },
          });
          break;
        }

        // Repair: 如果需要修复
        if (criticResult.violations.length > 0) {
          currentState = await this.repair(currentState, criticResult);
        }

        // 增加步数
        currentState = this.stateService.updateNested(
          currentState.request_id,
          ['react', 'step'],
          currentState.react.step + 1
        );
      }

      // 检查终止条件
      if (currentState.result.status === 'DRAFT') {
        if (this.isTimeout(currentState, budget, startTime)) {
          currentState = this.stateService.update(currentState.request_id, {
            result: {
              ...currentState.result,
              status: 'TIMEOUT',
            },
          });
        } else if (this.isHardInfeasible(currentState)) {
          currentState = this.stateService.update(currentState.request_id, {
            result: {
              ...currentState.result,
              status: 'FAILED',
            },
          });
        }
      }

      // 更新可观测性
      const latency = Date.now() - startTime;
      currentState = this.stateService.update(currentState.request_id, {
        observability: {
          ...currentState.observability,
          latency_ms: latency,
          tool_calls: currentState.react.step,
        },
      });

      this.logger.debug(`System2 ReAct loop completed: ${currentState.result.status}, steps: ${currentState.react.step}`);

      return currentState;
    } catch (error: any) {
      this.logger.error(`Orchestrator error: ${error?.message || String(error)}`, error?.stack);
      return this.stateService.update(currentState.request_id, {
        result: {
          ...currentState.result,
          status: 'FAILED',
        },
      });
    }
  }

  /**
   * Plan: 选择可以执行的 Actions（可能返回多个可并行执行的 Actions）
   * 
   * 使用规则引擎选择 Actions，优先级：
   * 1. LLM Plan（如果启用）- 智能选择 Action
   * 2. WebBrowse（如果需要）- 从用户输入中提取 URL
   * 3. 解析实体（如果缺少节点）
   * 4. 获取 POI 事实（如果节点已解析但缺少事实）
   * 5. 构建时间矩阵（如果节点和事实都有但缺少时间矩阵）
   * 6. 执行优化（如果所有前置条件满足）
   * 7. 修复问题（如果 Critic 发现违反）
   * 
   * 返回：可以执行的 Actions 数组（单个或可并行执行的一组）
   */
  private async plan(state: AgentState): Promise<Array<{ name: string; input: any }> | null> {
    this.logger.debug(`Plan: 当前状态 - nodes: ${state.draft.nodes.length}, facts: ${state.memory.semantic_facts.pois.length}, time_matrix: ${state.compute.time_matrix_robust ? 'exists' : 'null'}, optimizations: ${state.compute.optimization_results.length}`);
    
    // 检查 resolve_entities 是否应该被禁用（硬规则停止条件）
    // 检查是否已经尝试过解析（避免无限循环）
    const resolveEntitiesAttempts = state.react.decision_log.filter(
      log => log.chosen_action === 'places.resolve_entities'
    ).length;
    
    // 检查最近两次 resolve_entities 的结果是否都是空节点（硬规则停止条件）
    const recentResolveAttempts = state.react.decision_log
      .filter(log => log.chosen_action === 'places.resolve_entities')
      .slice(-2); // 最近两次
    
    const recentEmptyResults = recentResolveAttempts.length >= 2 && 
      state.draft.nodes.length === 0; // 如果最近尝试了至少2次，且当前节点仍为空
    
    const shouldBlockResolveEntities = recentEmptyResults && resolveEntitiesAttempts >= 2;

    // 1. 优先尝试使用 LLM Plan（如果启用）
    if (this.llmPlan) {
      try {
        const llmAction = await this.llmPlan.selectAction(state);
        if (llmAction) {
          // 如果 LLM 选择了已被禁用的 action，拒绝并回退到规则引擎
          if (shouldBlockResolveEntities && llmAction.name === 'places.resolve_entities') {
            this.logger.warn(`Plan: LLM selected blocked action (places.resolve_entities), falling back to rule-based planning`);
          } else {
            this.logger.debug(`Plan: LLM selected action: ${llmAction.name}`);
            return [llmAction];
          }
        }
      } catch (error: any) {
        this.logger.warn(`LLM Plan failed: ${error?.message || String(error)}, falling back to rule-based planning`);
      }
    }
    
    // 收集所有可以执行的候选 Actions
    const candidateActions: Array<{ name: string; input: any }> = [];

    // 2. 检查是否需要 WebBrowse（从用户输入中提取 URL）
    const urlMatch = this.extractUrlFromInput(state.user_input);
    if (urlMatch) {
      this.logger.debug(`Plan: Detected URL in input, selecting webbrowse.browse`);
      return [{
        name: 'webbrowse.browse',
        input: {
          url: urlMatch,
          extract_text: true,
          extract_links: false,
          take_screenshot: false,
        },
      }];
    }

    // 规则 3: 如果缺少 POI 节点，先解析实体
    // 硬规则：如果 resolve_entities 返回空节点连续2次，直接停止
    if (shouldBlockResolveEntities) {
      this.logger.warn(`Plan: resolve_entities 连续2次返回空节点，停止循环并返回 NEED_MORE_INFO`);
      // 直接返回 null，让系统自然结束并返回 NEED_MORE_INFO
      return null;
    }
    
    // 检查用户输入是否有效
    const userInput = state.user_input?.trim() || '';
    const isInvalidQuery = !userInput || userInput.toLowerCase() === 'unknown';
    
    // 如果 query 无效，直接返回 null，让系统自然结束并返回 NEED_MORE_INFO
    if (isInvalidQuery && state.draft.nodes.length === 0) {
      this.logger.warn(`Plan: 用户输入无效 (${userInput}), 无法解析实体，跳过解析步骤`);
      // 不添加 action，让系统自然结束并返回 NEED_MORE_INFO
      return null;
    }
    
    // 最多尝试2次（降低从3次到2次，配合硬规则）
    if (state.draft.nodes.length === 0 && userInput && resolveEntitiesAttempts < 2) {
      this.logger.debug(`Plan: 缺少节点，选择 places.resolve_entities (尝试次数: ${resolveEntitiesAttempts})`);
      candidateActions.push({
        name: 'places.resolve_entities',
        input: { 
          query: userInput, // 使用已验证的 userInput
          limit: 20, // 最多解析 20 个实体
        },
      });
      // 如果缺少节点，必须等待解析完成，不能并行其他操作
      return candidateActions.length > 0 ? candidateActions : null;
    }
    
    // 如果已经尝试过多次解析但仍然没有节点，跳过解析，尝试其他步骤
    if (state.draft.nodes.length === 0 && resolveEntitiesAttempts >= 2) {
      this.logger.warn(`Plan: 已尝试 ${resolveEntitiesAttempts} 次解析实体但未成功，跳过解析步骤`);
      // 继续执行后续规则，即使没有节点
    }
    
    // 如果已经有节点了，不应该再执行 resolve_entities
    if (state.draft.nodes.length > 0) {
      this.logger.debug(`Plan: 已有 ${state.draft.nodes.length} 个节点，跳过 resolve_entities`);
    }

    // 规则 4: 如果节点已解析但缺少事实信息，获取 POI 事实
    if (state.draft.nodes.length > 0) {
      const nodeIds = state.draft.nodes.map((n: any) => n.id).filter(Boolean);
      const hasFacts = state.memory.semantic_facts.pois.length > 0;
      
      if (nodeIds.length > 0 && !hasFacts) {
        this.logger.debug('Plan: 节点已解析但缺少事实，选择 places.get_poi_facts');
        candidateActions.push({
          name: 'places.get_poi_facts',
          input: { poi_ids: nodeIds },
        });
      }
    }

    // 规则 5: 如果节点和事实都有但缺少时间矩阵，构建时间矩阵
    // 注意：transport.build_time_matrix 可能需要 facts，所以通常不能与 get_poi_facts 并行
    if (
      state.draft.nodes.length > 0 &&
      state.compute.time_matrix_robust === null &&
      state.compute.time_matrix_api === null
    ) {
      // 检查是否已经有 facts（如果没有，不能执行 build_time_matrix）
      const hasFacts = state.memory.semantic_facts.pois.length > 0;
      if (hasFacts) {
        this.logger.debug('Plan: 缺少时间矩阵，选择 transport.build_time_matrix');
        candidateActions.push({
          name: 'transport.build_time_matrix',
          input: { nodes: state.draft.nodes },
        });
      }
    }

    // 规则 6: 如果所有前置条件满足但缺少优化结果，执行优化
    if (
      state.draft.nodes.length > 0 &&
      state.compute.time_matrix_robust !== null &&
      state.compute.optimization_results.length === 0
    ) {
      this.logger.debug('Plan: 前置条件满足，选择 itinerary.optimize_day_vrptw');
      candidateActions.push({
        name: 'itinerary.optimize_day_vrptw',
        input: {
          nodes: state.draft.nodes,
          time_matrix: state.compute.time_matrix_robust,
          trip: state.trip,
        },
      });
      // 优化操作通常不能与其他操作并行
      return candidateActions.length > 0 ? candidateActions : null;
    }

    // 规则 7: 如果优化已完成但需要验证可行性，调用 policy.validate_feasibility
    if (
      state.compute.optimization_results.length > 0 &&
      state.result.timeline.length > 0 &&
      state.result.status === 'DRAFT'
    ) {
      this.logger.debug('Plan: 优化已完成，选择 policy.validate_feasibility');
      candidateActions.push({
        name: 'policy.validate_feasibility',
        input: {
          timeline: state.result.timeline,
          policy: state.memory?.user_profile?.policy,
        },
      });
      return candidateActions.length > 0 ? candidateActions : null;
    }

    // 规则 8: 如果所有步骤都完成，返回 null（结束循环）
    if (
      state.draft.nodes.length > 0 &&
      state.compute.time_matrix_robust !== null &&
      state.compute.optimization_results.length > 0
    ) {
      this.logger.debug('Plan: 所有步骤已完成');
      return null;
    }

    // 如果有候选 Actions，使用依赖分析器找出可以并行执行的分组
    if (candidateActions.length > 0 && this.dependencyAnalyzer) {
      const parallelGroups = this.dependencyAnalyzer.findParallelizableActions(
        candidateActions,
        state
      );
      
      if (parallelGroups.length > 0 && parallelGroups[0].length > 0) {
        // 返回第一组可以并行执行的 Actions
        this.logger.debug(`Plan: Found ${parallelGroups[0].length} parallelizable actions`);
        return parallelGroups[0];
      }
    }

    // 如果没有依赖分析器或没有可并行的，返回第一个候选 Action
    if (candidateActions.length > 0) {
      // 检查是否重复执行相同的 action（防止无限循环）
      const lastAction = state.react.decision_log.length > 0 
        ? state.react.decision_log[state.react.decision_log.length - 1].chosen_action
        : null;
      
      const selectedAction = candidateActions[0];
      
      // 如果连续 3 次执行相同的 action，跳过它
      const recentSameActions = state.react.decision_log
        .slice(-3)
        .filter(log => log.chosen_action === selectedAction.name);
      
      if (recentSameActions.length >= 3 && lastAction === selectedAction.name) {
        this.logger.warn(`Plan: 已连续执行 ${recentSameActions.length} 次 ${selectedAction.name}，跳过以避免无限循环`);
        
        // 尝试选择其他候选 action
        if (candidateActions.length > 1) {
          this.logger.debug(`Plan: 选择替代 action: ${candidateActions[1].name}`);
          return [candidateActions[1]];
        }
        
        // 如果没有其他候选，返回 null 结束循环
        this.logger.warn('Plan: 没有其他候选 action，结束循环');
        return null;
      }
      
      return [selectedAction];
    }

    // 默认：无法确定下一步
    // 如果所有前置条件都无法满足，返回一个友好的错误信息
    // 检查是否因为无法解析实体而无法继续
    const finalResolveAttempts = state.react.decision_log.filter(
      log => log.chosen_action === 'places.resolve_entities'
    ).length;
    
    if (state.draft.nodes.length === 0 && finalResolveAttempts >= 3) {
      this.logger.warn('Plan: 无法解析实体，且已尝试多次，无法继续执行');
      // 返回 null 以结束循环，状态将保持为 DRAFT 或 NEED_MORE_INFO
      return null;
    }
    
    this.logger.warn('Plan: 无法确定下一步 Action');
    return null;
  }

  /**
   * 从用户输入中提取 URL
   */
  private extractUrlFromInput(userInput: string): string | null {
    if (!userInput) {
      return null;
    }

    // 匹配 HTTP/HTTPS URL
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const match = userInput.match(urlRegex);
    if (match && match.length > 0) {
      return match[0];
    }

    // 匹配 www. 开头的 URL
    const wwwRegex = /www\.[^\s]+/gi;
    const wwwMatch = userInput.match(wwwRegex);
    if (wwwMatch && wwwMatch.length > 0) {
      return `https://${wwwMatch[0]}`;
    }

    return null;
  }

  /**
   * Act: 执行 Action
   */
  private async act(
    state: AgentState,
    action: { name: string; input: any }
  ): Promise<AgentState> {
    const actionDef = this.actionRegistry.get(action.name);
    
    if (!actionDef) {
      this.logger.warn(`Action not found: ${action.name}`);
      return state;
    }

    // 检查前置条件
    if (!this.actionRegistry.checkPreconditions(action.name, state)) {
      this.logger.warn(`Preconditions not met for action: ${action.name}`);
      return state;
    }

    const actStartTime = Date.now();
    let cacheHit = false;
    
    try {
      // 检查缓存（如果 Action 是可缓存的）
      let result: any;
      
      if (actionDef.metadata.cacheable && this.actionCache) {
        const cacheKey = this.actionCache.generateCacheKey(
          action.name,
          action.input,
          actionDef.metadata.cache_key
        );
        
        const cachedResult = this.actionCache.get(cacheKey);
        if (cachedResult !== null) {
          this.logger.debug(`Cache hit for action: ${action.name}, key: ${cacheKey}`);
          result = cachedResult;
          cacheHit = true;
        }
      }

      // 如果缓存未命中，执行 Action
      if (!cacheHit) {
        result = await actionDef.execute(action.input, state);
        
        // 将结果存入缓存（如果 Action 是可缓存的）
        if (actionDef.metadata.cacheable && this.actionCache) {
          const cacheKey = this.actionCache.generateCacheKey(
            action.name,
            action.input,
            actionDef.metadata.cache_key
          );
          this.actionCache.set(cacheKey, result);
          this.logger.debug(`Cached result for action: ${action.name}, key: ${cacheKey}`);
        }
      }
      
      const actLatency = Date.now() - actStartTime;

      // 记录 system2_step 事件
      if (this.eventTelemetry) {
        this.eventTelemetry.recordSystem2Step(
          state.request_id,
          state.react.step,
          action.name,
          result,
          actLatency,
          { phase: 'act', cache_hit: cacheHit }
        );
      }

      // 更新状态（根据 Action 类型）
      return this.updateStateFromAction(state, action.name, result);
    } catch (error: any) {
      this.logger.error(`Action execution error: ${error?.message || String(error)}`, error?.stack);
      
      // 记录失败事件
      if (this.eventTelemetry) {
        this.eventTelemetry.recordSystem2Step(
          state.request_id,
          state.react.step,
          action.name,
          { error: error?.message || String(error) },
          Date.now() - actStartTime,
          { phase: 'act', error: true }
        );
      }
      
      // 返回未修改的状态
      return state;
    }
  }

  /**
   * Act: 并行执行多个 Actions
   */
  private async actParallel(
    state: AgentState,
    actions: Array<{ name: string; input: any }>
  ): Promise<AgentState> {
    if (actions.length === 0) {
      return state;
    }

    const actStartTime = Date.now();
    let currentState = state;

    // 并行执行所有 Actions
    const executionPromises = actions.map(async (action) => {
      const actionDef = this.actionRegistry.get(action.name);
      
      if (!actionDef) {
        this.logger.warn(`Action not found: ${action.name}`);
        return { action, result: null, error: new Error(`Action not found: ${action.name}`) };
      }

      // 检查前置条件
      if (!this.actionRegistry.checkPreconditions(action.name, currentState)) {
        this.logger.warn(`Preconditions not met for action: ${action.name}`);
        return { action, result: null, error: new Error(`Preconditions not met: ${action.name}`) };
      }

      const actionStartTime = Date.now();
      let cacheHit = false;
      
      try {
        let result: any;
        
        // 检查缓存
        if (actionDef.metadata.cacheable && this.actionCache) {
          const cacheKey = this.actionCache.generateCacheKey(
            action.name,
            action.input,
            actionDef.metadata.cache_key
          );
          
          const cachedResult = this.actionCache.get(cacheKey);
          if (cachedResult !== null) {
            this.logger.debug(`Cache hit for action: ${action.name}, key: ${cacheKey}`);
            result = cachedResult;
            cacheHit = true;
          }
        }

        // 如果缓存未命中，执行 Action
        if (!cacheHit) {
          result = await actionDef.execute(action.input, currentState);
          
          // 将结果存入缓存
          if (actionDef.metadata.cacheable && this.actionCache) {
            const cacheKey = this.actionCache.generateCacheKey(
              action.name,
              action.input,
              actionDef.metadata.cache_key
            );
            this.actionCache.set(cacheKey, result);
            this.logger.debug(`Cached result for action: ${action.name}, key: ${cacheKey}`);
          }
        }
        
        const actLatency = Date.now() - actionStartTime;

        // 记录 system2_step 事件
        if (this.eventTelemetry) {
          this.eventTelemetry.recordSystem2Step(
            currentState.request_id,
            currentState.react.step,
            action.name,
            result,
            actLatency,
            { phase: 'act_parallel', cache_hit: cacheHit }
          );
        }

        return { action, result, error: null };
      } catch (error: any) {
        this.logger.error(`Action execution error: ${error?.message || String(error)}`, error?.stack);
        
        // 记录失败事件
        if (this.eventTelemetry) {
          this.eventTelemetry.recordSystem2Step(
            currentState.request_id,
            currentState.react.step,
            action.name,
            { error: error?.message || String(error) },
            Date.now() - actionStartTime,
            { phase: 'act_parallel', error: true }
          );
        }
        
        return { action, result: null, error };
      }
    });

    // 等待所有 Actions 完成
    const executionResults = await Promise.all(executionPromises);

    // 按顺序合并所有 Actions 的结果到状态中
    // 注意：即使 Actions 是并行执行的，状态更新仍然需要按顺序进行以避免冲突
    for (const { action, result, error } of executionResults) {
      if (error || !result) {
        this.logger.warn(`Action ${action.name} failed, skipping state update`);
        continue;
      }

      // 更新状态（每个 Action 的结果都基于初始状态）
      currentState = this.updateStateFromAction(currentState, action.name, result);
    }

    const totalLatency = Date.now() - actStartTime;
    this.logger.debug(
      `Parallel execution completed: ${actions.length} actions in ${totalLatency}ms ` +
      `(avg: ${Math.round(totalLatency / actions.length)}ms per action)`
    );

    return currentState;
  }

  /**
   * Observe: 收集观察结果
   */
  private async observe(
    state: AgentState,
    action: { name: string; input: any }
  ): Promise<AgentState> {
    // 记录观察结果
    const observation = {
      step: state.react.step,
      action: action.name,
      timestamp: new Date().toISOString(),
    };

    return this.stateService.updateNested(
      state.request_id,
      ['react', 'observations'],
      [...state.react.observations, observation]
    );
  }

  /**
   * Repair: 修复问题（确定性执行，不再交给 LLM 选）
   * 
   * 将 critic 的 violations 映射成固定动作：
   * - ROBUST_TIME_MISSING → transport.build_time_matrix
   * - LUNCH_MISSING → 在 schedule 里插入 lunch slot（或先打标，等 schedule 生成后再插）
   * - TIME_WINDOW_CONFLICT → itinerary.repair_cross_day
   */
  private async repair(
    state: AgentState,
    criticResult: any
  ): Promise<AgentState> {
    this.logger.debug(`Repairing ${criticResult.violations.length} violations`);

    let updatedState = state;

    // 遍历所有 violations，确定性修复
    for (const violation of criticResult.violations) {
      const violationType = typeof violation === 'string' 
        ? violation.split(':')[0] // 处理 "LUNCH_MISSING: 缺少午餐休息时间" 格式
        : violation.type || violation;

      this.logger.debug(`Repairing violation: ${violationType}`);

      // ROBUST_TIME_MISSING → transport.build_time_matrix
      // 关键：如果 nodes=0，不能构建 time_matrix，应该标记为 NEED_MORE_INFO
      if (violationType === 'ROBUST_TIME_MISSING') {
        if (updatedState.draft.nodes.length > 0) {
          const buildTimeMatrixAction = this.actionRegistry.get('transport.build_time_matrix');
          if (buildTimeMatrixAction) {
            try {
              this.logger.debug('Repair: 执行 transport.build_time_matrix');
              const result = await buildTimeMatrixAction.execute(
                { nodes: updatedState.draft.nodes, robust: true },
                updatedState
              );
              updatedState = this.updateStateFromAction(updatedState, 'transport.build_time_matrix', result);
            } catch (error: any) {
              this.logger.error(`Repair action error (build_time_matrix): ${error?.message || String(error)}`);
            }
          }
        } else {
          // 如果 nodes=0，不能构建 time_matrix，标记为 NEED_MORE_INFO
          this.logger.warn('Repair: ROBUST_TIME_MISSING 但 nodes=0，无法构建 time_matrix，标记为 NEED_MORE_INFO');
          updatedState = this.stateService.update(updatedState.request_id, {
            result: {
              ...updatedState.result,
              status: 'NEED_MORE_INFO',
              explanations: [
                ...(updatedState.result.explanations || []),
                '无法解析用户输入中的地点信息，请提供更具体的地点名称',
              ],
            },
          });
        }
      }

      // LUNCH_MISSING → 如果已有 schedule，插入 lunch slot；否则标记为待修复
      if (violationType === 'LUNCH_MISSING') {
        // 检查是否已有 schedule（timeline 不为空）
        const hasSchedule = updatedState.result.timeline && updatedState.result.timeline.length > 0;
        
        if (hasSchedule) {
          // 如果有 schedule，可以插入 lunch break
          // 这里简化处理：标记为已处理（实际应该插入 lunch slot）
          this.logger.debug('Repair: 检测到 LUNCH_MISSING，但已有 schedule，标记为待后续处理');
          // TODO: 实现插入 lunch slot 的逻辑
        } else {
          // 如果还没有 schedule，标记为待修复（等 schedule 生成后再插）
          this.logger.debug('Repair: 检测到 LUNCH_MISSING，但尚未生成 schedule，标记为待修复');
          // TODO: 在 state 中添加 pendingRepairs 字段
        }
      }

      // TIME_WINDOW_CONFLICT → itinerary.repair_cross_day
      if (violationType === 'TIME_WINDOW_CONFLICT') {
        const repairAction = this.actionRegistry.get('itinerary.repair_cross_day');
        if (repairAction) {
          try {
            this.logger.debug('Repair: 执行 itinerary.repair_cross_day');
            const result = await repairAction.execute(
              { violations: [violation] },
              updatedState
            );
            updatedState = this.updateStateFromAction(updatedState, 'itinerary.repair_cross_day', result);
          } catch (error: any) {
            this.logger.error(`Repair action error (repair_cross_day): ${error?.message || String(error)}`);
          }
        }
      }
    }

    return updatedState;
  }

  /**
   * 更新状态（根据 Action 结果）
   */
  private updateStateFromAction(
    state: AgentState,
    actionName: string,
    result: any
  ): AgentState {
    // 根据 Action 类型更新不同的状态字段
    if (actionName === 'places.resolve_entities') {
      const updatedNodes = result.nodes || [];
      this.logger.debug(`Updated nodes: ${updatedNodes.length} nodes from ${actionName}`);
      
      // 检查是否有错误（query 无效）
      if (result.error && (result.error.includes('Invalid query') || result.error.includes('unknown'))) {
        this.logger.error(`places.resolve_entities failed: ${result.error}`);
        // 如果 query 无效，直接标记为 NEED_MORE_INFO，不要继续循环
        return this.stateService.update(state.request_id, {
          draft: {
            ...state.draft,
            nodes: [], // 保持空数组
          },
          result: {
            ...state.result,
            status: 'NEED_MORE_INFO',
            explanations: [
              ...(state.result.explanations || []),
              `无法解析用户输入中的地点信息，请提供更具体的地点名称`,
            ],
          },
        });
      }
      
      // 即使返回空数组，也要更新状态（标记为已尝试）
      // 这样可以避免无限循环执行同一个 action
      const newState = this.stateService.update(state.request_id, {
        draft: {
          ...state.draft,
          nodes: updatedNodes, // 直接使用返回的节点（即使是空数组）
        },
      });
      
      // 如果返回空数组，记录警告
      if (updatedNodes.length === 0) {
        const query = state.user_input || 'unknown';
        this.logger.warn(`places.resolve_entities returned empty nodes. Query: ${query}`);
      }
      
      return newState;
    }
    
    if (actionName === 'places.get_poi_facts') {
      this.logger.debug(`Updated POI facts: ${Object.keys(result.facts || {}).length} facts`);
      return this.stateService.update(state.request_id, {
        memory: {
          ...state.memory,
          semantic_facts: {
            ...state.memory.semantic_facts,
            pois: result.facts ? Object.values(result.facts) : state.memory.semantic_facts.pois,
          },
        },
      });
    }
    
    if (actionName.startsWith('places.')) {
      return this.stateService.update(state.request_id, {
        draft: {
          ...state.draft,
          nodes: result.nodes || state.draft.nodes,
        },
      });
    }

    if (actionName.startsWith('transport.')) {
      return this.stateService.update(state.request_id, {
        compute: {
          ...state.compute,
          time_matrix_api: result.time_matrix_api || state.compute.time_matrix_api,
          time_matrix_robust: result.time_matrix_robust || state.compute.time_matrix_robust,
        },
      });
    }

    if (actionName.startsWith('itinerary.')) {
      return this.stateService.update(state.request_id, {
        compute: {
          ...state.compute,
          optimization_results: result.results || state.compute.optimization_results,
        },
        result: {
          ...state.result,
          timeline: result.timeline || state.result.timeline,
          dropped_items: result.dropped_items || state.result.dropped_items,
        },
      });
    }

    if (actionName.startsWith('policy.')) {
      // Policy Actions 的结果用于更新 Critic 状态
      // 如果 validate_feasibility 通过，可以标记为 READY
      if (actionName === 'policy.validate_feasibility' && result.pass) {
        return this.stateService.update(state.request_id, {
          result: {
            ...state.result,
            status: 'READY',
          },
        });
      }
      return state;
    }

    if (actionName.startsWith('webbrowse.')) {
      // WebBrowse Actions 的结果存储到 memory 中
      this.logger.debug(`WebBrowse result: ${result.success ? 'success' : 'failed'}, URL: ${result.url}`);
      return this.stateService.update(state.request_id, {
        memory: {
          ...state.memory,
          episodic_snippets: [
            ...state.memory.episodic_snippets,
            {
              type: 'webbrowse',
              url: result.url,
              title: result.title,
              content: result.extracted_text || result.content,
              timestamp: new Date().toISOString(),
              success: result.success,
            },
          ],
        },
        observability: {
          ...state.observability,
          browser_steps: state.observability.browser_steps + 1,
        },
      });
    }

    return state;
  }

  /**
   * 检查是否应该继续循环
   */
  private shouldContinue(
    state: AgentState,
    budget: { max_seconds: number; max_steps: number },
    startTime: number
  ): boolean {
    // 如果已经完成，不继续
    if (state.result.status === 'READY' || state.result.status === 'FAILED') {
      return false;
    }

    // 检查步数限制
    if (state.react.step >= budget.max_steps) {
      return false;
    }

    // 检查时间限制
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= budget.max_seconds) {
      return false;
    }

    return true;
  }

  /**
   * 检查是否超时
   */
  private isTimeout(
    state: AgentState,
    budget: { max_seconds: number },
    startTime: number
  ): boolean {
    const elapsed = (Date.now() - startTime) / 1000;
    return elapsed >= budget.max_seconds;
  }

  /**
   * 检查是否硬不可行
   */
  private isHardInfeasible(state: AgentState): boolean {
    // 检查是否有硬节点但无法满足
    const hardNodes = state.draft.hard_nodes || [];
    const droppedItems = state.result.dropped_items || [];
    
    // 如果有硬节点被丢弃，则不可行
    for (const hardNode of hardNodes) {
      if (droppedItems.some(item => item.id === hardNode.id)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取原因码
   */
  private getReasonCode(action: { name: string }, criticResult: any, state?: AgentState): string {
    if (criticResult.pass) {
      return 'CRITIC_PASSED';
    }
    
    // 如果有 violations，返回第一个 violation 类型
    if (criticResult.violations && criticResult.violations.length > 0) {
      return criticResult.violations[0]?.type || 'UNKNOWN';
    }
    
    // 根据 action 名称和状态推断原因
    if (action.name === 'places.resolve_entities') {
      if (state && state.draft.nodes.length === 0) {
        return 'NO_NODES_RESOLVED';
      }
      return 'ENTITIES_RESOLVED';
    }
    
    if (action.name === 'places.get_poi_facts') {
      return 'FETCHING_POI_FACTS';
    }
    
    if (action.name === 'transport.build_time_matrix') {
      return 'BUILDING_TIME_MATRIX';
    }
    
    if (action.name === 'itinerary.optimize_day_vrptw') {
      return 'OPTIMIZING_ITINERARY';
    }
    
    return 'UNKNOWN';
  }

  /**
   * 提取事实
   */
  private extractFacts(criticResult: any): Record<string, any> {
    return {
      violations_count: criticResult.violations.length,
      min_slack: criticResult.min_slack,
      total_wait: criticResult.total_wait,
    };
  }
}

