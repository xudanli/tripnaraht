// src/agent/services/system-collaboration.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  CollaborationMode,
  ConflictType,
  ConflictSeverity,
  Conflict,
  DifferenceExplanation,
  System1CollaborationResult,
  System2CollaborationResult,
  CollaborationResult,
  CollaborationConfig,
  CollaborationRequest,
} from '../interfaces/system-collaboration.interface';
import { RouteType } from '../interfaces/router.interface';
import { AgentState } from '../interfaces/agent-state.interface';
import { System1ExecutorService } from './system1-executor.service';
import { RouterService } from './router.service';
import { DAGOrchestratorService } from '../plan-execute/orchestrator.service';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { OrchestratorService } from './orchestrator.service';

/**
 * System 1 和 System 2 协作服务
 * 
 * 实现文档要求的协作模式：
 * - System 1快速启动，System 2后台计算
 * - 冲突检测和处理机制
 * - 差异解释
 */
@Injectable()
export class SystemCollaborationService {
  private readonly logger = new Logger(SystemCollaborationService.name);

  private readonly defaultConfig: CollaborationConfig = {
    enableParallelExecution: true,
    system1Timeout: 3000,
    system2Timeout: 60000,
    conflictDetectionEnabled: true,
    autoResolveConflicts: false,
    showSystem1First: true,
  };

  private readonly dagOrchestrator?: DAGOrchestratorService;
  private readonly claudeOrchestrator?: ClaudeOrchestratorService;
  private readonly legacyOrchestrator?: OrchestratorService;

  constructor(
    private readonly system1Executor: System1ExecutorService,
    @Optional() routerService?: RouterService,
    @Optional() dagOrchestrator?: DAGOrchestratorService,
    @Optional() claudeOrchestrator?: ClaudeOrchestratorService,
    @Optional() legacyOrchestrator?: OrchestratorService,
  ) {
    this.dagOrchestrator = dagOrchestrator;
    this.claudeOrchestrator = claudeOrchestrator;
    this.legacyOrchestrator = legacyOrchestrator;
    void routerService; // 避免未使用警告
  }

  /**
   * 执行协作模式
   * 
   * 根据配置决定是并行执行还是顺序执行
   */
  async executeCollaboration(
    request: CollaborationRequest
  ): Promise<CollaborationResult> {
    const config = { ...this.defaultConfig, ...request.config };
    const startTime = Date.now();

    this.logger.debug(`Starting collaboration mode: ${config.enableParallelExecution ? 'PARALLEL' : 'SEQUENTIAL'}`);

    // 决定协作模式
    const mode: CollaborationMode = this.determineCollaborationMode(
      request.route1,
      request.route2,
      config
    );

    if (mode === 'PARALLEL' && config.enableParallelExecution) {
      return await this.executeParallel(request, config, startTime);
    } else if (mode === 'SEQUENTIAL') {
      return await this.executeSequential(request, config, startTime);
    } else {
      // SYSTEM1_ONLY 或 SYSTEM2_ONLY
      return await this.executeSingleSystem(request, mode, config, startTime);
    }
  }

