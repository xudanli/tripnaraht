// src/agent/services/action-dependency-analyzer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Action, ActionMetadata } from '../interfaces/action.interface';
import { AgentState } from '../interfaces/agent-state.interface';
import { ActionRegistryService } from './action-registry.service';

/**
 * Action 依赖项
 */
interface ActionDependency {
  actionName: string;
  preconditions: string[];
  sideEffects: string[]; // 可能修改的状态路径
}

/**
 * Action Dependency Analyzer Service
 * 
 * 分析 Action 之间的依赖关系，确定哪些 Actions 可以并行执行
 */
@Injectable()
export class ActionDependencyAnalyzerService {
  private readonly logger = new Logger(ActionDependencyAnalyzerService.name);

  constructor(private actionRegistry: ActionRegistryService) {}

  /**
   * 分析可以并行执行的 Actions
   * 
   * 判断逻辑：
   * 1. Actions 的前置条件都已满足
   * 2. Actions 之间没有依赖关系（一个 Action 的输出不依赖另一个 Action 的输出）
   * 3. Actions 的副作用不冲突（不会同时修改相同的状态路径）
   * 
   * @param candidateActions 候选 Actions
   * @param state 当前状态
   * @returns 可以并行执行的 Actions 列表
   */
  findParallelizableActions(
    candidateActions: Array<{ name: string; input: any }>,
    state: AgentState
  ): Array<{ name: string; input: any }>[] {
    if (candidateActions.length === 0) {
      return [];
    }

    // 分析每个 Action 的依赖
    const dependencies = candidateActions.map(action => {
      const actionDef = this.actionRegistry.get(action.name);
      if (!actionDef) {
        return null;
      }
      return this.analyzeActionDependency(action, actionDef, state);
    }).filter(Boolean) as ActionDependency[];

    // 构建依赖图，找出可以并行执行的分组
    const parallelGroups: Array<{ name: string; input: any }>[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < candidateActions.length; i++) {
      if (processed.has(i)) {
        continue;
      }

      const currentGroup: Array<{ name: string; input: any }> = [candidateActions[i]];
      processed.add(i);
      const currentDeps = dependencies[i];

      // 查找可以与此 Action 并行执行的其他 Actions
      for (let j = i + 1; j < candidateActions.length; j++) {
        if (processed.has(j)) {
          continue;
        }

        const otherDeps = dependencies[j];
        if (this.canExecuteInParallel(currentDeps, otherDeps)) {
          currentGroup.push(candidateActions[j]);
          processed.add(j);
        }
      }

      if (currentGroup.length > 0) {
        parallelGroups.push(currentGroup);
      }
    }

    return parallelGroups;
  }

  /**
   * 分析单个 Action 的依赖关系
   */
  private analyzeActionDependency(
    action: { name: string; input: any },
    actionDef: Action,
    state: AgentState
  ): ActionDependency {
    // 提取前置条件（已实现）
    const preconditions = actionDef.metadata.preconditions || [];

    // 推断可能的副作用（基于 metadata.side_effect 和 action name）
    const sideEffects = this.inferSideEffects(actionDef.metadata, action.name);

    return {
      actionName: action.name,
      preconditions,
      sideEffects,
    };
  }

