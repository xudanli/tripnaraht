// src/agent/services/decision-replay.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionNode, DecisionOutput, TradeoffDimension } from '../interfaces/decision-node.interface';
import { DecisionLogEntry, OrchestratorState } from '../interfaces/trip-plan.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 决策快照
 */
export interface DecisionSnapshot {
  snapshot_id: string;
  timestamp: string;
  state: OrchestratorState;
  decision_node?: DecisionNode;
  decision_output?: DecisionOutput;
  metadata: {
    step: string;
    actor: string;
    trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT';
  };
}

/**
 * 决策时间线
 */
export interface DecisionTimeline {
  trip_run_id: string;
  created_at: string;
  snapshots: DecisionSnapshot[];
  key_decision_points: Array<{
    snapshot_id: string;
    description: string;
    importance: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  total_duration_ms: number;
}

/**
 * What-If 模拟输入
 */
export interface WhatIfInput {
  base_snapshot_id: string;
  changes: Array<{
    type: 'PREFERENCE_CHANGE' | 'CONSTRAINT_CHANGE' | 'OPTION_CHANGE' | 'DATE_CHANGE';
    field: string;
    original_value: any;
    new_value: any;
  }>;
}

/**
 * What-If 模拟结果
 */
export interface WhatIfResult {
  original_snapshot_id: string;
  simulated_output: DecisionOutput;
  comparison: {
    score_change: number;
    ranking_changes: Array<{ option_id: string; old_rank: number; new_rank: number }>;
    tradeoff_changes: Record<TradeoffDimension, { old: number; new: number; change: number }>;
  };
  insights: string[];
}

/**
 * 决策风格模型
 */
export interface DecisionStyleModel {
  user_id?: string;
  inferred_preferences: {
    pace: 'SLOW' | 'BALANCED' | 'FAST';
    priority: TradeoffDimension;
    risk_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
    budget_sensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  patterns: Array<{
    pattern: string;
    frequency: number;
    confidence: number;
  }>;
  learning_signals: Array<{
    signal_type: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'QUESTION';
    context: string;
    timestamp: string;
  }>;
}

/**
 * Decision Replay Service
 * 
 * AI-Native 决策回放服务
 * 
 * 核心功能：
 * - 决策快照管理
 * - 决策时间线构建
 * - What-If 模拟
 * - 决策风格学习
 * 
 * 设计原则：
 * - 可回溯：任何决策点都可以回放
 * - 可逆：用户可以撤销并尝试不同选择
 * - 可学习：从用户反馈中学习偏好
 */
@Injectable()
export class DecisionReplayService {
  private readonly logger = new Logger(DecisionReplayService.name);
  
  // 内存缓存（用于快速访问，数据库为持久化存储）
  private timelinesCache: Map<string, DecisionTimeline> = new Map();
  private styleModelsCache: Map<string, DecisionStyleModel> = new Map();

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.logger.log('[DecisionReplay] Initialized' + (prisma ? ' with Prisma persistence' : ' (memory only)'));
  }

  // ============================================================================
  // 快照管理
  // ============================================================================

  /**
   * 创建决策快照
   */
  createSnapshot(
    state: OrchestratorState,
    trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT',
    decisionNode?: DecisionNode,
    decisionOutput?: DecisionOutput,
  ): DecisionSnapshot {
    const snapshot: DecisionSnapshot = {
      snapshot_id: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      state: this.cloneState(state),
      decision_node: decisionNode,
      decision_output: decisionOutput,
      metadata: {
        step: state.current_step,
        actor: this.inferActor(state),
        trigger,
      },
    };

    // 添加到时间线
    this.addToTimeline(state.request_id, snapshot);

    this.logger.debug(`[DecisionReplay] Created snapshot: ${snapshot.snapshot_id} at step ${state.current_step}`);

    return snapshot;
  }

  /**
   * 获取快照
   */
  getSnapshot(tripRunId: string, snapshotId: string): DecisionSnapshot | undefined {
    const timeline = this.timelinesCache.get(tripRunId);
    return timeline?.snapshots.find(s => s.snapshot_id === snapshotId);
  }

  /**
   * 获取最新快照
   */
  getLatestSnapshot(tripRunId: string): DecisionSnapshot | undefined {
    const timeline = this.timelinesCache.get(tripRunId);
    return timeline?.snapshots[timeline.snapshots.length - 1];
  }

  // ============================================================================
  // 时间线管理
  // ============================================================================

  /**
   * 获取决策时间线
   */
  getTimeline(tripRunId: string): DecisionTimeline | undefined {
    return this.timelinesCache.get(tripRunId);
  }