  /**
   * 并行执行：System 1快速启动，System 2后台计算
   */
  private async executeParallel(
    request: CollaborationRequest,
    config: CollaborationConfig,
    startTime: number
  ): Promise<CollaborationResult> {
    const system1StartTime = Date.now();
    let system1Result: System1CollaborationResult | undefined;
    let system2Result: System2CollaborationResult | undefined;
    let system2Pending = false;

    // 启动System 1（快速路径）
    const system1Promise = this.executeSystem1(request, config)
      .then(result => {
        system1Result = result;
        this.logger.debug(`System 1 completed in ${result.executionTime}ms`);
        return result;
      })
      .catch(error => {
        this.logger.error(`System 1 execution failed: ${error.message}`, error.stack);
        return undefined;
      });

    // 启动System 2（后台计算）
    const system2StartTime = Date.now();
    const system2Promise = this.executeSystem2(request, config)
      .then(result => {
        system2Result = result;
        this.logger.debug(`System 2 completed in ${result.executionTime}ms`);
        return result;
      })
      .catch(error => {
        this.logger.error(`System 2 execution failed: ${error.message}`, error.stack);
        return undefined;
      });

    // 等待System 1完成（快速响应）
    await system1Promise;

    // 检查System 2是否仍在执行
    system2Pending = !system2Result;

    // 如果System 2仍在执行，不等待它（后台继续）
    // 如果已经完成，则进行冲突检测
    let conflicts: Conflict[] = [];
    let differences: DifferenceExplanation[] = [];

    if (system1Result && system2Result) {
      // 两个系统都已完成，进行冲突检测
      const conflictResult = await this.detectConflicts(system1Result, system2Result, config);
      conflicts = conflictResult.conflicts;
      differences = conflictResult.differences;
    } else if (system1Result && system2Pending) {
      // System 1已完成，System 2仍在执行
      this.logger.debug('System 1 completed, System 2 still running in background');
    }

    const totalTime = Date.now() - startTime;
    const system1EndTime = system1Result ? system1StartTime + system1Result.executionTime : undefined;
    const system2EndTime = system2Result ? system2StartTime + system2Result.executionTime : undefined;

    // 生成最终推荐
    const finalRecommendation = this.generateFinalRecommendation(
      system1Result,
      system2Result,
      conflicts,
      config
    );

    return {
      mode: 'PARALLEL',
      system1Result,
      system2Result,
      conflicts,
      differences,
      finalRecommendation,
      executionTimeline: {
        system1StartTime,
        system1EndTime,
        system2StartTime,
        system2EndTime,
        totalTime,
      },
      shouldShowSystem1First: config.showSystem1First && !!system1Result,
      system2Pending,
    };
  }

  /**
   * 顺序执行（当前默认模式）
   */
  private async executeSequential(
    request: CollaborationRequest,
    config: CollaborationConfig,
    startTime: number
  ): Promise<CollaborationResult> {
    const system1StartTime = Date.now();
    const system1Result = await this.executeSystem1(request, config);
    const system1EndTime = Date.now();

    // 根据System 1的结果决定是否需要System 2
    const needsSystem2 = this.shouldTriggerSystem2(system1Result, request);

    let system2Result: System2CollaborationResult | undefined;
    let system2StartTime = system1EndTime;
    let system2EndTime: number | undefined;

    if (needsSystem2) {
      system2StartTime = Date.now();
      system2Result = await this.executeSystem2(request, config);
      system2EndTime = Date.now();
    }

    const conflicts: Conflict[] = [];
    const differences: DifferenceExplanation[] = [];

    if (system1Result && system2Result && config.conflictDetectionEnabled) {
      const conflictResult = await this.detectConflicts(system1Result, system2Result, config);
      conflicts.push(...conflictResult.conflicts);
      differences.push(...conflictResult.differences);
    }

    const totalTime = Date.now() - startTime;
    const finalRecommendation = this.generateFinalRecommendation(
      system1Result,
      system2Result,
      conflicts,
      config
    );

    return {
      mode: 'SEQUENTIAL',
      system1Result,
      system2Result,
      conflicts,
      differences,
      finalRecommendation,
      executionTimeline: {
        system1StartTime,
        system1EndTime,
        system2StartTime,
        system2EndTime,
        totalTime,
      },
      shouldShowSystem1First: false,
      system2Pending: false,
    };
  }

  /**
   * 单系统执行
   */
  private async executeSingleSystem(
    request: CollaborationRequest,
    mode: CollaborationMode,
    config: CollaborationConfig,
    startTime: number
  ): Promise<CollaborationResult> {
    if (mode === 'SYSTEM1_ONLY') {
      const system1StartTime = Date.now();
      const system1Result = await this.executeSystem1(request, config);
      const system1EndTime = Date.now() + system1Result.executionTime;

      return {
        mode: 'SYSTEM1_ONLY',
        system1Result,
        conflicts: [],
        differences: [],
        finalRecommendation: {
          primarySystem: 'SYSTEM1',
          recommendation: system1Result.result.answerText || 'System 1 result',
          confidence: system1Result.confidence,
          explanation: 'Based on System 1 quick analysis',
        },
        executionTimeline: {
          system1StartTime,
          system1EndTime,
          system2StartTime: system1EndTime,
          totalTime: Date.now() - startTime,
        },
        shouldShowSystem1First: true,
        system2Pending: false,
      };
    } else {
      // SYSTEM2_ONLY
      const system2StartTime = Date.now();
      const system2Result = await this.executeSystem2(request, config);
      const system2EndTime = Date.now() + system2Result.executionTime;

      return {
        mode: 'SYSTEM2_ONLY',
        system2Result,
        conflicts: [],
        differences: [],
        finalRecommendation: {
          primarySystem: 'SYSTEM2',
          recommendation: 'Based on System 2 deep analysis',
          confidence: system2Result.confidence,
          explanation: 'Based on System 2 reasoning chain',
        },
        executionTimeline: {
          system1StartTime: system2StartTime,
          system2StartTime,
          system2EndTime,
          totalTime: Date.now() - startTime,
        },
        shouldShowSystem1First: false,
        system2Pending: false,
      };
    }
  }

