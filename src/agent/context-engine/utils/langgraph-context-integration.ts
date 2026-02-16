// src/agent/context-engine/utils/langgraph-context-integration.ts
/**
 * LangGraph Context Integration Utilities
 * 
 * 提供辅助函数，让每个 LangGraph 节点可以轻松集成 Context Engineer
 */

import { ContextEngineerService } from '../services/context-engineer.service';
import { ContextPackageOptions, ContextPackage } from '../types/context-package.types';
import { LangGraphState } from '../../../trips/decision/orchestration/langgraph-orchestrator.interface';
import type { TripTaskPhase } from '../interfaces/trip-task-memory.interface';

/**
 * 在每个节点开始时构建上下文包
 * 
 * 用法：
 * ```typescript
 * async function myNode(state: LangGraphState, contextEngineer: ContextEngineerService) {
 *   const ctx = await buildContextForNode(state, contextEngineer, {
 *     agent: 'PLANNER',
 *     phase: 'planning',
 *   });
 *   
 *   // 使用 ctx.contextPackage.blocks 构建 prompt
 *   // ...
 * }
 * ```
 */
export async function buildContextForNode(
  state: LangGraphState,
  contextEngineer: ContextEngineerService,
  options: {
    agent: string;
    phase: string;
    tokenBudget?: number;
    requiredTopics?: string[];
  },
): Promise<{ contextPackage: ContextPackage; projection?: any }> {
  const contextOptions: ContextPackageOptions = {
    tripId: state.metadata?.tripId as string | undefined,
    userId: state.metadata?.userId as string | undefined,
    phase: options.phase,
    agent: options.agent,
    userQuery: state.userQuery,
    tokenBudget: options.tokenBudget,
    requiredTopics: options.requiredTopics,
    includePrivate: false, // 默认只包含 public blocks
  };

  const contextPackage = await contextEngineer.build(contextOptions);

  // 如果需要，也可以投影状态
  let projection;
  if (state.metadata?.tripState) {
    projection = await contextEngineer.projectState(state.metadata.tripState, {
      tokenBudget: options.tokenBudget,
    });
  }

  return {
    contextPackage,
    projection,
  };
}

/**
 * 在每个节点结束时写入回写（Write Back）
 * 
 * 用法：
 * ```typescript
 * async function myNode(state: LangGraphState, contextEngineer: ContextEngineerService) {
 *   // ... 节点逻辑
 *   
 *   // 节点结束
 *   await writeBackFromNode(
 *     state,
 *     contextEngineer,
 *     {
 *       tripRunId: state.metadata?.tripRunId as string,
 *       attemptNumber: state.metadata?.attemptNumber as number || 1,
 *       scratchpad: {
 *         planOutline: '已完成的计划...',
 *         nextActions: ['decision.abuCheck', 'decision.drdrePace'],
 *       },
 *       decisionLogDelta: [...],
 *       artifactsRefs: {...},
 *       phase: 'decision',  // 可选，用于 TripTaskMemory.currentPhase 更新
 *     }
 *   );
 * }
 * ```
 */
export async function writeBackFromNode(
  state: LangGraphState,
  contextEngineer: ContextEngineerService,
  data: {
    tripRunId: string;
    attemptNumber?: number;
    tripId?: string; // 可选，用于 TripTaskMemory 更新（若无则从 tripRunId 解析）
    phase?: TripTaskPhase; // 可选，用于 TripTaskMemory.currentPhase 更新
    scratchpad: {
      planOutline?: string;
      openQuestions?: string[];
      constraintsAssumed?: string[];
      nextActions?: string[];
      failureNotes?: string;
    };
    decisionLogDelta?: any[];
    artifactsRefs?: Record<string, string>;
  },
): Promise<void> {
  await contextEngineer.writeBack(
    data.tripRunId,
    data.attemptNumber || 1,
    data.scratchpad,
    data.decisionLogDelta,
    data.artifactsRefs,
    data.tripId || data.phase ? { tripId: data.tripId, phase: data.phase } : undefined,
  );
}

/** 将 planningPhase / phase 字符串映射为 TripTaskPhase */
export function mapPhaseToTripTaskPhase(phase?: string): TripTaskPhase | undefined {
  if (!phase) return undefined;
  const p = phase.toLowerCase();
  if (p.includes('intake') || p.includes('drafting')) return 'intake';
  if (p.includes('route') || p.includes('selection')) return 'route_selection';
  if (p.includes('poi') || p.includes('candidate')) return 'poi_candidate';
  if (p.includes('decision') || p.includes('adjustment') || p.includes('repair')) return 'decision';
  if (p.includes('confirm') || p.includes('finaliz') || p.includes('readiness') || p === 'done') return 'confirm';
  return undefined;
}

/**
 * 从 Context Package 构建 LLM Prompt
 * 
 * 将 ContextPackage 转换为 LLM 可以理解的 prompt 文本
 */
export function buildPromptFromContextPackage(contextPackage: ContextPackage): string {
  const publicBlocks = contextPackage.blocks.filter((b) => b.visibility === 'public');
  
  // 按优先级排序
  publicBlocks.sort((a, b) => b.priority - a.priority);
  
  // 构建 prompt 文本
  const sections: string[] = [];
  
  for (const block of publicBlocks) {
    sections.push(`## ${block.key} (优先级: ${block.priority})`);
    sections.push(block.text);
    if (block.data) {
      sections.push(`\n[结构化数据] ${JSON.stringify(block.data, null, 2)}`);
    }
    sections.push('');
  }
  
  return sections.join('\n');
}