  /**
   * 从数据库加载时间线（异步）
   */
  async loadTimelineFromDB(tripRunId: string): Promise<DecisionTimeline | undefined> {
    if (!this.prisma) return this.timelinesCache.get(tripRunId);

    try {
      const snapshots = await this.prisma.$queryRaw<any[]>`
        SELECT snapshot_id, timestamp, step, actor, trigger, state, decision_node, decision_output
        FROM decision_snapshots
        WHERE trip_run_id = ${tripRunId}
        ORDER BY timestamp ASC
      `;

      if (snapshots.length === 0) return undefined;

      const timelineRecord = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM decision_timelines WHERE trip_run_id = ${tripRunId}
      `;

      const timeline: DecisionTimeline = {
        trip_run_id: tripRunId,
        created_at: timelineRecord[0]?.created_at || snapshots[0]?.timestamp,
        snapshots: snapshots.map((s: any) => ({
          snapshot_id: s.snapshot_id,
          timestamp: s.timestamp,
          state: s.state,
          decision_node: s.decision_node,
          decision_output: s.decision_output,
          metadata: { step: s.step, actor: s.actor, trigger: s.trigger },
        })),
        key_decision_points: timelineRecord[0]?.key_decision_points || [],
        total_duration_ms: timelineRecord[0]?.total_duration_ms || 0,
      };

      // 更新缓存
      this.timelinesCache.set(tripRunId, timeline);
      return timeline;
    } catch (e: any) {
      this.logger.warn(`[DecisionReplay] Failed to load timeline from DB: ${e?.message}`);
      return this.timelinesCache.get(tripRunId);
    }
  }

  /**
   * 构建决策时间线摘要
   */
  buildTimelineSummary(tripRunId: string): {
    total_snapshots: number;
    key_decisions: number;
    duration_ms: number;
    phases: Array<{ phase: string; snapshots: number; duration_ms: number }>;
  } | undefined {
    const timeline = this.timelinesCache.get(tripRunId);
    if (!timeline) return undefined;

    // 按阶段分组
    const phaseMap = new Map<string, { snapshots: number; start: number; end: number }>();
    for (const snap of timeline.snapshots) {
      const phase = snap.metadata.step;
      const ts = new Date(snap.timestamp).getTime();
      const existing = phaseMap.get(phase);
      if (existing) {
        existing.snapshots++;
        existing.end = Math.max(existing.end, ts);
      } else {
        phaseMap.set(phase, { snapshots: 1, start: ts, end: ts });
      }
    }

    const phases = Array.from(phaseMap.entries()).map(([phase, data]) => ({
      phase,
      snapshots: data.snapshots,
      duration_ms: data.end - data.start,
    }));

    return {
      total_snapshots: timeline.snapshots.length,
      key_decisions: timeline.key_decision_points.length,
      duration_ms: timeline.total_duration_ms,
      phases,
    };
  }

  // ============================================================================
  // 决策回放
  // ============================================================================

  /**
   * 回放到指定快照
   */
  replayToSnapshot(tripRunId: string, snapshotId: string): {
    restored_state: OrchestratorState;
    skipped_steps: string[];
    replay_point: string;
  } | undefined {
    const timeline = this.timelinesCache.get(tripRunId);
    if (!timeline) return undefined;

    const snapshotIndex = timeline.snapshots.findIndex(s => s.snapshot_id === snapshotId);
    if (snapshotIndex === -1) return undefined;

    const targetSnapshot = timeline.snapshots[snapshotIndex];
    const skippedSteps = timeline.snapshots
      .slice(snapshotIndex + 1)
      .map(s => s.metadata.step);

    this.logger.debug(`[DecisionReplay] Replaying to snapshot: ${snapshotId}, skipping ${skippedSteps.length} steps`);

    return {
      restored_state: this.cloneState(targetSnapshot.state),
      skipped_steps: skippedSteps,
      replay_point: targetSnapshot.metadata.step,
    };
  }

  /**
   * 获取决策点之间的差异
   */
  getDiffBetweenSnapshots(
    tripRunId: string,
    fromSnapshotId: string,
    toSnapshotId: string,
  ): {
    state_changes: Array<{ field: string; from: any; to: any }>;
    decision_changes: Array<{ aspect: string; description: string }>;
    time_elapsed_ms: number;
  } | undefined {
    const fromSnap = this.getSnapshot(tripRunId, fromSnapshotId);
    const toSnap = this.getSnapshot(tripRunId, toSnapshotId);
    if (!fromSnap || !toSnap) return undefined;

    const stateChanges: Array<{ field: string; from: any; to: any }> = [];
    const decisionChanges: Array<{ aspect: string; description: string }> = [];

    // 比较状态变化
    if (fromSnap.state.current_step !== toSnap.state.current_step) {
      stateChanges.push({ field: 'current_step', from: fromSnap.state.current_step, to: toSnap.state.current_step });
    }

    // 比较决策输出变化
    if (fromSnap.decision_output && toSnap.decision_output) {
      const fromTop = fromSnap.decision_output.ranked_plans[0];
      const toTop = toSnap.decision_output.ranked_plans[0];
      if (fromTop?.plan.id !== toTop?.plan.id) {
        decisionChanges.push({
          aspect: 'recommendation',
          description: `Changed from "${fromTop?.plan.name}" to "${toTop?.plan.name}"`,
        });
      }
    }

    const timeElapsed = new Date(toSnap.timestamp).getTime() - new Date(fromSnap.timestamp).getTime();

    return {
      state_changes: stateChanges,
      decision_changes: decisionChanges,
      time_elapsed_ms: timeElapsed,
    };
  }

  // ============================================================================
  // What-If 模拟
  // ============================================================================

  /**
   * 执行 What-If 模拟
   */
  simulateWhatIf(input: WhatIfInput, decisionOutput: DecisionOutput): WhatIfResult {
    this.logger.debug(`[DecisionReplay] Simulating what-if from snapshot: ${input.base_snapshot_id}`);

    // 克隆原始输出
    const simulated = JSON.parse(JSON.stringify(decisionOutput)) as DecisionOutput;

    // 应用变化
    for (const change of input.changes) {
      this.applyWhatIfChange(simulated, change);
    }

    // 重新计算分数和排名
    this.recalculateScores(simulated);

    // 计算比较结果
    const comparison = this.compareOutputs(decisionOutput, simulated);

    // 生成洞察
    const insights = this.generateWhatIfInsights(input.changes, comparison);

    return {
      original_snapshot_id: input.base_snapshot_id,
      simulated_output: simulated,
      comparison,
      insights,
    };
  }

  /**
   * 生成反事实问题
   */
  generateCounterfactualQuestions(decisionOutput: DecisionOutput): Array<{
    question: string;
    what_if_input: WhatIfInput;
    expected_impact: string;
  }> {
    const questions: Array<{
      question: string;
      what_if_input: WhatIfInput;
      expected_impact: string;
    }> = [];

    const topPlan = decisionOutput.ranked_plans[0];
    if (!topPlan) return questions;

    // 问题1：如果优先考虑成本会怎样？
    questions.push({
      question: 'What if I prioritize budget over experience?',
      what_if_input: {
        base_snapshot_id: '',
        changes: [{
          type: 'PREFERENCE_CHANGE',
          field: 'priority',
          original_value: 'EXPERIENCE',
          new_value: 'COST',
        }],
      },
      expected_impact: 'May recommend a more budget-friendly option',
    });

    // 问题2：如果接受更高风险会怎样？
    if (topPlan.tradeoffs.RISK.value < 50) {
      questions.push({
        question: 'What if I accept higher risk for better experiences?',
        what_if_input: {
          base_snapshot_id: '',
          changes: [{
            type: 'PREFERENCE_CHANGE',
            field: 'risk_tolerance',
            original_value: 'LOW',
            new_value: 'HIGH',
          }],
        },
        expected_impact: 'May unlock more adventurous options',
      });
    }

    // 问题3：如果选择第二推荐会怎样？
    if (decisionOutput.ranked_plans.length > 1) {
      const secondPlan = decisionOutput.ranked_plans[1];
      questions.push({
        question: `What if I choose "${secondPlan.plan.name}" instead?`,
        what_if_input: {
          base_snapshot_id: '',
          changes: [{
            type: 'OPTION_CHANGE',
            field: 'selected_option',
            original_value: topPlan.plan.id,
            new_value: secondPlan.plan.id,
          }],
        },
        expected_impact: `Trade ${topPlan.what_you_get} for ${secondPlan.what_you_get}`,
      });
    }

    return questions;
  }

  // ============================================================================
  // 决策风格学习
  // ============================================================================

  /**
   * 记录学习信号
   */
  recordLearningSignal(
    userId: string,
    signalType: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'QUESTION',
    context: string,
  ): void {
    const model = this.getOrCreateStyleModel(userId);
    model.learning_signals.push({
      signal_type: signalType,
      context,
      timestamp: new Date().toISOString(),
    });

    // 更新推断的偏好
    this.updateInferredPreferences(model);

    this.logger.debug(`[DecisionReplay] Recorded learning signal: ${signalType} for user ${userId}`);
  }

  /**
   * 获取用户决策风格
   */
  getDecisionStyle(userId: string): DecisionStyleModel | undefined {
    return this.styleModelsCache.get(userId);
  }

  /**
   * 基于历史学习推荐偏好
   */
  inferPreferencesFromHistory(userId: string): {
    suggested_priority: TradeoffDimension;
    suggested_risk_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
    confidence: number;
    reasoning: string;
  } {
    const model = this.styleModelsCache.get(userId);
    if (!model || model.learning_signals.length < 3) {
      return {
        suggested_priority: 'EXPERIENCE',
        suggested_risk_tolerance: 'MEDIUM',
        confidence: 0.3,
        reasoning: 'Insufficient history - using defaults',
      };
    }

    return {
      suggested_priority: model.inferred_preferences.priority,
      suggested_risk_tolerance: model.inferred_preferences.risk_tolerance,
      confidence: Math.min(0.9, 0.3 + model.learning_signals.length * 0.05),
      reasoning: `Based on ${model.learning_signals.length} previous interactions`,
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private cloneState(state: OrchestratorState): OrchestratorState {
    return JSON.parse(JSON.stringify(state));
  }

  private inferActor(state: OrchestratorState): string {
    const stepActorMap: Record<string, string> = {
      'INTAKE': 'Planner',
      'RESEARCH': 'LocalInsight',
      'GATE_EVAL': 'Gatekeeper',
      'PLAN_GEN': 'CoreDecision',
      'VERIFY': 'Compliance',
      'REPAIR': 'LocalInsight',
      'NARRATE': 'Narrator',
      'DONE': 'Orchestrator',
    };
    return stepActorMap[state.current_step] || 'Orchestrator';
  }

  private addToTimeline(tripRunId: string, snapshot: DecisionSnapshot): void {
    // 更新内存缓存
    let timeline = this.timelinesCache.get(tripRunId);
    if (!timeline) {
      timeline = {
        trip_run_id: tripRunId,
        created_at: new Date().toISOString(),
        snapshots: [],
        key_decision_points: [],
        total_duration_ms: 0,
      };
      this.timelinesCache.set(tripRunId, timeline);
    }

    timeline.snapshots.push(snapshot);

    // 标记关键决策点
    if (['GATE_EVAL', 'PLAN_GEN', 'VERIFY'].includes(snapshot.metadata.step)) {
      timeline.key_decision_points.push({
        snapshot_id: snapshot.snapshot_id,
        description: `${snapshot.metadata.step} completed`,
        importance: snapshot.metadata.step === 'GATE_EVAL' ? 'HIGH' : 'MEDIUM',
      });
    }

    // 更新总时长
    if (timeline.snapshots.length > 1) {
      const first = new Date(timeline.snapshots[0].timestamp).getTime();
      const last = new Date(snapshot.timestamp).getTime();
      timeline.total_duration_ms = last - first;
    }

    // 异步持久化到数据库
    this.persistSnapshot(snapshot, timeline).catch(e => 
      this.logger.warn(`[DecisionReplay] Failed to persist snapshot: ${e?.message}`)
    );
  }

  /**
   * 持久化快照到数据库
   */
  private async persistSnapshot(snapshot: DecisionSnapshot, timeline: DecisionTimeline): Promise<void> {
    if (!this.prisma) return;

    try {
      // 保存快照
      await this.prisma.$executeRaw`
        INSERT INTO decision_snapshots (snapshot_id, trip_run_id, timestamp, step, actor, trigger, state, decision_node, decision_output)
        VALUES (${snapshot.snapshot_id}, ${timeline.trip_run_id}, ${snapshot.timestamp}::timestamptz, ${snapshot.metadata.step}, ${snapshot.metadata.actor}, ${snapshot.metadata.trigger}, ${JSON.stringify(snapshot.state)}::jsonb, ${snapshot.decision_node ? JSON.stringify(snapshot.decision_node) : null}::jsonb, ${snapshot.decision_output ? JSON.stringify(snapshot.decision_output) : null}::jsonb)
        ON CONFLICT (snapshot_id) DO NOTHING
      `;

      // 更新时间线
      await this.prisma.$executeRaw`
        INSERT INTO decision_timelines (trip_run_id, total_duration_ms, key_decision_points)
        VALUES (${timeline.trip_run_id}, ${timeline.total_duration_ms}, ${JSON.stringify(timeline.key_decision_points)}::jsonb)
        ON CONFLICT (trip_run_id) DO UPDATE SET 
          total_duration_ms = ${timeline.total_duration_ms},
          key_decision_points = ${JSON.stringify(timeline.key_decision_points)}::jsonb,
          updated_at = NOW()
      `;
    } catch (e: any) {
      this.logger.warn(`[DecisionReplay] DB persist error: ${e?.message}`);
    }
  }

  private applyWhatIfChange(output: DecisionOutput, change: WhatIfInput['changes'][0]): void {
    if (change.type === 'PREFERENCE_CHANGE') {
      if (change.field === 'priority') {
        // 调整权重
        for (const plan of output.ranked_plans) {
          const newPriority = change.new_value as TradeoffDimension;
          const boost = 20;
          plan.tradeoffs[newPriority].value = Math.min(100, plan.tradeoffs[newPriority].value + boost);
        }
      }
    }
  }

  private recalculateScores(output: DecisionOutput): void {
    for (const plan of output.ranked_plans) {
      plan.plan.score = (
        plan.tradeoffs.TIME.value * 0.25 +
        plan.tradeoffs.COST.value * 0.25 +
        plan.tradeoffs.EXPERIENCE.value * 0.30 +
        (100 - plan.tradeoffs.RISK.value) * 0.20
      );
    }
    output.ranked_plans.sort((a, b) => b.plan.score - a.plan.score);
    output.ranked_plans.forEach((p, i) => { p.rank = i + 1; });
  }

  private compareOutputs(original: DecisionOutput, simulated: DecisionOutput): WhatIfResult['comparison'] {
    const scoreChange = simulated.ranked_plans[0]?.plan.score - original.ranked_plans[0]?.plan.score || 0;

    const rankingChanges: Array<{ option_id: string; old_rank: number; new_rank: number }> = [];
    for (const origPlan of original.ranked_plans) {
      const simPlan = simulated.ranked_plans.find(p => p.plan.id === origPlan.plan.id);
      if (simPlan && simPlan.rank !== origPlan.rank) {
        rankingChanges.push({
          option_id: origPlan.plan.id,
          old_rank: origPlan.rank,
          new_rank: simPlan.rank,
        });
      }
    }

    const dimensions: TradeoffDimension[] = ['TIME', 'COST', 'EXPERIENCE', 'RISK'];
    const tradeoffChanges = {} as Record<TradeoffDimension, { old: number; new: number; change: number }>;
    for (const dim of dimensions) {
      const oldVal = original.ranked_plans[0]?.tradeoffs[dim].value || 0;
      const newVal = simulated.ranked_plans[0]?.tradeoffs[dim].value || 0;
      tradeoffChanges[dim] = { old: oldVal, new: newVal, change: newVal - oldVal };
    }

    return { score_change: scoreChange, ranking_changes: rankingChanges, tradeoff_changes: tradeoffChanges };
  }

  private generateWhatIfInsights(changes: WhatIfInput['changes'], comparison: WhatIfResult['comparison']): string[] {
    const insights: string[] = [];

    if (comparison.score_change > 5) {
      insights.push('This change would improve your overall score');
    } else if (comparison.score_change < -5) {
      insights.push('This change would lower your overall score');
    }

    if (comparison.ranking_changes.length > 0) {
      insights.push(`${comparison.ranking_changes.length} option(s) would change ranking`);
    }

    for (const change of changes) {
      if (change.type === 'PREFERENCE_CHANGE') {
        insights.push(`Prioritizing ${change.new_value} affects your trade-off balance`);
      }
    }

    return insights;
  }

  private getOrCreateStyleModel(userId: string): DecisionStyleModel {
    let model = this.styleModelsCache.get(userId);
    if (!model) {
      model = {
        user_id: userId,
        inferred_preferences: {
          pace: 'BALANCED',
          priority: 'EXPERIENCE',
          risk_tolerance: 'MEDIUM',
          budget_sensitivity: 'MEDIUM',
        },
        patterns: [],
        learning_signals: [],
      };
      this.styleModelsCache.set(userId, model);
    }
    return model;
  }

  private updateInferredPreferences(model: DecisionStyleModel): void {
    const signals = model.learning_signals.slice(-20);
    
    // 统计信号类型
    const acceptCount = signals.filter(s => s.signal_type === 'ACCEPT').length;
    const rejectCount = signals.filter(s => s.signal_type === 'REJECT').length;
    const modifyCount = signals.filter(s => s.signal_type === 'MODIFY').length;

    // 推断风险容忍度
    if (rejectCount > acceptCount * 0.5) {
      model.inferred_preferences.risk_tolerance = 'LOW';
    } else if (acceptCount > signals.length * 0.7) {
      model.inferred_preferences.risk_tolerance = 'HIGH';
    }

    // 推断节奏偏好
    if (modifyCount > signals.length * 0.4) {
      model.inferred_preferences.pace = 'SLOW';
    }
  }
}