  /**
   * 执行System 1
   */
  private async executeSystem1(
    request: CollaborationRequest,
    config: CollaborationConfig
  ): Promise<System1CollaborationResult> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        this.system1Executor.execute(request.route1, request.state),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('System 1 timeout')), config.system1Timeout)
        ),
      ]);

      const executionTime = Date.now() - startTime;

      return {
        result,
        executionTime,
        confidence: result.success ? 0.8 : 0.5, // System 1默认置信度
        dataSources: this.extractDataSources(result),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`System 1 execution error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 执行System 2
   * 
   * 调用System 2的执行逻辑（DAG Orchestrator、Claude Orchestrator或Legacy Orchestrator）
   */
  private async executeSystem2(
    request: CollaborationRequest,
    config: CollaborationConfig
  ): Promise<System2CollaborationResult> {
    const startTime = Date.now();
    const reasoningChain: string[] = [];
    const dataSources: string[] = [];

    try {
      let system2State: AgentState | undefined;
      let system2Result: any;

      // 优先使用DAG Orchestrator（Plan-and-Execute Agent）
      // 使用类属性访问
      const dagOrch = this.dagOrchestrator;
      const claudeOrch = this.claudeOrchestrator;
      const legacyOrch = this.legacyOrchestrator;

      if (dagOrch) {
        this.logger.debug('Using DAG Orchestrator for System 2');
        reasoningChain.push('Plan-and-Execute Agent');
        
        // 执行System 2（简化版本，实际需要完整的执行流程）
        // 注意：这里需要根据实际的DAGOrchestrator接口调用
        // 由于DAGOrchestrator的接口可能比较复杂，这里提供一个框架
        system2State = request.state;
        dataSources.push('DAG Orchestrator', 'Plan-and-Execute');
      } 
      // 其次使用Claude Orchestrator
      else if (claudeOrch) {
        this.logger.debug('Using Claude Orchestrator for System 2');
        reasoningChain.push('Claude State Machine');
        
        // 执行Claude状态机编排
        // 注意：这里需要根据实际的ClaudeOrchestrator接口调用
        system2State = request.state;
        dataSources.push('Claude Orchestrator', 'State Machine');
      } 
      // 降级到Legacy Orchestrator
      else if (legacyOrch) {
        this.logger.debug('Using Legacy Orchestrator for System 2');
        reasoningChain.push('ReAct Loop');
        
        // 执行ReAct循环
        // 注意：这里需要根据实际的OrchestratorService接口调用
        system2State = request.state;
        dataSources.push('Legacy Orchestrator', 'ReAct');
      } 
      // 如果没有可用的Orchestrator，返回错误
      else {
        throw new Error('No System 2 orchestrator available');
      }

      // 设置超时
      const system2Promise = Promise.resolve({
        state: system2State,
        result: {
          reasoning: 'System 2 deep analysis completed',
          state: system2State,
        },
      });

      const result = await Promise.race([
        system2Promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('System 2 timeout')), config.system2Timeout)
        ),
      ]);

      const executionTime = Date.now() - startTime;

      // 提取推理链（如果state中有相关信息）
      // 注意：AgentState的compute结构可能不包含reasoning_chain，这里使用类型断言
      const compute = system2State?.compute as Record<string, any> | undefined;
      if (compute && 'reasoning_chain' in compute) {
        const chain = compute.reasoning_chain;
        if (Array.isArray(chain)) {
          reasoningChain.push(...chain);
        }
      }

      // 提取数据源（如果state中有相关信息）
      // 注意：AgentState的memory结构可能不包含data_sources，这里使用类型断言
      const memory = system2State?.memory as Record<string, any> | undefined;
      if (memory && 'data_sources' in memory) {
        const sources = memory.data_sources;
        if (Array.isArray(sources)) {
          dataSources.push(...sources);
        }
      }

      return {
        result: result.result,
        executionTime,
        confidence: 0.9, // System 2默认置信度（实际应该从结果中提取）
        reasoningChain,
        dataSources: dataSources.length > 0 ? dataSources : ['Database', 'External API', 'LLM Reasoning'],
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`System 2 execution error: ${error.message}`, error.stack);
      
      // 即使失败也返回一个结果，但置信度较低
      const executionTime = Date.now() - startTime;
      return {
        result: {
          error: error.message,
          reasoning: 'System 2 execution failed',
        },
        executionTime,
        confidence: 0.3,
        reasoningChain: ['Error occurred'],
        dataSources: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 检测冲突
   */
  private async detectConflicts(
    system1Result: System1CollaborationResult,
    system2Result: System2CollaborationResult,
    config: CollaborationConfig
  ): Promise<{ conflicts: Conflict[]; differences: DifferenceExplanation[] }> {
    const conflicts: Conflict[] = [];
    const differences: DifferenceExplanation[] = [];

    // 1. 检测置信度差距
    const confidenceGap = Math.abs(system1Result.confidence - system2Result.confidence);
    if (confidenceGap > 0.3) {
      conflicts.push({
        type: 'CONFIDENCE_GAP',
        severity: confidenceGap > 0.5 ? 'HIGH' : 'MEDIUM',
        description: `System 1 confidence (${system1Result.confidence}) differs significantly from System 2 confidence (${system2Result.confidence})`,
        system1Value: system1Result.confidence,
        system2Value: system2Result.confidence,
        difference: `Confidence gap: ${confidenceGap.toFixed(2)}`,
        recommendation: confidenceGap > 0.5
          ? 'Consider waiting for System 2 analysis before making decision'
          : 'Both systems provide useful insights',
        requiresUserAttention: confidenceGap > 0.5,
      });
    }

    // 2. 检测数据源不一致
    const dataSourceOverlap = this.calculateDataSourceOverlap(
      system1Result.dataSources,
      system2Result.dataSources
    );
    if (dataSourceOverlap < 0.5) {
      conflicts.push({
        type: 'DATA_INCONSISTENCY',
        severity: 'MEDIUM',
        description: 'System 1 and System 2 used different data sources',
        system1Value: system1Result.dataSources,
        system2Value: system2Result.dataSources,
        difference: `Data source overlap: ${(dataSourceOverlap * 100).toFixed(0)}%`,
        recommendation: 'System 2 used more comprehensive data sources',
        requiresUserAttention: false,
      });

      differences.push({
        field: 'dataSources',
        system1Explanation: `System 1 used: ${system1Result.dataSources.join(', ')}`,
        system2Explanation: `System 2 used: ${system2Result.dataSources.join(', ')}`,
        reason: 'Different data sources may lead to different conclusions',
        recommendation: 'Consider System 2 analysis as more comprehensive',
      });
    }

    // 3. 检测结果分歧（需要根据实际结果结构进行检测）
    // 这里提供一个框架，实际实现需要根据具体的结果结构
    if (this.hasResultDivergence(system1Result.result, system2Result.result)) {
      conflicts.push({
        type: 'RESULT_DIVERGENCE',
        severity: 'HIGH',
        description: 'System 1 and System 2 produced different conclusions',
        system1Value: system1Result.result,
        system2Value: system2Result.result,
        difference: 'Different conclusions',
        recommendation: 'Review both analyses carefully',
        requiresUserAttention: true,
      });
    }

    return { conflicts, differences };
  }

  /**
   * 生成最终推荐
   */
  private generateFinalRecommendation(
    system1Result: System1CollaborationResult | undefined,
    system2Result: System2CollaborationResult | undefined,
    conflicts: Conflict[],
    config: CollaborationConfig
  ): CollaborationResult['finalRecommendation'] {
    const criticalConflicts = conflicts.filter(c => c.severity === 'CRITICAL' || c.severity === 'HIGH');

    // 如果有严重冲突，优先使用System 2
    if (criticalConflicts.length > 0 && system2Result) {
      return {
        primarySystem: 'SYSTEM2',
        recommendation: 'System 2 analysis recommended due to conflicts',
        confidence: system2Result.confidence,
        explanation: `System 2 provides more comprehensive analysis. ${criticalConflicts.length} critical conflict(s) detected.`,
      };
    }

    // 如果System 2可用且置信度更高，使用System 2
    if (system2Result && system2Result.confidence > (system1Result?.confidence || 0)) {
      return {
        primarySystem: 'SYSTEM2',
        recommendation: 'System 2 analysis recommended',
        confidence: system2Result.confidence,
        explanation: 'System 2 provides higher confidence analysis',
      };
    }

    // 如果两个系统都可用，综合推荐
    if (system1Result && system2Result) {
      return {
        primarySystem: 'BOTH',
        recommendation: 'Both systems provide valuable insights',
        confidence: (system1Result.confidence + system2Result.confidence) / 2,
        explanation: 'System 1 provides quick insights, System 2 provides deep analysis',
      };
    }

    // 仅System 1可用
    if (system1Result) {
      return {
        primarySystem: 'SYSTEM1',
        recommendation: system1Result.result.answerText || 'System 1 quick analysis',
        confidence: system1Result.confidence,
        explanation: 'Based on System 1 quick analysis',
      };
    }

    // 仅System 2可用
    if (system2Result) {
      return {
        primarySystem: 'SYSTEM2',
        recommendation: 'Based on System 2 deep analysis',
        confidence: system2Result.confidence,
        explanation: 'Based on System 2 reasoning chain',
      };
    }

    // 默认
    return {
      primarySystem: 'SYSTEM1',
      recommendation: 'Unable to generate recommendation',
      confidence: 0,
      explanation: 'No system results available',
    };
  }

  /**
   * 决定协作模式
   */
  private determineCollaborationMode(
    route1: RouteType,
    route2: RouteType,
    config: CollaborationConfig
  ): CollaborationMode {
    if (!config.enableParallelExecution) {
      return 'SEQUENTIAL';
    }

    // 如果两个路由都是System 1或都是System 2，不需要协作
    if (route1.startsWith('SYSTEM1') && route2.startsWith('SYSTEM1')) {
      return 'SYSTEM1_ONLY';
    }
    if (route1.startsWith('SYSTEM2') && route2.startsWith('SYSTEM2')) {
      return 'SYSTEM2_ONLY';
    }

    // 如果一个System 1，一个System 2，可以并行
    if (route1.startsWith('SYSTEM1') && route2.startsWith('SYSTEM2')) {
      return 'PARALLEL';
    }
    if (route1.startsWith('SYSTEM2') && route2.startsWith('SYSTEM1')) {
      return 'PARALLEL';
    }

    return 'SEQUENTIAL';
  }

  /**
   * 判断是否应该触发System 2
   */
  private shouldTriggerSystem2(
    system1Result: System1CollaborationResult,
    request: CollaborationRequest
  ): boolean {
    // 使用request参数以避免"必选参数不能位于可选参数后"的错误
    void request;
    // 如果System 1置信度低，触发System 2
    if (system1Result.confidence < 0.6) {
      return true;
    }

    // 如果System 1执行失败，触发System 2
    if (!system1Result.result.success) {
      return true;
    }

    // 可以根据其他条件判断
    return false;
  }

  /**
   * 提取数据源
   */
  private extractDataSources(result: any): string[] {
    // 根据实际结果结构提取数据源
    // 这里提供一个简单的实现
    const sources: string[] = [];
    if (result.cardType) {
      sources.push('System1InfoCard');
    }
    if (result.result) {
      sources.push('API');
    }
    return sources;
  }

  /**
   * 计算数据源重叠度
   */
  private calculateDataSourceOverlap(sources1: string[], sources2: string[]): number {
    const set1 = new Set(sources1);
    const set2 = new Set(sources2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * 检测结果分歧
   */
  private hasResultDivergence(result1: any, result2: any): boolean {
    // 根据实际结果结构检测分歧
    // 这里提供一个简单的实现框架
    // 实际实现需要根据具体的结果结构进行比较
    if (!result1 || !result2) {
      return false;
    }

    // 可以比较关键字段，如推荐、结论等
    // 这里暂时返回false，实际实现需要根据具体业务逻辑
    return false;
  }
}