  /**
   * 推断 Action 可能影响的状态路径
   */
  private inferSideEffects(metadata: ActionMetadata, actionName: string): string[] {
    const sideEffects: string[] = [];

    // 根据 metadata.side_effect 推断
    if (metadata.side_effect === 'writes_db') {
      // 数据库写入可能影响多个状态路径，需要根据 Action 名称推断
      if (actionName.includes('trip')) {
        sideEffects.push('trip');
        sideEffects.push('draft');
      }
      if (actionName.includes('places')) {
        sideEffects.push('memory.semantic_facts.pois');
      }
      if (actionName.includes('transport')) {
        sideEffects.push('compute.time_matrix_api');
        sideEffects.push('compute.time_matrix_robust');
      }
    } else if (metadata.side_effect === 'calls_api') {
      // API 调用通常只读取数据，不修改状态
      // 但可能更新 compute 中的缓存数据
      if (actionName.includes('places')) {
        sideEffects.push('memory.semantic_facts.pois');
      }
      if (actionName.includes('transport')) {
        sideEffects.push('compute.time_matrix_api');
      }
    }

    // 根据 Action 名称模式推断
    if (actionName.startsWith('places.resolve_entities')) {
      sideEffects.push('draft.nodes');
    }
    if (actionName.startsWith('places.get_poi_facts')) {
      sideEffects.push('memory.semantic_facts.pois');
    }
    if (actionName.startsWith('transport.build_time_matrix')) {
      sideEffects.push('compute.time_matrix_api');
      sideEffects.push('compute.time_matrix_robust');
    }
    if (actionName.startsWith('itinerary.optimize')) {
      sideEffects.push('compute.optimization_results');
      sideEffects.push('result.timeline');
    }
    if (actionName.startsWith('policy.validate')) {
      // 验证操作通常不修改状态
      sideEffects.push('result.status');
    }

    return sideEffects;
  }

  /**
   * 判断两个 Actions 是否可以并行执行
   */
  private canExecuteInParallel(
    dep1: ActionDependency,
    dep2: ActionDependency
  ): boolean {
    // 规则 1: 如果一个 Action 的副作用会影响另一个 Action 的前置条件，不能并行
    for (const sideEffect of dep1.sideEffects) {
      for (const precondition of dep2.preconditions) {
        if (this.pathOverlaps(sideEffect, precondition)) {
          this.logger.debug(
            `Actions cannot run in parallel: ${dep1.actionName} affects ${sideEffect} ` +
            `which is required by ${dep2.actionName} (${precondition})`
          );
          return false;
        }
      }
    }

    for (const sideEffect of dep2.sideEffects) {
      for (const precondition of dep1.preconditions) {
        if (this.pathOverlaps(sideEffect, precondition)) {
          this.logger.debug(
            `Actions cannot run in parallel: ${dep2.actionName} affects ${sideEffect} ` +
            `which is required by ${dep1.actionName} (${precondition})`
          );
          return false;
        }
      }
    }

    // 规则 2: 如果两个 Actions 会修改相同的状态路径，不能并行（避免竞争条件）
    for (const sideEffect1 of dep1.sideEffects) {
      for (const sideEffect2 of dep2.sideEffects) {
        if (this.pathOverlaps(sideEffect1, sideEffect2)) {
          this.logger.debug(
            `Actions cannot run in parallel: both ${dep1.actionName} and ${dep2.actionName} ` +
            `modify ${sideEffect1}/${sideEffect2}`
          );
          return false;
        }
      }
    }

    // 规则 3: 如果前置条件满足且没有冲突，可以并行
    return true;
  }

  /**
   * 判断两个状态路径是否重叠
   * 
   * 例如：
   * - "draft.nodes" 和 "draft.nodes" -> true
   * - "draft.nodes" 和 "draft" -> true (父路径)
   * - "memory.pois" 和 "memory.semantic_facts.pois" -> true (子路径)
   */
  private pathOverlaps(path1: string, path2: string): boolean {
    if (path1 === path2) {
      return true;
    }

    // 检查是否是父路径/子路径关系
    const parts1 = path1.split('.');
    const parts2 = path2.split('.');

    // 检查 path1 是否是 path2 的前缀
    if (parts1.length <= parts2.length) {
      const isPrefix = parts1.every((part, index) => part === parts2[index]);
      if (isPrefix) {
        return true;
      }
    }

    // 检查 path2 是否是 path1 的前缀
    if (parts2.length <= parts1.length) {
      const isPrefix = parts2.every((part, index) => part === parts1[index]);
      if (isPrefix) {
        return true;
      }
    }

    return false;
  }
}

