// src/agent/services/agent.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { AgentState } from '../interfaces/agent-state.interface';
import { RouteType, RouterReason, UIStatus } from '../interfaces/router.interface';
import { RouterService } from './router.service';
import { AgentStateService } from './agent-state.service';
import { System1ExecutorService } from './system1-executor.service';
import { OrchestratorService } from './orchestrator.service';
import { DAGOrchestratorService } from '../plan-execute/orchestrator.service';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { EventTelemetryService } from './event-telemetry.service';
import { RequestDeduplicationService } from './request-deduplication.service';
import { TripRunManagerService } from './trip-run-manager.service';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { TokenCalculator } from '../utils/token-calculator.util';
import { AgentContext, OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { routePolicy } from '../utils/orchestration-policy.util';
import {
  OrchestrationStep,
  SubAgentType,
  DecisionLogEntry,
  SimplifiedExplanation,
  GateResult,
  AICapabilityDisplay,
  OrchestratorState,
  JepaPayload,
  Itinerary,
  ItineraryRiskTag,
} from '../interfaces/trip-plan.interface';
import { MetricsRecorder, extractMetricsFromResponse } from '../utils/agent-metrics.util';
import {
  deriveExternalVerdict,
  shouldIntakeClarifyShortCircuit,
  type PolicyAction,
} from '../utils/external-verdict.util';
import { RLIntegrationService } from '../training/services/rl-integration.service';
import {
  CircuitBreaker,
  createDeadline,
  FallbackGuard,
  ModeLock,
  normalizeError,
  OrchestrationMode,
  StabilityContext,
  withTimeout,
} from './orchestration-stability.util';
import { ErrorType } from '../interfaces/error-types.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { buildTravelOntologyStateFromOrchestrator, mergeTravelOntologyState } from '../../decision/kernel/travel-ontology.mapper';

/**
 * Agent Service
 * 
 * 统一入口服务：协调 Router、System1、System2
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  // Stability Layer components
  private readonly modeLock = new ModeLock();
  private readonly breakerSM = new CircuitBreaker(3, 30_000); // 3次失败后熔断30秒
  private readonly breakerDyn = new CircuitBreaker(3, 30_000);
  private readonly breakerLegacy = new CircuitBreaker(5, 15_000); // LEGACY 更宽松

  constructor(
    private router: RouterService,
    private stateService: AgentStateService,
    private system1Executor: System1ExecutorService,
    private orchestrator: OrchestratorService,
    @Optional() private dagOrchestrator?: DAGOrchestratorService,
    @Optional() private claudeOrchestrator?: ClaudeOrchestratorService,
    private eventTelemetry?: EventTelemetryService,
    private requestDeduplication?: RequestDeduplicationService,
    @Optional() private tripRunManager?: TripRunManagerService,
    @Optional() private rlIntegration?: RLIntegrationService,
  ) {}

  /**
   * 将状态机步骤映射到 UI 状态（增强版：包含时间预期和步骤说明）
   */
  private mapOrchestrationStepToUIState(
    step: OrchestrationStep,
    gateResult?: string,
    elapsedTime?: number, // 已用时间（毫秒）
  ): {
    phase: OrchestrationStep;
    ui_status: 'thinking' | 'browsing' | 'verifying' | 'repairing' | 'awaiting_consent' | 'awaiting_confirmation' | 'done' | 'failed';
    progress_percent: number;
    message: string;
    requires_user_action: boolean;
    estimated_time_remaining_ms?: number; // 🆕 预计剩余时间
    current_step_detail?: string; // 🆕 当前步骤详细说明
  } {
    const stepProgressMap: Record<OrchestrationStep, number> = {
      INTAKE: 8.0,
      STATE_UPDATE: 10.0,
      RESEARCH: 18.0,
      POI_SELECTION: 24.0,
      GATE_EVAL: 28.0,
      CONTEXT_BUILD: 32.0,
      PLAN_GEN: 42.0,
      OPTIMIZE: 48.0,
      VERIFY: 55.0,
      COMPLIANCE: 62.0,
      REPAIR: 72.0,
      NARRATE: 82.0,
      FEEDBACK: 92.0,
      DONE: 100.0,
      FAILED: 0,
      TIMEOUT: 0,
      HALLUCINATION_DETECTION: 96.0,
    };

    const stepMessageMap: Record<OrchestrationStep, string> = {
      INTAKE: '正在解析请求...',
      STATE_UPDATE: '正在更新决策状态...',
      RESEARCH: '正在收集数据...',
      POI_SELECTION: '正在筛选候选地点...',
      GATE_EVAL: '正在评估行程可行性...',
      CONTEXT_BUILD: '正在构建上下文...',
      PLAN_GEN: '正在生成行程安排...',
      OPTIMIZE: '正在抽取优化提示...',
      VERIFY: '正在验证行程...',
      COMPLIANCE: '正在检查风险合规...',
      REPAIR: '正在修复行程问题...',
      NARRATE: '正在生成说明...',
      FEEDBACK: '正在收集反馈信号...',
      DONE: '处理完成',
      FAILED: '处理失败',
      TIMEOUT: '请求超时',
      HALLUCINATION_DETECTION: '正在检测内容真实性...',
    };

    // 🆕 步骤预计时间（毫秒，基于历史数据或经验值）
    const stepEstimatedTimeMap: Record<OrchestrationStep, number> = {
      INTAKE: 2000,      // 2秒
      STATE_UPDATE: 100, // 0.1秒（Kernel 同步）
      RESEARCH: 8000,    // 8秒
      POI_SELECTION: 1500, // 1.5秒
      GATE_EVAL: 5000,   // 5秒
      CONTEXT_BUILD: 3000, // 3秒
      PLAN_GEN: 10000,   // 10秒
      OPTIMIZE: 100,     // 0.1秒
      VERIFY: 6000,      // 6秒
      COMPLIANCE: 3000,  // 3秒
      REPAIR: 4000,      // 4秒（条件执行）
      NARRATE: 3000,     // 3秒
      FEEDBACK: 2000,    // 2秒
      DONE: 0,
      FAILED: 0,
      TIMEOUT: 0,
      HALLUCINATION_DETECTION: 2000, // 2秒
    };

    // 🆕 步骤详细说明
    const stepDetailMap: Record<OrchestrationStep, string> = {
      INTAKE: '分析您的需求，提取关键信息（目的地、日期、预算等）',
      STATE_UPDATE: '同步 OrchestratorState 到 Decision Kernel',
      RESEARCH: '查询交通、POI、开放时间、DEM地形等数据',
      POI_SELECTION: '对候选 POI 做排序与裁剪，为 PLAN_GEN 提供输入',
      GATE_EVAL: '评估路线安全性、可达性和可行性（三人格评审）',
      CONTEXT_BUILD: '构建 Context Package 供 PLAN 使用',
      PLAN_GEN: '生成详细的行程安排，包括时间、地点、交通方式',
      OPTIMIZE: '抽取安全/疲劳趋势等优化提示',
      VERIFY: '验证时间冲突、换乘时间、开放时间等',
      COMPLIANCE: '检查风险分类、合规要求和免责留痕',
      REPAIR: '修复发现的问题，优化行程（如需要）',
      NARRATE: '生成用户友好的行程说明和提示',
      FEEDBACK: '收集用户反馈信号用于决策优化',
      DONE: '所有步骤已完成',
      FAILED: '处理过程中出现错误',
      TIMEOUT: '请求超时，请缩小范围或稍后重试',
      HALLUCINATION_DETECTION: '检测生成内容中的事实声明，确保信息准确性',
    };

    let uiStatus: 'thinking' | 'browsing' | 'verifying' | 'repairing' | 'awaiting_consent' | 'awaiting_confirmation' | 'done' | 'failed' = 'thinking';
    let requiresUserAction = false;

    switch (step) {
      case 'INTAKE':
      case 'RESEARCH':
      case 'POI_SELECTION':
      case 'PLAN_GEN':
      case 'NARRATE':
      case 'FEEDBACK':
        uiStatus = 'thinking';
        break;
      case 'GATE_EVAL':
        uiStatus = 'verifying';
        if (gateResult === 'NEED_CONFIRM') {
          uiStatus = 'awaiting_confirmation';
          requiresUserAction = true;
        }
        break;
      case 'VERIFY':
      case 'COMPLIANCE':
        uiStatus = 'verifying';
        break;
      case 'REPAIR':
        uiStatus = 'repairing';
        break;
      case 'DONE':
        uiStatus = 'done';
        break;
      case 'FAILED':
      case 'TIMEOUT':
        uiStatus = 'failed';
        break;
      case 'HALLUCINATION_DETECTION':
        uiStatus = 'verifying';
        break;
    }

    // 🆕 计算预计剩余时间
    let estimatedTimeRemaining: number | undefined;
    if (elapsedTime !== undefined && step !== 'DONE' && step !== 'FAILED' && step !== 'TIMEOUT') {
      const currentStepTime = stepEstimatedTimeMap[step];
      const remainingSteps = this.getRemainingSteps(step);
      const totalRemainingTime = remainingSteps.reduce(
        (sum, s) => sum + stepEstimatedTimeMap[s],
        0
      );
      
      // 如果当前步骤已用时间超过预计时间，使用已用时间
      const currentStepRemaining = Math.max(0, currentStepTime - elapsedTime);
      estimatedTimeRemaining = currentStepRemaining + totalRemainingTime;
    }

    return {
      phase: step,
      ui_status: uiStatus,
      progress_percent: stepProgressMap[step] || 0,
      message: stepMessageMap[step] || '处理中...',
      requires_user_action: requiresUserAction,
      estimated_time_remaining_ms: estimatedTimeRemaining,
      current_step_detail: stepDetailMap[step],
    };
  }

  /**
   * 🆕 获取剩余步骤列表
   */
  private getRemainingSteps(currentStep: OrchestrationStep): OrchestrationStep[] {
    const allSteps: OrchestrationStep[] = [
      'INTAKE',
      'RESEARCH',
      'GATE_EVAL',
      'PLAN_GEN',
      'VERIFY',
      'REPAIR',
      'NARRATE',
      'DONE',
    ];

    const currentIndex = allSteps.indexOf(currentStep);
    if (currentIndex === -1) {
      return [];
    }

    return allSteps.slice(currentIndex + 1);
  }

  /**
   * 🆕 生成简化版解释（减少认知负荷）
   */
  private generateSimplifiedExplanation(
    decisionLog: DecisionLogEntry[],
    gateResult?: GateResult,
    itinerary?: Itinerary,
  ): SimplifiedExplanation | undefined {
    if (!decisionLog || decisionLog.length === 0) {
      return undefined;
    }

    // 提取关键决策点
    const keyDecisions: Array<{
      step: string;
      decision: string;
      impact: 'HIGH' | 'MEDIUM' | 'LOW';
    }> = [];

    // 1. Gate评估结果（最重要）
    if (gateResult) {
      keyDecisions.push({
        step: 'GATE_EVAL',
        decision: this.translateGateResult(gateResult.gate_result),
        impact: 'HIGH',
      });
    }

    // 2. 提取其他关键决策（只保留高影响决策）
    const keySteps = ['GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR'];
    for (const entry of decisionLog) {
      if (keySteps.includes(entry.step)) {
        keyDecisions.push({
          step: entry.step,
          decision: this.simplifyDecisionMessage(entry),
          impact: this.assessDecisionImpact(entry),
        });
      }
    }

    // 只保留高影响和中影响的决策
    const filteredDecisions = keyDecisions.filter(
      d => d.impact === 'HIGH' || d.impact === 'MEDIUM'
    );

    // 生成摘要
    const summary = this.generateDecisionSummary(gateResult, filteredDecisions);

    return {
      summary,
      key_decisions: filteredDecisions.slice(0, 5), // 最多5个关键决策
      evidence_count: decisionLog.reduce(
        (sum, entry) => sum + (entry.evidence_refs?.length || 0),
        0
      ),
      risk_tags_summary: this.buildRiskTagsSummary(itinerary),
      has_details: true, // 详细版本总是可用
    };
  }

  /** ADR-B1：从 itinerary.items[].metadata.risk_tags 聚合 top 风险标签 */
  private buildRiskTagsSummary(
    itinerary?: Itinerary,
  ): Array<{ tag: ItineraryRiskTag; count: number }> | undefined {
    if (!itinerary?.days?.length) return undefined;
    const counter = new Map<ItineraryRiskTag, number>();
    for (const day of itinerary.days) {
      for (const item of day.items) {
        const tags = item.metadata?.risk_tags;
        if (!tags?.length) continue;
        for (const tag of tags) {
          counter.set(tag, (counter.get(tag) ?? 0) + 1);
        }
      }
    }
    if (counter.size === 0) return undefined;
    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));
  }

  /**
   * 🆕 翻译Gate结果
   */
  private translateGateResult(status: string): string {
    const translations: Record<string, string> = {
      'ALLOW': '已通过',
      'BLOCK': '被拒绝',
      'ADJUST_REQUIRED': '需要调整',
      'NEED_USER_CONFIRM': '需要您确认',
    };
    return translations[status] || status;
  }

  /**
   * 🆕 简化决策消息（去除技术术语）
   */
  private simplifyDecisionMessage(entry: DecisionLogEntry): string {
    // 将技术术语转换为用户友好的语言
    let message = entry.outputs_summary || entry.inputs_summary || '';

    // 替换技术术语
    message = message.replace(/GATE_EVAL/g, '可行性评估');
    message = message.replace(/PLAN_GEN/g, '行程生成');
    message = message.replace(/VERIFY/g, '验证');
    message = message.replace(/REPAIR/g, '修复');
    message = message.replace(/INTAKE/g, '需求解析');
    message = message.replace(/RESEARCH/g, '数据收集');
    message = message.replace(/NARRATE/g, '说明生成');

    // 简化消息长度
    if (message.length > 100) {
      message = message.substring(0, 97) + '...';
    }

    return message;
  }

  /**
   * 🆕 评估决策影响
   */
  private assessDecisionImpact(entry: DecisionLogEntry): 'HIGH' | 'MEDIUM' | 'LOW' {
    // 根据步骤和内容评估影响
    if (entry.step === 'GATE_EVAL') {
      return 'HIGH';
    }
    if (entry.step === 'PLAN_GEN' || entry.step === 'REPAIR') {
      return 'HIGH';
    }
    if (entry.step === 'VERIFY') {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * 🆕 生成决策摘要
   */
  private generateDecisionSummary(
    gateResult: GateResult | undefined,
    keyDecisions: Array<{ step: string; decision: string; impact: string }>
  ): string {
    const parts: string[] = [];

    // Gate评估结果
    if (gateResult) {
      parts.push(`行程${this.translateGateResult(gateResult.gate_result)}`);
    }

    // 关键决策数量
    if (keyDecisions.length > 0) {
      parts.push(`进行了${keyDecisions.length}项关键检查`);
    }

    return parts.length > 0 ? parts.join('，') + '。' : '已完成行程规划。';
  }

  /**
   * P4 可观测性：从编排结果计算 step_latency_ms、gate_block_rate、skill_success_rate
   */
  private computeP4ObservabilityMetrics(orchestrationResult: OrchestrationResult): {
    step_latency_ms?: Record<string, number>;
    gate_block_rate?: number;
    skill_success_rate?: number;
  } {
    const out: { step_latency_ms?: Record<string, number>; gate_block_rate?: number; skill_success_rate?: number } = {};
    const log = this.resolveCanonicalDecisionLogForK3(orchestrationResult);
    const steps = orchestrationResult.stepsExecuted || [];

    // step_latency_ms: 优先从 decision_log，否则从 stepsExecuted
    if (log.length > 0) {
      const stepLatency: Record<string, number> = {};
      for (const e of log) {
        const ms = e.metadata?.duration_ms ?? 0;
        if (e.step && ms > 0) {
          stepLatency[e.step] = (stepLatency[e.step] ?? 0) + ms;
        }
      }
      if (Object.keys(stepLatency).length > 0) out.step_latency_ms = stepLatency;
    } else if (steps.length > 0) {
      const stepLatency: Record<string, number> = {};
      for (const s of steps) {
        if (s.stepId && s.duration > 0) {
          stepLatency[s.stepId] = (stepLatency[s.stepId] ?? 0) + s.duration;
        }
      }
      if (Object.keys(stepLatency).length > 0) out.step_latency_ms = stepLatency;
    }

    // gate_block_rate: 本请求若 Gate 为 BLOCK 则为 1，否则 0
    const gateResult = orchestrationResult.result?.gate_result?.gate_result;
    if (gateResult !== undefined) {
      out.gate_block_rate = gateResult === 'BLOCK' ? 1 : 0;
    }

    // skill_success_rate: 成功步骤数 / 总步骤数
    if (steps.length > 0) {
      const ok = steps.filter(s => s.success).length;
      out.skill_success_rate = ok / steps.length;
    }

    return out;
  }

  /**
   * K3：三处 `decision_log` 单一来源 — 优先 `state.decision_log`，与 orchestrator 出口一致，避免 `decisionLog` 与 `result.decision_log` 漂移。
   */
  private resolveCanonicalDecisionLogForK3(orchestrationResult: OrchestrationResult): DecisionLogEntry[] {
    const r = orchestrationResult.result as {
      decision_log?: DecisionLogEntry[];
      state?: OrchestratorState;
    };
    const fromState = r?.state?.decision_log;
    if (Array.isArray(fromState)) return fromState;
    const fromResult = r?.decision_log;
    if (Array.isArray(fromResult)) return fromResult;
    return orchestrationResult.decisionLog ?? [];
  }

  private buildOptimizationExplain(decisionState?: DecisionState): RouteAndRunResponseDto['explain']['optimization'] {
    const hints = decisionState?.optimizationHints;
    if (!hints) return undefined;
    return {
      method: hints.method,
      recommended_alternative_id: hints.recommendedAlternativeId,
      alternatives: hints.alternatives?.map((a) => ({
        id: a.id,
        score: a.score,
        expected_utility: a.expectedUtility,
        feasibility_probability: a.feasibilityProbability,
        confidence_interval: a.confidenceInterval,
      })),
    };
  }

  /**
   * JEPA：把现有 DSO（DecisionState）的“当前可观测世界状态”投影为 z_env / z_user / z_state。
   * predictor 输出与 delta / prediction_errors 先保持可选（未在核心链路实现时避免误导）。
   */
  private buildJePaPayload(
    decisionState?: DecisionState,
    orchestrationState?: OrchestratorState,
  ): JepaPayload | undefined {
    if (!decisionState) return undefined;

    const env = decisionState.environmentState;
    const trip = decisionState.tripState;
    const intent = decisionState.userIntent;
    const feedback = decisionState.feedback;
    const constraints = decisionState.constraints;
    const world = decisionState.worldStateSummary;

    const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
    const normalize01Maybe = (n: unknown): number | null => {
      if (typeof n !== 'number' || Number.isNaN(n)) return null;
      return clamp01(n <= 1 ? n : n / 100);
    };
    const mapRiskLabelTo01 = (label?: string): number | null => {
      const l = (label ?? '').toUpperCase();
      if (l === 'LOW') return 0.2;
      if (l === 'MEDIUM') return 0.5;
      if (l === 'HIGH') return 0.8;
      return null;
    };
    const mapFitnessLabelTo01 = (labelOrNumber?: string | number): number | null => {
      if (typeof labelOrNumber === 'number') return clamp01(labelOrNumber);
      const l = (labelOrNumber ?? '').toLowerCase();
      if (l === 'low') return 0.4;
      if (l === 'medium') return 0.6;
      if (l === 'high') return 0.8;
      return null;
    };
    const normalizeSlopeTo01 = (maxSlope?: number): number | null => {
      if (typeof maxSlope !== 'number' || Number.isNaN(maxSlope)) return null;
      // 归一化假设：maxSlope 单位可能为百分比；用 50 作为上界做裁剪到 0..1
      return clamp01(maxSlope / 50);
    };

    const normalizeZState01Maybe = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v !== 'number' || Number.isNaN(v)) return null;
      return clamp01((v as number) <= 1 ? (v as number) : (v as number) / 100);
    };

    const coerceZStateFromHistory = (
      raw: unknown,
    ): JepaPayload['latent_contract']['z_state'] | null => {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Record<string, unknown>;
      const continuity = normalizeZState01Maybe(r.continuity);
      const risk_score = normalizeZState01Maybe(r.risk_score);
      const cost = normalizeZState01Maybe(r.cost);
      const fatigue = normalizeZState01Maybe(r.fatigue);
      const satisfaction_estimate = normalizeZState01Maybe(r.satisfaction_estimate);

      if (
        continuity === null &&
        risk_score === null &&
        cost === null &&
        fatigue === null &&
        satisfaction_estimate === null
      ) {
        // 全空/不可用：当作缺失快照
        return null;
      }

      const missing_fields =
        Array.isArray(r.missing_fields) ? (r.missing_fields as unknown[]).map((x) => String(x)) : [];

      return {
        continuity,
        risk_score,
        cost,
        fatigue,
        satisfaction_estimate,
        missing_fields,
        fill_strategy: 'NULL' as const,
      };
    };

    const getLatestHistoryZState = (
      history: DecisionState['history'] | undefined,
      type: string,
      key: 'prev' | 'next',
    ): JepaPayload['latent_contract']['z_state'] | null => {
      if (!history || !Array.isArray(history) || history.length === 0) return null;
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i] as any;
        if (h?.type === type) {
          return coerceZStateFromHistory(h?.[key]);
        }
      }
      return null;
    };
    const getLatestHistoryPayload = (
      history: DecisionState['history'] | undefined,
      type: string,
    ): Record<string, unknown> | null => {
      if (!history || !Array.isArray(history) || history.length === 0) return null;
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i] as { type?: string; payload?: unknown } | undefined;
        if (h?.type === type && h.payload && typeof h.payload === 'object') {
          return h.payload as Record<string, unknown>;
        }
      }
      return null;
    };

    const z_state_before_action = getLatestHistoryZState(
      decisionState.history,
      'jepa_z_state_before_action',
      'prev',
    );
    const z_state_after_action = getLatestHistoryZState(
      decisionState.history,
      'jepa_z_state_after_action',
      'next',
    );

    const z_state_after_execution_observation = getLatestHistoryZState(
      decisionState.history,
      'jepa_z_state_after_execution_observation',
      'next',
    );

    const missingEnv: string[] = [];
    const missingUser: string[] = [];
    const missingState: string[] = [];

    const slope01 = normalizeSlopeTo01(world?.physical?.demEvidence?.maxSlope);
    if (slope01 === null) missingEnv.push('terrain_risk.slope');

    const weatherRisk01 = env?.weatherRisk !== undefined ? normalize01Maybe(env.weatherRisk) : null;
    if (weatherRisk01 === null) missingEnv.push('weather_state.precipitation_proxy');

    const accessibility01 =
      env?.accessibilityScore !== undefined ? normalize01Maybe(env.accessibilityScore) : normalize01Maybe(world?.physical?.climateSeasonality?.accessibilityScore);
    if (accessibility01 === null) missingEnv.push('accessibility.signal_coverage');

    const z_env = {
      terrain_risk: [slope01, null, null] as [number | null, number | null, number | null],
      weather_state: [null, null, weatherRisk01] as [number | null, number | null, number | null],
      accessibility: [null, accessibility01] as [number | null, number | null],
      temporal_factor: [null, null] as [number | null, number | null],
      missing_fields: missingEnv,
      fill_strategy: 'NULL' as const,
    };

    const riskTolerance01 = mapRiskLabelTo01(intent?.party?.riskTolerance);
    if (riskTolerance01 === null) missingUser.push('risk_tolerance');

    // delay_sensitivity 与 experience_level 在当前链路可能未必提供；先返回 null。
    const delaySensitivity01: number | null = null;
    if (delaySensitivity01 === null) missingUser.push('delay_sensitivity');

    const fatigueLimit01 = mapFitnessLabelTo01(intent?.party?.fitnessLevel);
    if (fatigueLimit01 === null) missingUser.push('fatigue_limit');

    const experienceLevel01: number | null = null;
    if (experienceLevel01 === null) missingUser.push('experience_level');

    const z_user = {
      risk_tolerance: riskTolerance01,
      delay_sensitivity: delaySensitivity01,
      fatigue_limit: fatigueLimit01,
      experience_level: experienceLevel01,
      missing_fields: missingUser,
      fill_strategy: 'NULL' as const,
    };

    // continuity：用 constraints.feasible 作为可持续性近似（强约束失败 => 低连续性）
    const continuity01 = typeof constraints?.feasible === 'boolean' ? (constraints.feasible ? 0.9 : 0.2) : null;
    if (continuity01 === null) missingState.push('continuity');

    // risk_score：优先 failureRiskLevel，否则使用 weatherRisk
    const failureRisk01 = mapRiskLabelTo01(env?.failureRiskLevel);
    const riskScore01 = failureRisk01 ?? weatherRisk01;
    if (riskScore01 === null) missingState.push('risk_score');

    const cost01 = trip?.budgetOverrun !== undefined ? normalize01Maybe(trip.budgetOverrun) : null;
    if (cost01 === null) missingState.push('cost');

    const fatigue01 = trip?.fatigue !== undefined ? normalize01Maybe(trip.fatigue) : null;
    if (fatigue01 === null) missingState.push('fatigue');

    const rawSat = feedback?.satisfactionScore;
    const satisfactionEstimate01 =
      rawSat === undefined
        ? null
        : typeof rawSat === 'number'
          ? clamp01(rawSat <= 1 ? rawSat : rawSat / 5)
          : null;
    if (satisfactionEstimate01 === null) missingState.push('satisfaction_estimate');

    const z_state_current: JepaPayload['latent_contract']['z_state'] = {
      continuity: continuity01,
      risk_score: riskScore01,
      cost: cost01,
      fatigue: fatigue01,
      satisfaction_estimate: satisfactionEstimate01,
      missing_fields: missingState,
      fill_strategy: 'NULL' as const,
    };

    // 若 history 里存在动作前/后快照，则用它们作为预测/真实口径
    const z_state_for_pred: JepaPayload['latent_contract']['z_state'] = z_state_before_action ?? z_state_current;
    // 优先使用执行偏差信号回灌后的“更真实”观测快照
    const z_state_for_real: JepaPayload['latent_contract']['z_state'] =
      z_state_after_execution_observation ?? z_state_after_action ?? z_state_current;

    // ===== Predictor（多头概率模拟器）=====
    // 说明：当前链路尚未提供“执行后的真实下一状态”，所以这里生成的是“下一状态的概率性预估”（z_pred）
    // predictor_outputs / risk_trajectory 来自：failureRiskPrediction（短 horizon）
    // head 概率目前使用 z_state 的可观测维度 + 风险轨迹的聚合方式（先打通协议，不引入黑盒）。

    let riskTrajectory: Array<{ at: string; risk_score: number | null; reason?: string }> | undefined = undefined;

    const failurePredictions = orchestrationState?.research_data?.failure_risk_prediction?.predictions as
      | Array<{ day: number; riskLevel: string; riskFactors?: string[]; mitigation?: string[] }>
      | undefined;

    const startDateStr = intent?.dateRange?.startDate;
    const startDate = startDateStr ? new Date(startDateStr) : null;

    if (Array.isArray(failurePredictions) && failurePredictions.length > 0) {
      riskTrajectory = failurePredictions.map((p) => {
        const day = typeof p.day === 'number' ? p.day : 1;
        const riskScore =
          p.riskLevel === 'LOW'
            ? 0.2
            : p.riskLevel === 'MEDIUM'
              ? 0.5
              : p.riskLevel === 'HIGH'
                ? 0.8
                : p.riskLevel === 'CRITICAL'
                  ? 0.95
                  : null;

        const at = startDate && !Number.isNaN(startDate.getTime())
          ? new Date(startDate.getTime() + (day - 1) * 24 * 60 * 60 * 1000).toISOString()
          : `day_${day}`;

        const reason = Array.isArray(p.riskFactors) && p.riskFactors.length > 0 ? p.riskFactors[0] : undefined;
        return { at, risk_score: riskScore, reason };
      });
    }

    const avgRiskScore = riskTrajectory && riskTrajectory.length > 0
      ? riskTrajectory.reduce((sum, x) => sum + (typeof x.risk_score === 'number' ? x.risk_score : 0), 0) / riskTrajectory.length
      : null;

    const risk_increase_prob =
      typeof avgRiskScore === 'number'
        ? clamp01(avgRiskScore)
        : typeof z_state_for_pred.risk_score === 'number'
          ? clamp01(z_state_for_pred.risk_score)
          : null;

    const continuity_break_prob =
      typeof z_state_for_pred.continuity === 'number' ? clamp01(1 - z_state_for_pred.continuity) : null;

    const fatigue_increase_prob =
      typeof z_state_for_pred.fatigue === 'number' ? clamp01(z_state_for_pred.fatigue) : null;

    const cost_overrun_prob =
      typeof z_state_for_pred.cost === 'number' ? clamp01(z_state_for_pred.cost) : null;

    const z_pred: JepaPayload['latent_contract']['z_state'] = {
      continuity:
        typeof z_state_for_pred.continuity === 'number' && typeof continuity_break_prob === 'number'
          ? clamp01(z_state_for_pred.continuity - continuity_break_prob * 0.15)
          : null,
      risk_score:
        // riskTrajectory 已给出“短 horizon 的未来风险预测”（avgRiskScore），因此这里避免使用 z_real 作基底。
        typeof avgRiskScore === 'number'
          ? clamp01(avgRiskScore)
          : typeof z_state_for_pred.risk_score === 'number' && typeof risk_increase_prob === 'number'
            ? clamp01(z_state_for_pred.risk_score + risk_increase_prob * 0.15)
            : null,
      cost:
        typeof z_state_for_pred.cost === 'number' && typeof cost_overrun_prob === 'number'
          ? clamp01(z_state_for_pred.cost + cost_overrun_prob * 0.15)
          : null,
      fatigue:
        typeof z_state_for_pred.fatigue === 'number' && typeof fatigue_increase_prob === 'number'
          ? clamp01(z_state_for_pred.fatigue + fatigue_increase_prob * 0.15)
          : null,
      satisfaction_estimate:
        typeof z_state_for_pred.satisfaction_estimate === 'number' &&
          (typeof risk_increase_prob === 'number' || typeof fatigue_increase_prob === 'number')
          ? clamp01(
              z_state_for_pred.satisfaction_estimate -
                ((risk_increase_prob ?? 0) * 0.08 + (fatigue_increase_prob ?? 0) * 0.08),
            )
          : null,
      missing_fields: [],
      fill_strategy: 'NULL' as const,
    };

    const delta: Partial<Record<keyof JepaPayload['latent_contract']['z_state'], number | null>> = {};
    (['continuity', 'risk_score', 'cost', 'fatigue', 'satisfaction_estimate'] as const).forEach((k) => {
      const realV = z_state_for_real[k];
      const predV = z_pred[k];
      if (typeof realV === 'number' && typeof predV === 'number') {
        // UI 的语义：Delta = Real - Pred
        delta[k] = realV - predV;
      } else {
        delta[k] = null;
      }
    });

    // ===== Prediction Error（基于现有可观测数据的可计算闭环）=====
    // utility_error:
    // - 真实效用/满意度来自 feedback.satisfactionScore（已映射到 z_state.satisfaction_estimate）
    // - 预测效用来自 z_pred.satisfaction_estimate（multi-head predictor 的语义投影）
    let utilityErrorMagnitude: number | null = null;
    if (
      typeof z_pred.satisfaction_estimate === 'number' &&
      typeof z_state_for_real.satisfaction_estimate === 'number'
    ) {
      // z_pred/z_real 均已在 0..1（Normalized01），差值 abs 后仍在 0..1
      utilityErrorMagnitude = Math.abs(z_pred.satisfaction_estimate - z_state_for_real.satisfaction_estimate);
    }

    // world_error:
    // - 真实风险：执行后风险快照（z_state_for_real.risk_score）
    // - 预测风险：由 predictor head 生成的预测风险（z_pred.risk_score）
    let worldErrorMagnitude: number | null = null;
    if (typeof z_pred.risk_score === 'number' && typeof z_state_for_real.risk_score === 'number') {
      worldErrorMagnitude = Math.abs(z_pred.risk_score - z_state_for_real.risk_score);
    }

    // user_drift:
    // - 真实接受/采纳：feedback.accepted（由 RATING/ACCEPT 等反馈类型映射）
    // - 预测接受概率：用 z_pred.satisfaction_estimate 作为“效用->采纳倾向”的近似
    //   （在未接入“条件模拟器输出行为分布”的情况下，先把协议打通）
    let userDriftMagnitude: number | null = null;
    if (typeof z_pred.satisfaction_estimate === 'number') {
      const actualAccept =
        typeof feedback?.accepted === 'boolean'
          ? feedback.accepted
          : typeof feedback?.behaviorSignals?.savePlan === 'boolean'
            ? feedback.behaviorSignals.savePlan
            : null;

      if (typeof actualAccept === 'boolean') {
        const actualAcceptProb = actualAccept ? 1 : 0;
        userDriftMagnitude = Math.abs(z_pred.satisfaction_estimate - actualAcceptProb);
      }
    }

    const predictionErrors: JepaPayload['prediction_errors'] = (() => {
      const out: NonNullable<JepaPayload['prediction_errors']> = {};

      if (utilityErrorMagnitude !== null) {
        out.utility_error = {
          magnitude: utilityErrorMagnitude,
          details: [
            utilityErrorMagnitude > 0.2
              ? '用户效用与预测差异较大（需要校准风险/疲劳到满意度的映射）'
              : '用户效用与预测存在差异（幅度较小）',
          ],
        };
      }

      if (worldErrorMagnitude !== null) {
        out.world_error = {
          magnitude: worldErrorMagnitude,
          details: [
            `pred_risk=${typeof z_pred.risk_score === 'number' ? z_pred.risk_score.toFixed(2) : 'null'}`,
            `real_risk=${typeof z_state_for_real.risk_score === 'number' ? z_state_for_real.risk_score.toFixed(2) : 'null'}`,
          ],
        };
      }

      if (userDriftMagnitude !== null) {
        out.user_drift = {
          magnitude: userDriftMagnitude,
          details: ['用户采纳倾向与预测采纳倾向不一致（先用效用倾向近似，后续接入条件模拟器行为分布）'],
        };
      }

      return Object.keys(out).length > 0 ? out : undefined;
    })();

    const triggerReasons: string[] = [];
    if (typeof weatherRisk01 === 'number' && weatherRisk01 >= 0.6) {
      triggerReasons.push('WEATHER_SPIKE');
    }
    if (constraints?.feasible === false) {
      triggerReasons.push('CONSTRAINT_CONFLICT');
    }
    if (feedback?.accepted === false) {
      triggerReasons.push('USER_REJECTION');
    }
    if (typeof worldErrorMagnitude === 'number' && worldErrorMagnitude >= 0.2) {
      triggerReasons.push('WORLD_ERROR_HIGH');
    }
    if (typeof userDriftMagnitude === 'number' && userDriftMagnitude >= 0.2) {
      triggerReasons.push('USER_DRIFT_HIGH');
    }
    const arbitrationPayload = getLatestHistoryPayload(decisionState.history, 'kernel_arbitration');
    const arbitration: JepaPayload['arbitration'] | undefined = arbitrationPayload
      ? {
          selected_candidate_id:
            typeof arbitrationPayload.selected_candidate_id === 'string'
              ? arbitrationPayload.selected_candidate_id
              : undefined,
          rejected_count:
            typeof arbitrationPayload.rejected_count === 'number'
              ? arbitrationPayload.rejected_count
              : Array.isArray(arbitrationPayload.rejected_candidates)
                ? arbitrationPayload.rejected_candidates.length
                : undefined,
          conflict_detected:
            typeof arbitrationPayload.conflict_detected === 'boolean'
              ? arbitrationPayload.conflict_detected
              : undefined,
          fallback_used:
            arbitrationPayload.conflict_resolution === 'FALLBACK_BASELINE'
              ? true
              : typeof arbitrationPayload.fallback_used === 'boolean'
                ? arbitrationPayload.fallback_used
                : undefined,
        }
      : undefined;

    return {
      version: '1.0',
      latent_contract: {
        z_env,
        z_user,
        z_state: z_state_for_real,
      },
      predictor_outputs: {
        risk_head: typeof risk_increase_prob === 'number' ? { risk_increase_prob } : undefined,
        continuity_head:
          typeof continuity_break_prob === 'number' ? { continuity_break_prob } : undefined,
        fatigue_head:
          typeof fatigue_increase_prob === 'number' ? { fatigue_increase_prob } : undefined,
        cost_head: typeof cost_overrun_prob === 'number' ? { cost_overrun_prob } : undefined,
      },
      decision_trace: {
        z_pred,
        z_real: z_state_for_real,
        delta,
        at: new Date().toISOString(),
      },
      prediction_errors: predictionErrors,
      risk_trajectory: riskTrajectory,
      trigger_reasons: triggerReasons.length > 0 ? Array.from(new Set(triggerReasons)) : undefined,
      arbitration,
    };
  }

  /**
   * 生成请求哈希（用于去重和 ModeLock）
   */
  private hashRequest(request: RouteAndRunRequestDto): string {
    // 保持稳定：message + trip + options 中影响结果的字段
    const stable = {
      trip_id: request.trip_id ?? null,
      message: request.message ?? '',
      options: {
        entry_point: request?.options?.entry_point,
        use_claude_orchestration: request?.options?.use_claude_orchestration,
        use_state_machine_orchestration: request?.options?.use_state_machine_orchestration,
        max_seconds: request?.options?.max_seconds,
      },
    };
    // 简单哈希（可替换为现有的哈希工具）
    const s = JSON.stringify(stable);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h);
  }

  /**
   * 路由并执行（集成稳定化层）
   */
  async routeAndRun(request: RouteAndRunRequestDto): Promise<RouteAndRunResponseDto> {
    const startTime = Date.now();
    this.logger.debug(`Processing request: ${request.request_id}`);

    // Phase 0：战略收敛 - 个性化降级显式日志（user_id=anonymous 时 Memory/UserProfile 不可用）
    if (!request.user_id || request.user_id === 'anonymous') {
      this.logger.warn(
        `[Phase0] user_id 缺失或为 anonymous，个性化能力（Memory、UserTravelProfile）不可用。request_id=${request.request_id}`,
      );
    }

    // === 创建 TripRun 记录 ===
    let tripRunId: string | null = null;
    if (this.tripRunManager && !request.options?.dry_run) {
      try {
        // 判断规划阶段
        const isPlanningReq = this.isPlanningRequest(request);
        const planningPhase = isPlanningReq ? 'PLANNING' : 'EXECUTION';
        
        // 判断当前 Agent（根据路由决策）
        const signals = signalsFromRequest(request);
        const currentAgent = signals.taskType === 'TRIP_PLANNING' ? 'PlanningAgent' : 'ExecutionAgent';
        
        tripRunId = await this.tripRunManager.createTripRun({
          tripId: request.trip_id || null,
          userId: request.user_id || null,
          userQuery: request.message,
          planningPhase,
          currentAgent,
          metadata: {
            request_id: request.request_id,
            entry_point: request.options?.entry_point,
            max_seconds: request.options?.max_seconds,
          },
        });
        if (tripRunId) {
          this.logger.debug(`Created TripRun: ${tripRunId} for request ${request.request_id}`);
        }
      } catch (error: any) {
        this.logger.warn(`Failed to create TripRun: ${error.message}`);
        // 不阻塞主流程
      }
    }

    // === 稳定化层：统一 Deadline ===
    const maxSeconds = Number(request?.options?.max_seconds ?? 12);
    // 规划类请求在本地/CLI 场景下经常需要 >20s（含 DB + LLM + 多阶段编排）。
    // 这里不再硬上限 20s，而是允许到 120s（仍保留 clamp 防止极端值）。
    const deadline = createDeadline(Math.max(1000, Math.min(maxSeconds * 1000, 120_000))); // 默认12s，最大120s

    const requestHash = this.hashRequest(request);
    const stabilityCtx: StabilityContext = {
      requestId: request.request_id,
      userId: request.user_id,
      tripId: request.trip_id,
      requestHash,
      deadline,
      startTs: startTime,
    };

    const fallback = new FallbackGuard();

    try {
      // === 稳定化层：统一去重（在所有模式之前） ===
      if (this.requestDeduplication && !request.options?.dry_run) {
        const cachedResponse = this.requestDeduplication.checkDuplicate(requestHash);
        if (cachedResponse) {
          const dedupedResponse: RouteAndRunResponseDto = {
            ...cachedResponse,
            request_id: request.request_id,
            observability: {
              ...cachedResponse.observability,
              latency_ms: Date.now() - startTime,
            },
          };
          this.logger.debug(`Request deduplication: reusing cached result for request ${request.request_id}`);
          return this.attachObservability(
            dedupedResponse,
            {
              mode_final: 'DEDUP',
              fallback_used: false,
              deadline_ms: deadline.totalMs,
              time_remaining_ms: deadline.remainingMs(),
            },
            request,
          );
        }
      }
      // 0. 检查是否是规划请求（需要拦截，重定向到规划工作台）
      // 注意：创建新行程时 trip_id 为 null 是正常的，应该允许通过（自然语言创建行程功能）
      // 如果 trip_id 为空且是规划请求，说明是创建新行程，不应该重定向
      const isFromDashboard = request.options?.entry_point === 'dashboard';
      const hasNoTripId = !request.trip_id || request.trip_id === '';
      const isPlanningReq = this.isPlanningRequest(request);
      const isCreatingNewTrip = hasNoTripId && isPlanningReq;
      
      // 只有在非创建新行程场景下才重定向到规划工作台
      // 如果是从 dashboard 创建新行程，或者 trip_id 为空且是规划请求，都允许通过
      if (isPlanningReq && !isCreatingNewTrip && !isFromDashboard) {
        this.logger.debug(`[AgentService] 检测到规划请求，重定向到规划工作台: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
        return this.createRedirectToPlanningWorkbenchResponse(request, startTime);
      }
      
      // 调试日志：记录判断结果
      if (isPlanningReq) {
        this.logger.debug(`[AgentService] 规划请求判断: isCreatingNewTrip=${isCreatingNewTrip}, isFromDashboard=${isFromDashboard}, hasNoTripId=${hasNoTripId}, trip_id=${request.trip_id}`);
      }

      // 0.1 验证 trip_id
      // 注意：创建新行程时 trip_id 为 null 是正常的（通过自然语言创建行程功能）
      // 只有在已有行程的操作（查询、修改等）时才需要 trip_id
      // 如果是从 dashboard 创建新行程，或者 trip_id 为空且是规划请求，允许 trip_id 为 null
      if (!isCreatingNewTrip && !isFromDashboard && (!request.trip_id || request.trip_id === '')) {
        // 只有在非创建新行程场景下才要求 trip_id
        this.logger.warn(`[AgentService] 缺少 trip_id（非创建新行程场景）: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
        return this.createMissingTripIdErrorResponse(request, startTime);
      }

      // 0.2 检查入口来源和操作权限（只读模式限制）
      if (request.options?.entry_point === 'trip_detail_page' && 
          request.options?.readonly_mode === true) {
        if (this.isModificationRequest(request.message)) {
          this.logger.debug(`[AgentService] 只读模式限制: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
          return this.createReadonlyModeRestrictionResponse(request, startTime);
        }
      }

      // === 稳定化层：检查 Deadline ===
      if (deadline.isExpired()) {
        throw new Error('TIMEOUT:AGENT_DEADLINE_EXPIRED');
      }

      // 1. 从请求中提取路由信号
      const signals = signalsFromRequest(request);
      this.logger.debug(
        `[AgentService] 路由信号提取: taskType=${signals.taskType}, risk=${signals.risk}, complexity=${signals.complexity}, request_id=${request.request_id}`,
      );

      // 2. 基于 Feature Flags 和信号进行策略决策（集成 ModeLock 和 Circuit Breaker）
      const decision = routePolicy(
        process.env,
        request.options,
        signals,
        stabilityCtx,
        this.modeLock,
        {
          sm: this.breakerSM,
          dyn: this.breakerDyn,
          legacy: this.breakerLegacy,
        },
      );
      
      // 调试日志：记录路由决策
      this.logger.log(`[AgentService] 路由决策: mode=${decision.mode}, reason=${decision.reason}`);
      this.logger.log(`[AgentService] 匹配规则: ${decision.matchedRules.join(', ')}`);
      this.logger.log(`[AgentService] 熔断器状态: SM=${this.breakerSM.canPass()}, Dynamic=${this.breakerDyn.canPass()}, Legacy=${this.breakerLegacy.canPass()}`);
      // 结构化日志（固定化字段，用于打点/聚合）
      // 结构化日志字段（固定化，用于 metrics/聚合）
      // 这些字段在所有请求中都会输出，方便日志聚合和监控
      const logFields = {
        request_id: request.request_id,
        // 核心编排字段（稳定字段）
        orchestration_mode_resolved: decision.mode, // 实际执行的模式
        orchestration_mode_recommended: decision.recommendations?.useStateMachine ? 'CLAUDE_SM' : decision.mode, // 建议的模式
        task_type: signals.taskType,
        risk: signals.risk,
        requires_consent: decision.recommendations?.requireConsent ?? false,
        needs_audit: decision.recommendations?.enableAudit ?? false,
        // 辅助字段
        max_seconds: request.options?.max_seconds ?? 60,
        latency_budget_ms: signals.latencyBudgetMs,
        reason: decision.reason,
        matched_rules: decision.matchedRules,
      };
      this.logger.log(logFields, `[AgentService] 编排策略决策`);
      
      // Metrics 打点（用于监控和观察）
      MetricsRecorder.recordOrchestrationMode(decision.mode);
      MetricsRecorder.recordRisk(signals.risk);
      if (request.options?.entry_point) {
        MetricsRecorder.recordEntryPoint(request.options.entry_point);
      }
      if (request.options?.readonly_mode !== undefined) {
        MetricsRecorder.recordReadonlyMode(request.options.readonly_mode);
      }
      
      // 详细的 debug 日志
      this.logger.debug(
        `[AgentService] 策略建议: useStateMachine=${decision.recommendations?.useStateMachine}, enableAudit=${decision.recommendations?.enableAudit}, requireConsent=${decision.recommendations?.requireConsent}, recommendation_reason=${decision.recommendations?.reason}`,
      );

      // 记录 trace 信息（用于观测和回放）
      // 关键：明确区分 resolved（实际执行）和 recommended（仅建议）
      const traceInfo = {
        orchestration: {
          // 实际执行的路径（强制）
          resolved: {
            mode: decision.mode,
            reason: decision.reason,
            matchedRules: decision.matchedRules,
          },
          // 建议（不影响执行）
          recommended: decision.recommendations ? {
            useStateMachine: decision.recommendations.useStateMachine,
            enableAudit: decision.recommendations.enableAudit,
            requireConsent: decision.recommendations.requireConsent,
            reason: decision.recommendations.reason,
          } : undefined,
          // 信号和标志位
          signals: {
            taskType: signals.taskType,
            risk: signals.risk,
            complexity: signals.complexity,
            needsAudit: signals.needsAudit,
            requiresStructuredOutput: signals.requiresStructuredOutput,
            expectsToolCalls: signals.expectsToolCalls,
            legacyWellSupported: signals.legacyWellSupported,
            latencyBudgetMs: signals.latencyBudgetMs,
          },
          flags: {
            env: {
              USE_CLAUDE_ORCHESTRATION: decision.flags.env_USE_CLAUDE_ORCHESTRATION,
            },
            options: {
              use_claude_orchestration: decision.flags.opt_use_claude_orchestration,
              use_state_machine_orchestration: decision.flags.opt_use_state_machine_orchestration,
            },
            derived: {
              use_state_machine_orchestration: decision.flags.derived_use_state_machine_orchestration,
            },
          },
        },
        timestamp: new Date().toISOString(),
        
        // 结构化日志字段（固定化，用于打点/聚合）
        orchestration_mode: decision.mode,
        orchestration_recommended_sm: decision.recommendations?.useStateMachine ?? false,
        risk: signals.risk,
        task_type: signals.taskType,
        requires_consent: decision.recommendations?.requireConsent ?? false,
        max_seconds: request.options?.max_seconds ?? 60,
        latency_budget_ms: signals.latencyBudgetMs,
      };

      // 3. 根据决策执行相应路径（集成稳定化层：withTimeout + Circuit Breaker + Fallback）
      const fallbackOrder: Record<OrchestrationMode, OrchestrationMode[]> = {
        CLAUDE_SM: ['CLAUDE_DYNAMIC', 'LEGACY'],
        CLAUDE_DYNAMIC: ['LEGACY'],
        LEGACY: [],
      };

      let finalMode: OrchestrationMode = decision.mode;
      let usedFallback = false;

      const execMode = async (mode: OrchestrationMode): Promise<RouteAndRunResponseDto> => {
        const remaining = deadline.remainingMs();
        if (remaining <= 0) throw new Error('TIMEOUT:AGENT_DEADLINE');

        if (mode === 'CLAUDE_SM') {
          if (!this.claudeOrchestrator) throw new Error('CLAUDE_SM_UNAVAILABLE');
          if (!this.breakerSM.canPass()) throw new Error('BREAKER_OPEN:CLAUDE_SM');
          const res = await withTimeout(
            this.routeAndRunWithClaudeStateMachine(request, startTime, traceInfo, deadline),
            remaining,
            'CLAUDE_SM'
          );
          this.breakerSM.onSuccess();
          return res;
        }

        if (mode === 'CLAUDE_DYNAMIC') {
          if (!this.claudeOrchestrator) throw new Error('CLAUDE_DYNAMIC_UNAVAILABLE');
          if (!this.breakerDyn.canPass()) throw new Error('BREAKER_OPEN:CLAUDE_DYNAMIC');
          const res = await withTimeout(
            this.routeAndRunWithClaude(request, startTime, traceInfo, deadline),
            remaining,
            'CLAUDE_DYNAMIC'
          );
          this.breakerDyn.onSuccess();
          return res;
        }

        // LEGACY mode
        if (!this.breakerLegacy.canPass()) throw new Error('BREAKER_OPEN:LEGACY');
        const res = await withTimeout(
          this.routeAndRunLegacy(request, startTime, traceInfo, deadline),
          remaining,
          'LEGACY'
        );
        this.breakerLegacy.onSuccess();
        return res;
      };

      try {
        const res = await execMode(decision.mode);
        // 成功：记录 ModeLock
        this.modeLock.set(stabilityCtx, decision.mode);
        
        // === 更新 TripRun 为 COMPLETED ===
        if (tripRunId && this.tripRunManager) {
          try {
            await this.tripRunManager.completeTripRun(tripRunId, {
              mode_final: decision.mode,
              fallback_used: false,
              latency_ms: Date.now() - startTime,
            });
          } catch (error: any) {
            this.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
          }
        }
        
        return this.attachObservability(
          res,
          {
            mode_final: decision.mode,
            fallback_used: false,
            deadline_ms: deadline.totalMs,
            time_remaining_ms: deadline.remainingMs(),
            breakers: {
              sm: this.breakerSM.snapshot(),
              dyn: this.breakerDyn.snapshot(),
              legacy: this.breakerLegacy.snapshot(),
            },
          },
          request,
        );
      } catch (e: any) {
        // 标记 Circuit Breaker 失败
        if (decision.mode === 'CLAUDE_SM') this.breakerSM.onFailure(e);
        else if (decision.mode === 'CLAUDE_DYNAMIC') this.breakerDyn.onFailure(e);
        else this.breakerLegacy.onFailure(e);

        // === 稳定化层：单次 Fallback ===
        const canFallback = fallback.tryUse();
        if (!canFallback || deadline.remainingMs() <= 0) {
          const nf = normalizeError(e);
          
          // === 更新 TripRun 为 FAILED ===
          if (tripRunId && this.tripRunManager) {
            try {
              await this.tripRunManager.failTripRun(tripRunId, e, {
                mode_final: decision.mode,
                fallback_used: false,
                latency_ms: Date.now() - startTime,
              });
            } catch (error: any) {
              this.logger.warn(`Failed to update TripRun to FAILED: ${error.message}`);
            }
          }
          
          // 🆕 尝试从错误中提取部分决策日志（如果是状态机超时）
          let partialDecisionLog: DecisionLogEntry[] | undefined;
          if (decision.mode === 'CLAUDE_SM' && e?.message?.startsWith('TIMEOUT:CLAUDE_SM')) {
            this.logger.warn(`[AgentService] 状态机超时，无法提取部分结果（需要状态机内部处理）`);
          }
          
          return this.buildFailureResponse(request, startTime, nf, {
            mode_final: decision.mode,
            fallback_used: false,
            deadline_ms: deadline.totalMs,
            time_remaining_ms: deadline.remainingMs(),
          }, partialDecisionLog);
        }

        usedFallback = true;

        // 尝试 fallback 链
        const chain = fallbackOrder[decision.mode] ?? [];
        for (const nextMode of chain) {
          if (deadline.remainingMs() <= 0) break;

          try {
            finalMode = nextMode;
            const res = await execMode(nextMode);
            // 成功：记录 ModeLock
            this.modeLock.set(stabilityCtx, nextMode);
            
            // === 更新 TripRun 为 COMPLETED ===
            if (tripRunId && this.tripRunManager) {
              try {
                await this.tripRunManager.completeTripRun(tripRunId, {
                  mode_final: nextMode,
                  fallback_used: true,
                  latency_ms: Date.now() - startTime,
                });
              } catch (error: any) {
                this.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
              }
            }
            
            return this.attachObservability(
              res,
              {
                mode_final: nextMode,
                fallback_used: true,
                deadline_ms: deadline.totalMs,
                time_remaining_ms: deadline.remainingMs(),
                breakers: {
                  sm: this.breakerSM.snapshot(),
                  dyn: this.breakerDyn.snapshot(),
                  legacy: this.breakerLegacy.snapshot(),
                },
              },
              request,
            );
          } catch (e2: any) {
            // 标记 Circuit Breaker 失败
            if (nextMode === 'CLAUDE_SM') this.breakerSM.onFailure(e2);
            else if (nextMode === 'CLAUDE_DYNAMIC') this.breakerDyn.onFailure(e2);
            else this.breakerLegacy.onFailure(e2);
            continue;
          }
        }

        // 所有 fallback 都失败
        const nf = normalizeError(e);
        
        // === 更新 TripRun 为 FAILED ===
        if (tripRunId && this.tripRunManager) {
          try {
            await this.tripRunManager.failTripRun(tripRunId, e, {
              mode_final: finalMode,
              fallback_used: usedFallback,
              latency_ms: Date.now() - startTime,
            });
          } catch (error: any) {
            this.logger.warn(`Failed to update TripRun to FAILED: ${error.message}`);
          }
        }
        
        // 🆕 尝试提取部分决策日志
        let partialDecisionLog: DecisionLogEntry[] | undefined;
        if (finalMode === 'CLAUDE_SM' && e?.message?.startsWith('TIMEOUT:CLAUDE_SM')) {
          this.logger.warn(`[AgentService] 状态机超时，无法提取部分结果`);
        }
        
        return this.buildFailureResponse(request, startTime, nf, {
          mode_final: finalMode,
          fallback_used: usedFallback,
          deadline_ms: deadline.totalMs,
          time_remaining_ms: deadline.remainingMs(),
        }, partialDecisionLog);
      }

      // 这部分代码已被稳定化层统一处理，不再需要
      // 1. 创建初始状态
      const initialState = this.stateService.createInitialState(
        request.message,
        request.user_id,
        request.trip_id,
        request.options
      );

      // 2. 路由决策
      const routerStartTime = Date.now();
      const routeOutput = await this.router.route(
        request.message,
        {
          tripId: request.trip_id,
          recentMessages: request.conversation_context?.recent_messages,
          userId: request.user_id,
        },
        initialState.request_id
      );
      const routerMs = Date.now() - routerStartTime;

      // 更新状态中的 router_ms
      let state = this.stateService.update(initialState.request_id, {
        observability: {
          ...initialState.observability,
          router_ms: routerMs,
        },
      });

      // 3. 检查 webbrowse 授权
      if (routeOutput.route === RouteType.SYSTEM2_WEBBROWSE && !request.options?.allow_webbrowse) {
        // 记录 webbrowse_blocked 事件
        this.eventTelemetry?.recordWebbrowseBlocked(
          initialState.request_id,
          'User consent not provided',
          { route: routeOutput.route, consent_required: routeOutput.consent_required ?? false }
        );
        
        // 降级到 System2_REASONING
        routeOutput.route = RouteType.SYSTEM2_REASONING;
        routeOutput.confidence = 0.7;
        routeOutput.reasons = [RouterReason.NO_API];
        routeOutput.consent_required = false;
        
        this.eventTelemetry?.recordFallbackTriggered(
          initialState.request_id,
          RouteType.SYSTEM2_WEBBROWSE,
          RouteType.SYSTEM2_REASONING,
          'Webbrowse blocked due to missing consent',
          { original_route: RouteType.SYSTEM2_WEBBROWSE }
        );
      }

      // 4. 根据路由执行
      let result: any;
      let answerText = '';

      if (routeOutput.route.startsWith('SYSTEM1')) {
        // System 1 快速路径
        const system1Result = await this.system1Executor.execute(routeOutput.route, state);
        result = system1Result.result;
        answerText = system1Result.answerText ?? '';
        
        state = this.stateService.update(state.request_id, {
          result: {
            ...state.result,
            status: system1Result.success ? 'READY' : 'NEED_MORE_INFO',
          },
        });
      } else {
        // System 2 慢速路径（Plan-and-Execute Agent）
        // 使用新的 DAG Orchestrator 替代 ReAct 循环
        if (this.dagOrchestrator) {
          // 使用 Plan-and-Execute Agent (并行编排器)
          state = await this.executeSystem2PlanAndExecute(state, routeOutput.budget, request);
        } else {
          // 降级：使用原有的 ReAct 循环
          this.logger.warn('DAGOrchestratorService 未可用，降级使用 ReAct 循环');
          state = await this.orchestrator.execute(state, routeOutput.budget);
        }
        
        // 从状态中提取结果
        result = {
          timeline: state.result.timeline,
          dropped_items: state.result.dropped_items,
          candidates: [],
          evidence: [],
          robustness: state.compute.robustness,
        };
        
        answerText = this.generateAnswerText(state);
      }

      // 4. 计算 token 数量
      const tokensEst = TokenCalculator.estimateTotalTokens(
        request.message,
        answerText,
        {
          route: routeOutput,
          result: result,
          state: {
            trip: state.trip,
            memory: state.memory,
            compute: state.compute,
            result: state.result,
          },
        }
      );

      // 5. 构建响应
      const latency = Date.now() - startTime;
      const response: RouteAndRunResponseDto = {
        request_id: request.request_id,
        route: routeOutput,
        result: {
          status: this.mapStateStatusToResultStatus(state.result.status),
          answer_text: answerText,
          payload: {
            ...result,
            // 🕵️ HITL: 如果状态是 SUSPENDED，在 payload 中包含 suspensionInfo
            ...(state.result.status === 'SUSPENDED' && state.result.suspensionInfo
              ? { suspensionInfo: state.result.suspensionInfo }
              : {}),
          },
        },
        explain: {
          decision_log: state.react.decision_log.map(log => ({
            request_id: state.request_id,
            step: 'DONE' as OrchestrationStep, // LEGACY 模式使用 DONE 作为默认步骤
            actor: 'Orchestrator' as SubAgentType,
            inputs_summary: `Action: ${log.chosen_action}, Reason: ${log.reason_code}`,
            outputs_summary: `执行了 ${log.chosen_action}，策略: ${log.policy_id}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              step_number: log.step,
              facts: log.facts,
              policy_id: log.policy_id,
            },
          })),
        },
        observability: {
          latency_ms: latency,
          router_ms: routerMs,
          system_mode: routeOutput.route.startsWith('SYSTEM1') ? 'SYSTEM1' : 'SYSTEM2',
          tool_calls: state.observability.tool_calls,
          browser_steps: state.observability.browser_steps,
          tokens_est: tokensEst,
          cost_est_usd: state.observability.cost_est_usd,
          fallback_used: state.observability.fallback_used,
          // Trace 信息（用于观测和回放）
          // 注意：LEGACY 模式也需要 trace，但 signals 可能为空（如果未启用 Claude）
          trace: traceInfo || {
            orchestration: {
              resolved: {
                mode: 'LEGACY',
                reason: 'Claude orchestration disabled, using legacy routing',
                matchedRules: ['legacy_fallback'],
              },
            },
            timestamp: new Date().toISOString(),
            orchestration_mode: 'LEGACY',
          },
        },
      };

      this.logger.debug(`Request completed: ${request.request_id}, latency: ${latency}ms`);

      // 提取并记录 Metrics
      const metrics = extractMetricsFromResponse(response);
      if (metrics) {
        if (metrics.redirect_reason && metrics.entry_point) {
          MetricsRecorder.recordRedirect(metrics.redirect_reason as any, metrics.entry_point);
        }
        if (metrics.error_type) {
          MetricsRecorder.recordClarification(String(metrics.error_type));
        }
        if (metrics.decision_log_completeness !== undefined) {
          MetricsRecorder.recordDecisionLogCompleteness(Number(metrics.decision_log_completeness));
        }
      }

      // 缓存响应（用于请求去重）
      if (this.requestDeduplication && !request.options?.dry_run) {
        // TypeScript 无法正确推断可选链，使用非空断言
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const dedupService = this.requestDeduplication!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const requestHash = dedupService!.generateRequestHash(request);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        dedupService!.cacheResponse(requestHash, response);
      }

      // 记录 agent_complete 事件
      this.eventTelemetry?.recordAgentComplete(
        request.request_id,
        response.result.status,
        latency,
        tokensEst ?? 0,
        state.observability.cost_est_usd ?? 0,
        {
          route: routeOutput.route,
          system_mode: response.observability.system_mode ?? 'SYSTEM2',
          tool_calls: response.observability.tool_calls ?? 0,
          browser_steps: response.observability.browser_steps ?? 0,
        }
      );

      return response;
    } catch (error: any) {
      this.logger.error(`Agent service error: ${error?.message || String(error)}`, error?.stack);
      
      // === 更新 TripRun 为 FAILED（最外层 catch） ===
      if (tripRunId && this.tripRunManager) {
        try {
          await this.tripRunManager.failTripRun(tripRunId, error, {
            error_type: 'unhandled_exception',
            caught_at: 'routeAndRun_outer_catch',
          });
        } catch (updateError: any) {
          this.logger.warn(`Failed to update TripRun to FAILED in outer catch: ${updateError.message}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * 映射状态状态到结果状态
   */
  private mapStateStatusToResultStatus(
    stateStatus: AgentState['result']['status']
  ): 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT' {
    const mapping: Record<AgentState['result']['status'], 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT'> = {
      READY: 'OK',
      DRAFT: 'NEED_MORE_INFO',
      NEED_MORE_INFO: 'NEED_MORE_INFO',
      NEED_CONSENT: 'NEED_CONSENT',
      SUSPENDED: 'NEED_CONFIRMATION', // 🕵️ HITL: SUSPENDED 映射到 NEED_CONFIRMATION
      FAILED: 'FAILED',
      TIMEOUT: 'TIMEOUT',
    };
    return mapping[stateStatus] || 'FAILED';
  }

  /**
   * 生成答案文本
   */
  private generateAnswerText(state: AgentState): string {
    if (state.result.status === 'READY') {
      if (state.result.timeline && state.result.timeline.length > 0) {
        return `已为您规划好行程，包含 ${state.result.timeline.length} 个节点。`;
      }
      return '处理完成。';
    }

    if (state.result.status === 'NEED_MORE_INFO') {
      return '需要更多信息才能完成规划，请提供日期、人数、城市或预算等信息。';
    }

    // 🕵️ HITL: 处理 SUSPENDED 状态
    if (state.result.status === 'SUSPENDED') {
      const suspensionInfo = state.result.suspensionInfo;
      if (suspensionInfo) {
        return `操作需要您的确认：${suspensionInfo.summary}。请查看审批请求（ID: ${suspensionInfo.approvalId}）。`;
      }
      return '操作需要您的确认，请查看审批请求。';
    }

    if (state.result.status === 'FAILED') {
      return '无法完成规划，请检查约束条件或联系客服。';
    }

    if (state.result.status === 'TIMEOUT') {
      return '处理超时，请稍后重试或简化请求。';
    }

    return '正在处理中...';
  }

  /**
   * 执行 System 2 Plan-and-Execute Agent
   * 
   * 使用 DAG Orchestrator 替代 ReAct 循环
   */
  private async executeSystem2PlanAndExecute(
    state: AgentState,
    budget: {
      max_seconds: number;
      max_steps: number;
      max_browser_steps: number;
    },
    request: RouteAndRunRequestDto,
  ): Promise<AgentState> {
    if (!this.dagOrchestrator) {
      throw new Error('DAGOrchestratorService 未可用');
    }

    this.logger.log(`[Agent] 使用 Plan-and-Execute Agent 执行 System2 任务`);

    try {
      // 1. 调用 DAG Orchestrator（传递 tripId 等上下文信息）
      const dagResult = await this.dagOrchestrator.run(
        state.request_id,
        request.message,
        {
          tripId: request.trip_id,
          userId: request.user_id,
          requestId: request.request_id,
        },
      );

      // 2. 将 DAG 结果转换回 AgentState
      const updatedState = this.convertDAGResultToAgentState(state, dagResult);

      // 3. 更新状态
      return this.stateService.update(state.request_id, updatedState);
    } catch (error: any) {
      this.logger.error(`Plan-and-Execute Agent 执行失败: ${error.message}`, error.stack);
      
      // 降级：标记为失败
      return this.stateService.update(state.request_id, {
        result: {
          ...state.result,
          status: 'FAILED',
          explanations: [
            ...(state.result.explanations || []),
            `Plan-and-Execute Agent 执行失败: ${error.message}`,
          ],
        },
      });
    }
  }

  /**
   * 将 DAG 编排结果转换回 AgentState
   */
  private convertDAGResultToAgentState(
    originalState: AgentState,
    dagResult: any,
  ): Partial<AgentState> {
    // 根据 DAG 结果更新 AgentState
    const explanations: string[] = [
      ...(originalState.result.explanations || []),
      dagResult.summary || 'Plan-and-Execute Agent 执行完成',
    ];

    // 从 memory 中提取关键信息
    const memoryKeys = Object.keys(dagResult.memory || {});
    const completedTasks = dagResult.plan?.filter((t: any) => t.status === 'completed') || [];

    // 构建解释
    if (completedTasks.length > 0) {
      explanations.push(`成功执行 ${completedTasks.length} 个任务`);
    }

    // 确定最终状态
    let finalStatus: AgentState['result']['status'] = 'READY';
    if (dagResult.status === 'failed') {
      finalStatus = 'FAILED';
    } else if (dagResult.status === 'timeout' || dagResult.status === 'deadlock') {
      finalStatus = 'TIMEOUT';
    } else if (dagResult.status === 'done') {
      finalStatus = 'READY';
    }

    // 检查是否有审批挂起
    const suspendedTask = dagResult.plan?.find((t: any) => 
      t.result && t.result.includes('SUSPENDED')
    );
    if (suspendedTask) {
      finalStatus = 'SUSPENDED';
    }

    // 扩展 memory（使用类型断言，因为 memory 类型是严格的）
    const updatedMemory = { ...originalState.memory };
    (updatedMemory as any).dagResult = {
      taskCount: dagResult.plan?.length || 0,
      completedCount: completedTasks.length,
      memoryKeys,
      status: dagResult.status,
    };

    return {
      result: {
        ...originalState.result,
        status: finalStatus,
        explanations,
      },
      memory: updatedMemory as typeof originalState.memory,
      observability: {
        ...originalState.observability,
        tool_calls: (originalState.observability.tool_calls || 0) + (dagResult.plan?.length || 0),
      },
    };
  }

  /**
   * 使用 Claude 编排的路由和执行
   */
  /**
   * 使用 Claude 编排（状态机版本）
   */
  private async routeAndRunWithClaudeStateMachine(
    request: RouteAndRunRequestDto,
    startTime: number,
    traceInfo?: { orchestration: any; timestamp: string },
    deadline?: { remainingMs: () => number; clamp: (ms: number) => number },
  ): Promise<RouteAndRunResponseDto> {
    this.logger.log(`[AgentService] 使用 Claude 状态机编排: request_id=${request.request_id}`);

    if (!this.claudeOrchestrator) {
      throw new Error('ClaudeOrchestratorService 未注入');
    }

    // 构建 AgentContext
    const context: AgentContext = {
      requestId: request.request_id,
      userId: request.user_id,
      tripId: request.trip_id,
      conversationHistory: request.conversation_context?.recent_messages,
    };

      // Policy 预判定（与 Gate 合并见 deriveExternalVerdict）；失败不阻断主链
      let policyAction: PolicyAction | undefined;
      if (this.rlIntegration) {
        try {
          const pre = await this.rlIntegration.preDecision({
            requestId: request.request_id,
            tripId: request.trip_id || undefined,
            userRequest: request.message,
            action: 'route_and_run',
            params: {
              userId: request.user_id,
            },
          });
          policyAction = pre.action;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[AgentService] RL preDecision 跳过: ${msg}`);
        }
      }

      // 调用状态机编排（传递 deadline）
      this.logger.log(`[AgentService] 调用状态机编排: request_id=${request.request_id}, deadline=${deadline?.remainingMs() || 'N/A'}ms`);
      const orchestrationResult = await this.claudeOrchestrator.orchestrateWithStateMachine(request, context, deadline);
      
      // 调试日志：记录状态机执行结果
      this.logger.log(`[AgentService] 状态机执行完成: success=${orchestrationResult.success}, decisionLog.length=${orchestrationResult.decisionLog?.length || 0}`);
      if (orchestrationResult.result?.state) {
        this.logger.log(`[AgentService] 状态机状态: current_step=${orchestrationResult.result.state.current_step}, decision_log.length=${orchestrationResult.result.state.decision_log?.length || 0}`);
      }

    // 构建响应
    const latency = Date.now() - startTime;
    
    // P1 改进：映射状态机步骤到 UI 状态（包含时间预期）
    const currentStep = orchestrationResult.result?.state?.current_step || (orchestrationResult.success ? 'DONE' : 'FAILED');
    const gateResult = orchestrationResult.result?.gate_result?.gate_result;
    
    // 🆕 计算已用时间（从状态机开始时间计算）
    const stateStartedAt = orchestrationResult.result?.state?.metadata?.started_at;
    const elapsedTime = stateStartedAt 
      ? Date.now() - new Date(stateStartedAt).getTime()
      : latency;
    
      const uiState = this.mapOrchestrationStepToUIState(
        currentStep as OrchestrationStep, 
        gateResult,
        elapsedTime
      );
    
      // 检查是否是超时错误（优先级最高）
      const isTimeout = !orchestrationResult.success && 
        (orchestrationResult.result?.errorType === ErrorType.TIMEOUT_ERROR ||
         orchestrationResult.result?.state?.current_step === 'TIMEOUT' ||
         orchestrationResult.answerText?.includes('超时') ||
         orchestrationResult.answerText?.includes('timeout') ||
         orchestrationResult.answerText?.includes('TIMEOUT'));
      
      // 检查是否需要用户澄清
      const needsUserConfirmation = !orchestrationResult.success && 
        !isTimeout &&
        orchestrationResult.result?.needsUserConfirmation === true;

      const rawState = orchestrationResult.result?.state;
      const verdict = deriveExternalVerdict({
        gateResult: orchestrationResult.result?.gate_result,
        intakeClarifyShortCircuit: shouldIntakeClarifyShortCircuit(rawState),
        policyAction,
        orchestrationSuccess: orchestrationResult.success,
        needsUserConfirmation,
      });
      const finalVerdict =
        rawState?.metadata?.fallback_used === true ? 'ALLOW_WITH_FALLBACK' : verdict;
      const stateWithVerdict =
        rawState !== undefined ? { ...rawState, verdict: finalVerdict } : undefined;

      const k3DecisionLog = this.resolveCanonicalDecisionLogForK3(orchestrationResult);
      
      // 确定状态：超时 > 关键依赖缺失 > 其他失败
      const resultStatus = isTimeout
        ? 'TIMEOUT'
        : (needsUserConfirmation 
          ? 'NEED_MORE_INFO' 
          : (orchestrationResult.success ? 'OK' : 'FAILED'));

      const response: RouteAndRunResponseDto = {
        request_id: request.request_id,
        route: {
          route: orchestrationResult.success ? RouteType.SYSTEM2_REASONING : RouteType.SYSTEM2_REASONING,
          confidence: 0.8,
          reasons: [RouterReason.LLM_DECISION],
          required_capabilities: ['planning'],
          consent_required: false,
          budget: {
            max_seconds: request.options?.max_seconds || 60,
            max_steps: request.options?.max_steps || 8,
            max_browser_steps: request.options?.max_browser_steps || 0,
          },
          ui_hint: {
            mode: 'slow',
            status: isTimeout
              ? UIStatus.FAILED
              : (needsUserConfirmation 
                ? UIStatus.AWAITING_CONFIRMATION 
                : (orchestrationResult.success ? UIStatus.DONE : UIStatus.FAILED)),
            message: isTimeout
              ? '请求超时，请缩小范围或稍后重试。'
              : (needsUserConfirmation 
                ? '需要您的确认' 
                : (orchestrationResult.success ? '处理完成' : '处理失败')),
          },
        },
        // P1 改进：UI 状态映射
        ui_state: uiState,
        result: {
          status: resultStatus,
          answer_text: isTimeout
            ? '请求超时，请缩小范围或稍后重试。'
            : (needsUserConfirmation 
              ? (orchestrationResult.result?.clarificationMessage || orchestrationResult.answerText)
              : orchestrationResult.answerText),
          payload: {
            timeline: orchestrationResult.result?.itinerary?.days || [],
            dropped_items: [],
            candidates: [],
            evidence: stateWithVerdict?.decision_log || [],
            robustness: orchestrationResult.result?.itinerary?.metadata?.robustness_score || null,
            // 状态机编排结果
            orchestrationResult: orchestrationResult.result && stateWithVerdict 
              ? {
                  state: stateWithVerdict,
                  itinerary: orchestrationResult.result.itinerary,
                  gate_result: orchestrationResult.result.gate_result,
                  decision_log: k3DecisionLog,
                } 
              : undefined,
            travelOntologyState: this.resolveTravelOntologyForPayload(orchestrationResult.result),
            jepa: this.buildJePaPayload(
              orchestrationResult.result?.decisionState,
              stateWithVerdict,
            ),
            fallbackPlan: orchestrationResult.result?.state?.metadata?.fallback_plan,
            fallbackExplain: orchestrationResult.result?.state?.metadata?.fallback_explain,
            fallbackPlans: orchestrationResult.result?.state?.metadata?.fallback_plans,
            fallbackSelectedStrategy:
              orchestrationResult.result?.state?.metadata?.fallback_selected_strategy,
            fallbackTemplateVersion:
              orchestrationResult.result?.state?.metadata?.fallback_template_version,
            fallbackPacingMode:
              orchestrationResult.result?.state?.metadata?.fallback_pacing_mode,
            poiTrace: orchestrationResult.result?.state?.metadata?.poi_trace,
            // 超时错误字段
            ...(isTimeout ? {
              errorType: ErrorType.TIMEOUT_ERROR,
            } : {}),
            // 澄清消息相关字段（统一放在 payload 中）
            ...(needsUserConfirmation ? {
              needsUserConfirmation: true,
              clarificationMessage: orchestrationResult.result?.clarificationMessage,
              clarificationQuestions: orchestrationResult.result?.clarificationQuestions,
              missingServices: orchestrationResult.result?.missingServices || [],
              solutions: orchestrationResult.result?.solutions || [],
              errorType: orchestrationResult.result?.errorType,
            } : {}),
          },
        },
        explain: {
          decision_log: k3DecisionLog,
          // 🆕 生成简化版解释（减少认知负荷）
          simplified_explanation: this.generateSimplifiedExplanation(
            k3DecisionLog,
            orchestrationResult.result?.gate_result,
            orchestrationResult.result?.itinerary
          ),
          // 🆕 生成AI能力展示（信任建立机制）
          ai_capability_display: this.generateAICapabilityDisplay(
            orchestrationResult,
            orchestrationResult.result?.gate_result,
            stateWithVerdict
          ),
          optimization: this.buildOptimizationExplain(orchestrationResult.result?.decisionState),
        },
        observability: {
          latency_ms: latency,
          router_ms: 0,
          system_mode: 'SYSTEM2',
        tool_calls: orchestrationResult.stepsExecuted?.length || 0,
        browser_steps: 0,
        tokens_est: 0, // TODO: 计算 token
        cost_est_usd: orchestrationResult.totalCost || 0,
        fallback_used: orchestrationResult.result?.state?.metadata?.fallback_used === true,
        fallback_template_version:
          orchestrationResult.result?.state?.metadata?.fallback_template_version,
        fallback_data_source:
          orchestrationResult.result?.state?.metadata?.fallback_data_source,
        fallback_source_confidence:
          orchestrationResult.result?.state?.metadata?.fallback_source_confidence,
        fallback_pacing_mode:
          orchestrationResult.result?.state?.metadata?.fallback_pacing_mode,
        orchestration_request_id: request.request_id,
        current_step: orchestrationResult.result?.state?.current_step,
        // Trace 信息（用于观测和回放）
        trace: traceInfo,
        // P4 可观测性
        ...this.computeP4ObservabilityMetrics(orchestrationResult),
      },
    };

    // 提取并记录 Metrics
    const metrics = extractMetricsFromResponse(response);
    if (metrics.error_type) {
      MetricsRecorder.recordClarification(metrics.error_type);
    }
    if (metrics.decision_log_completeness !== undefined) {
      MetricsRecorder.recordDecisionLogCompleteness(metrics.decision_log_completeness);
    }

    return response;
  }

  private async routeAndRunWithClaude(
    request: RouteAndRunRequestDto,
    startTime: number,
    traceInfo?: { orchestration: any; timestamp: string },
    deadline?: { remainingMs: () => number; clamp: (ms: number) => number },
  ): Promise<RouteAndRunResponseDto> {
    if (!this.claudeOrchestrator) {
      throw new Error('ClaudeOrchestratorService 未可用');
    }

    try {
      // 构建 Agent 上下文
      const context: AgentContext = {
        requestId: request.request_id,
        userId: request.user_id,
        tripId: request.trip_id,
        conversationHistory: request.conversation_context?.recent_messages,
        userPreferences: {},
      };

      // 使用 Claude 编排（传递 deadline）
      const orchestrationResult = await this.claudeOrchestrator.orchestrate(request, context, deadline);

      // 检查是否是 System 1 路径
      const route = orchestrationResult.result?.routingDecision?.route || RouteType.SYSTEM2_REASONING;
      const isSystem1 = route.startsWith('SYSTEM1');

      // 如果是 System 1 路径，需要调用 System1Executor 执行
      if (isSystem1 && orchestrationResult.success) {
        this.logger.debug(`[AgentService] Claude 编排返回 System 1 路径: ${route}`);
        
        // 创建临时状态用于 System 1 执行
        const tempState = this.stateService.createInitialState(
          request.message,
          request.user_id,
          request.trip_id,
          request.options
        );

        // 调用 System1Executor 执行
        const system1Result = await this.system1Executor.execute(route as RouteType, tempState);
        
        // 构建响应（结合 Claude 编排的决策日志）
        const latency = Date.now() - startTime;
        return {
          request_id: request.request_id,
          route: {
            route: route as RouteType,
            confidence: orchestrationResult.result?.routingDecision?.confidence || 0.8,
            reasons: [RouterReason.LLM_DECISION],
            required_capabilities: orchestrationResult.result?.routingDecision?.requiredCapabilities || [],
            consent_required: false,
            budget: orchestrationResult.result?.routingDecision?.budget || {
              max_seconds: 3,
              max_steps: 1,
              max_browser_steps: 0,
            },
            ui_hint: {
              mode: 'fast',
              status: system1Result.success ? UIStatus.DONE : UIStatus.FAILED,
              message: system1Result.success ? '处理完成' : '处理失败',
            },
          },
          result: {
            status: system1Result.success ? 'OK' : 'FAILED',
            answer_text: system1Result.answerText ?? '',
            payload: {
              timeline: system1Result.result?.timeline || [],
              dropped_items: system1Result.result?.dropped_items || [],
              candidates: system1Result.result?.candidates || [],
              evidence: system1Result.result?.evidence || [],
              robustness: system1Result.result?.robustness || null,
            },
          },
          explain: {
            decision_log: orchestrationResult.decisionLog || [],
            // 🆕 生成简化版解释（减少认知负荷）
            simplified_explanation: this.generateSimplifiedExplanation(
              orchestrationResult.decisionLog || [],
              orchestrationResult.result?.gate_result,
              orchestrationResult.result?.itinerary
            ),
            // 🆕 生成AI能力展示（信任建立机制）
            ai_capability_display: this.generateAICapabilityDisplay(
              orchestrationResult,
              orchestrationResult.result?.gate_result,
              orchestrationResult.result?.state
            ),
            optimization: this.buildOptimizationExplain(orchestrationResult.result?.decisionState),
          },
          observability: {
            latency_ms: latency,
            router_ms: 0, // Claude 编排包含路由决策
            system_mode: 'SYSTEM1',
            tool_calls: 1,
            browser_steps: 0,
            tokens_est: 0,
            cost_est_usd: 0,
            fallback_used: false,
            orchestration_request_id: request.request_id,
            current_step: orchestrationResult.result?.state?.current_step,
            trace: traceInfo, // Trace 信息（用于观测和回放）
            ...this.computeP4ObservabilityMetrics(orchestrationResult),
          },
        };
      }

      // System 2 路径：使用编排结果
      const latency = Date.now() - startTime;
      
      // 检查是否是超时错误（优先级最高）
      const isTimeout = !orchestrationResult.success && 
        (orchestrationResult.result?.errorType === ErrorType.TIMEOUT_ERROR ||
         orchestrationResult.answerText?.includes('超时') ||
         orchestrationResult.answerText?.includes('timeout') ||
         orchestrationResult.answerText?.includes('TIMEOUT'));
      
      // 检查是否是关键依赖缺失（需要用户澄清）
      const needsUserConfirmation = !orchestrationResult.success && 
        !isTimeout &&
        orchestrationResult.result?.needsUserConfirmation === true;
      const clarificationMessage = orchestrationResult.result?.clarificationMessage || orchestrationResult.answerText;
      
      // 确定状态：超时 > 关键依赖缺失 > 其他失败
      const resultStatus = isTimeout
        ? 'TIMEOUT'
        : (needsUserConfirmation 
          ? 'NEED_MORE_INFO' 
          : (orchestrationResult.success ? 'OK' : 'FAILED'));

      const k3DecisionLogClaude = this.resolveCanonicalDecisionLogForK3(orchestrationResult);
      
      const response: RouteAndRunResponseDto = {
        request_id: request.request_id,
        route: {
          route: route as RouteType,
          confidence: orchestrationResult.result?.routingDecision?.confidence || 0.8,
          reasons: [RouterReason.LLM_DECISION],
          required_capabilities: orchestrationResult.result?.routingDecision?.requiredCapabilities || [],
          consent_required: orchestrationResult.result?.routingDecision?.consentRequired || false,
          budget: orchestrationResult.result?.routingDecision?.budget || {
            max_seconds: 60,
            max_steps: 8,
            max_browser_steps: 0,
          },
          ui_hint: {
            mode: isSystem1 ? 'fast' : 'slow',
            status: isTimeout
              ? UIStatus.FAILED
              : (needsUserConfirmation 
                ? UIStatus.AWAITING_CONFIRMATION 
                : (orchestrationResult.success ? UIStatus.DONE : UIStatus.FAILED)),
            message: isTimeout
              ? '请求超时，请缩小范围或稍后重试。'
              : (needsUserConfirmation 
                ? '需要您的确认' 
                : (orchestrationResult.success ? '处理完成' : '处理失败')),
          },
        },
        result: {
          status: resultStatus,
          answer_text: isTimeout 
            ? '请求超时，请缩小范围或稍后重试。'
            : (needsUserConfirmation ? clarificationMessage : orchestrationResult.answerText),
          payload: {
            timeline: [],
            dropped_items: [],
            candidates: [],
            evidence: [],
            robustness: null,
            // 扩展 payload 以包含编排结果
            ...(orchestrationResult.result && orchestrationResult.result.state 
              ? { 
                  orchestrationResult: {
                    state: orchestrationResult.result.state,
                    itinerary: orchestrationResult.result.itinerary,
                    gate_result: orchestrationResult.result.gate_result,
                    decision_log: k3DecisionLogClaude,
                  }
                } 
              : {}),
            travelOntologyState: this.resolveTravelOntologyForPayload(orchestrationResult.result),
            // 超时错误字段
            ...(isTimeout ? {
              errorType: ErrorType.TIMEOUT_ERROR,
            } : {}),
            // 澄清消息相关字段（统一放在 payload 中）
            ...(needsUserConfirmation ? {
              needsUserConfirmation: true,
              clarificationMessage: orchestrationResult.result?.clarificationMessage,
              clarificationQuestions: orchestrationResult.result?.clarificationQuestions,
              missingServices: orchestrationResult.result?.missingServices || [],
              solutions: orchestrationResult.result?.solutions || [],
              errorType: orchestrationResult.result?.errorType,
            } : {}),
          },
        },
        explain: {
          decision_log: k3DecisionLogClaude,
        },
        observability: {
          latency_ms: latency,
          router_ms: 0, // Claude 编排包含路由决策
          system_mode: isSystem1 ? 'SYSTEM1' : 'SYSTEM2',
          tool_calls: orchestrationResult.stepsExecuted.length,
          browser_steps: 0,
          tokens_est: TokenCalculator.estimateTotalTokens(
            request.message,
            orchestrationResult.answerText,
            {
              orchestrationResult: orchestrationResult.result,
              stepsExecuted: orchestrationResult.stepsExecuted,
              decisionLog: k3DecisionLogClaude,
            }
          ),
        cost_est_usd: orchestrationResult.totalCost || 0,
        fallback_used: false,
        orchestration_request_id: request.request_id,
        current_step: orchestrationResult.result?.state?.current_step,
        // Trace 信息（用于观测和回放）
        trace: traceInfo,
        // P4 可观测性
        ...this.computeP4ObservabilityMetrics(orchestrationResult),
      },
    };

    return response;
    } catch (error: any) {
      this.logger.error(`[AgentService] Claude 编排失败: ${error?.message || String(error)}`, error?.stack);
      
      // 降级到原有逻辑
      this.logger.warn('[AgentService] Claude 编排失败，降级使用原有路由逻辑');
      // 移除 Feature Flag，重新执行原有逻辑
      const fallbackRequest = {
        ...request,
        options: {
          ...request.options,
          use_claude_orchestration: false,
        },
      };
      return this.routeAndRun(fallbackRequest);
    }
  }

  /**
   * 判断是否是规划请求（需要重定向到规划工作台）
   * 
   * 核心原则：只拦截从零开始的行程规划请求，不拦截已创建行程的查询/修改请求
   */
  private isPlanningRequest(request: RouteAndRunRequestDto): boolean {
    const message = request.message.toLowerCase().trim();
    const hasNoTripId = !request.trip_id || request.trip_id === '';
    
    // 如果已有 trip_id，肯定不是规划请求（可能是查询已有行程的规划）
    if (!hasNoTripId) {
      return false;
    }
    
    // 白名单：明确不是规划请求的关键词
    const excludeKeywords = [
      '查询规划', '查看规划', '显示规划', '规划查询', '规划详情',
      'query plan', 'show plan', 'view plan', 'display plan', 'plan details'
    ];
    
    if (excludeKeywords.some(keyword => message.includes(keyword))) {
      return false;
    }
    
    // 规则1: 明确包含规划关键词
    const planningKeywords = [
      '规划', 'plan', '设计', '制定', '安排', '行程规划',
      '帮我规划', '帮我设计', '帮我安排', '生成行程',
      'create a trip', 'plan a trip', 'design itinerary', 'make itinerary'
    ];
    
    const hasPlanningKeyword = planningKeywords.some(keyword => 
      message.includes(keyword)
    );
    
    // 规则2: 明确提到"新行程"、"第一次"等
    const isNewTrip = /(?:新|第一次|first time|new trip)/.test(message);
    
    // 规则3: 包含目的地和天数（更严格：必须同时有目的地+天数+规划关键词）
    const destinationPattern = /(?:去|到|visit|go to|travel to)\s+([\u4e00-\u9fa5]{2,}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;
    const daysPattern = /\d+\s*(?:天|days?|day)/;
    const hasDestinationAndDays = destinationPattern.test(message) && 
                                   daysPattern.test(message) && 
                                   hasPlanningKeyword; // 必须同时有规划关键词
    
    // 规则4: 包含"从零开始"、"从头规划"等明确表达
    const isFromScratch = /(?:从零开始|从头规划|from scratch|start from)/.test(message);
    
    return hasPlanningKeyword || 
           isNewTrip ||
           hasDestinationAndDays ||
           isFromScratch;
  }

  /**
   * 判断是否是修改类请求
   * 
   * 注意：这个判断可能不够准确，建议：
   * 1. 使用 LLM 进行更准确的意图识别（但会增加延迟）
   * 2. 基于用户反馈持续优化关键词列表
   * 3. 考虑使用机器学习模型
   */
  private isModificationRequest(message: string): boolean {
    const messageLower = message.toLowerCase().trim();
    
    // 修改类关键词（中文）
    const modificationKeywordsCN = [
      '修改', '删除', '添加', '更新', '调整', '变更', '替换', '移除',
      '增加', '减少', '编辑', '改动', '更改',
    ];
    
    // 修改类关键词（英文）
    const modificationKeywordsEN = [
      'modify', 'delete', 'remove', 'add', 'update', 'change', 'adjust', 'edit',
      'replace', 'insert', 'append', 'drop', 'alter',
    ];
    
    // 检查是否包含修改类关键词
    const hasModificationKeyword = [
      ...modificationKeywordsCN,
      ...modificationKeywordsEN,
    ].some(keyword => messageLower.includes(keyword));
    
    // 排除查询类表达（避免误判）
    const queryKeywords = [
      '查询', '查看', '显示', '展示', '了解', '知道', '看看',
      'query', 'show', 'display', 'view', 'see', 'check', 'get',
    ];
    
    const hasQueryKeyword = queryKeywords.some(keyword => messageLower.includes(keyword));
    
    // 如果同时包含查询和修改关键词，根据位置判断意图
    if (hasQueryKeyword && hasModificationKeyword) {
      // 检查查询关键词是否在修改关键词之前（更可能是查询意图）
      const queryIndices = queryKeywords.map(k => messageLower.indexOf(k)).filter(i => i >= 0);
      const modIndices = [...modificationKeywordsCN, ...modificationKeywordsEN]
        .map(k => messageLower.indexOf(k)).filter(i => i >= 0);
      
      if (queryIndices.length > 0 && modIndices.length > 0) {
        const queryIndex = Math.min(...queryIndices);
        const modIndex = Math.min(...modIndices);
        if (queryIndex < modIndex) {
          return false; // 查询意图更强（查询关键词在前）
        } else {
          return true; // 修改意图更强（修改关键词在前）
        }
      }
    }
    
    return hasModificationKeyword && !hasQueryKeyword;
  }

  /**
   * 创建缺少 trip_id 的错误响应
   */
  private createMissingTripIdErrorResponse(
    request: RouteAndRunRequestDto,
    startTime: number
  ): RouteAndRunResponseDto {
    const latency = Date.now() - startTime;
    
    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING, // 保持兼容
        confidence: 1.0,
        reasons: [RouterReason.MISSING_INFO],
        required_capabilities: [],
        consent_required: false,
        budget: {
          max_seconds: 60,
          max_steps: 8,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: 'slow',
          status: UIStatus.AWAITING_CONFIRMATION,
          message: '需要选择行程',
        },
      },
      result: {
        status: 'FAILED',
        answer_text: '智能体统一入口只为具体行程服务，请提供 trip_id。如果您想规划新行程，请使用规划工作台。',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          redirectInfo: {
            redirect_to: '/planning-workbench/execute',
            redirect_reason: 'MISSING_TRIP_ID',
            original_request: {
              message: request.message.substring(0, 200), // 限制长度并脱敏
              user_id: request.user_id,
              trip_id: request.trip_id || undefined,
            },
          },
        },
      },
      explain: {
        decision_log: [{
          request_id: request.request_id,
          step: 'INTAKE' as OrchestrationStep,
          actor: 'Router' as SubAgentType,
          inputs_summary: `缺少 trip_id: ${request.message}`,
          outputs_summary: '返回错误提示',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            error_code: 'MISSING_TRIP_ID',
          },
        }],
        // 🆕 生成简化版解释（减少认知负荷）
        simplified_explanation: this.generateSimplifiedExplanation(
          [{
            request_id: request.request_id,
            step: 'INTAKE' as OrchestrationStep,
            actor: 'Router' as SubAgentType,
            inputs_summary: `缺少 trip_id: ${request.message}`,
            outputs_summary: '返回错误提示',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
          }],
          undefined
        ),
      },
      observability: {
        latency_ms: latency,
        router_ms: latency,
        system_mode: 'SYSTEM1',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        trace: {
          orchestration: {
            resolved: {
              mode: 'LEGACY',
              reason: 'Missing trip_id, returning error',
              matchedRules: ['TRIP_ID_REQUIRED'],
            },
          },
          timestamp: new Date().toISOString(),
        },
      },
    };
  }

  /**
   * 创建只读模式限制的响应
   */
  private createReadonlyModeRestrictionResponse(
    request: RouteAndRunRequestDto,
    startTime: number
  ): RouteAndRunResponseDto {
    const latency = Date.now() - startTime;
    
    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 1.0,
        reasons: [RouterReason.HIGH_RISK_ACTION],
        required_capabilities: [],
        consent_required: false,
        budget: {
          max_seconds: 60,
          max_steps: 8,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: 'slow',
          status: UIStatus.REDIRECT_REQUIRED,
          message: '行程详情页只支持查询操作',
        },
      },
      result: {
        status: 'REDIRECT_REQUIRED',
        answer_text: '行程详情页只支持查询操作，如需修改请前往规划工作台。',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          redirectInfo: {
            redirect_to: '/planning-workbench/execute',
            redirect_reason: 'READONLY_MODE_RESTRICTION',
            original_request: {
              message: request.message.substring(0, 200), // 限制长度并脱敏
              user_id: request.user_id,
              trip_id: request.trip_id || undefined,
            },
          },
        },
      },
      explain: {
        decision_log: [{
          request_id: request.request_id,
          step: 'INTAKE' as OrchestrationStep,
          actor: 'Router' as SubAgentType,
          inputs_summary: `只读模式限制: ${request.message}`,
          outputs_summary: '重定向到规划工作台',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            entry_point: request.options?.entry_point,
            readonly_mode: true,
            redirect_reason: 'READONLY_MODE_RESTRICTION',
          },
        }],
        // 🆕 生成简化版解释（减少认知负荷）
        simplified_explanation: this.generateSimplifiedExplanation(
          [{
            request_id: request.request_id,
            step: 'INTAKE' as OrchestrationStep,
            actor: 'Router' as SubAgentType,
            inputs_summary: `只读模式限制: ${request.message}`,
            outputs_summary: '重定向到规划工作台',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
          }],
          undefined
        ),
      },
      observability: {
        latency_ms: latency,
        router_ms: latency,
        system_mode: 'REDIRECT',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        trace: {
          orchestration: {
            resolved: {
              mode: 'LEGACY',
              reason: 'Readonly mode restriction, redirecting to planning workbench',
              matchedRules: ['READONLY_MODE_CHECK'],
            },
          },
          timestamp: new Date().toISOString(),
        },
      },
    };
  }

  /**
   * 创建重定向到规划工作台的响应
   */
  private createRedirectToPlanningWorkbenchResponse(
    request: RouteAndRunRequestDto,
    startTime: number
  ): RouteAndRunResponseDto {
    const latency = Date.now() - startTime;
    
    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING, // 保持兼容
        confidence: 1.0,
        reasons: [RouterReason.REDIRECT_TO_PLANNING_WORKBENCH],
        required_capabilities: ['planning'],
        consent_required: false,
        budget: {
          max_seconds: 60,
          max_steps: 8,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: 'slow',
          status: UIStatus.REDIRECT_REQUIRED,
          message: '需要前往规划工作台',
        },
      },
      result: {
        status: 'REDIRECT_REQUIRED',
        answer_text: '行程规划功能已迁移到规划工作台，请使用 POST /planning-workbench/execute 接口。',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          redirectInfo: {
            redirect_to: '/planning-workbench/execute',
            redirect_reason: 'PLANNING_REQUEST_DETECTED',
            original_request: {
              message: request.message.substring(0, 200), // 限制长度并脱敏
              user_id: request.user_id,
              trip_id: request.trip_id || undefined,
            },
          },
        },
      },
      explain: {
        decision_log: [{
          request_id: request.request_id,
          step: 'INTAKE' as OrchestrationStep,
          actor: 'Router' as SubAgentType,
          inputs_summary: `检测到规划请求: ${request.message}`,
          outputs_summary: '重定向到规划工作台',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            redirect_reason: 'PLANNING_REQUEST_DETECTED',
          },
        }],
        // 🆕 生成简化版解释（减少认知负荷）
        simplified_explanation: this.generateSimplifiedExplanation(
          [{
            request_id: request.request_id,
            step: 'INTAKE' as OrchestrationStep,
            actor: 'Router' as SubAgentType,
            inputs_summary: `检测到规划请求: ${request.message}`,
            outputs_summary: '重定向到规划工作台',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
          }],
          undefined
        ),
      },
      observability: {
        latency_ms: latency,
        router_ms: latency,
        system_mode: 'REDIRECT',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        trace: {
          orchestration: {
            resolved: {
              mode: 'LEGACY',
              reason: 'Planning request detected, redirecting to planning workbench',
              matchedRules: ['PLANNING_REQUEST_INTERCEPT'],
            },
          },
          timestamp: new Date().toISOString(),
        },
      },
    };
  }

  /**
   * LEGACY 模式执行（集成稳定化层）
   */
  private async routeAndRunLegacy(
    request: RouteAndRunRequestDto,
    startTime: number,
    traceInfo?: { orchestration: any; timestamp: string },
    deadline?: { remainingMs: () => number },
  ): Promise<RouteAndRunResponseDto> {
    // 检查 deadline
    if (deadline && deadline.remainingMs() <= 0) {
      throw new Error('TIMEOUT:LEGACY_DEADLINE');
    }

    // 原有的 LEGACY 逻辑（从 routeAndRun 中提取）
    // 1. 创建初始状态
    const initialState = this.stateService.createInitialState(
      request.message,
      request.user_id,
      request.trip_id,
      request.options
    );

    // 2. 路由决策
    const routerStartTime = Date.now();
    const routeOutput = await this.router.route(
      request.message,
      {
        tripId: request.trip_id,
        recentMessages: request.conversation_context?.recent_messages,
        userId: request.user_id,
      },
      initialState.request_id
    );
    const routerMs = Date.now() - routerStartTime;

    // 更新状态
    let state = this.stateService.update(initialState.request_id, {
      observability: {
        ...initialState.observability,
        router_ms: routerMs,
      },
    });

    // 3. 检查 webbrowse 授权
    if (routeOutput.route === RouteType.SYSTEM2_WEBBROWSE && !request.options?.allow_webbrowse) {
      routeOutput.route = RouteType.SYSTEM2_REASONING;
      routeOutput.confidence = 0.7;
      routeOutput.reasons = [RouterReason.NO_API];
      routeOutput.consent_required = false;
    }

    // 4. 根据路由执行
    let result: any;
    let answerText = '';

    if (routeOutput.route.startsWith('SYSTEM1')) {
      const system1Result = await this.system1Executor.execute(routeOutput.route, state);
      result = system1Result.result;
      answerText = system1Result.answerText ?? '';
      state = this.stateService.update(state.request_id, {
        result: {
          ...state.result,
          status: system1Result.success ? 'READY' : 'NEED_MORE_INFO',
        },
      });
    } else {
      if (this.dagOrchestrator) {
        state = await this.executeSystem2PlanAndExecute(state, routeOutput.budget, request);
      } else {
        this.logger.warn('DAGOrchestratorService 未可用，降级使用 ReAct 循环');
        state = await this.orchestrator.execute(state, routeOutput.budget);
      }
      
      result = {
        timeline: state.result.timeline,
        dropped_items: state.result.dropped_items,
        candidates: [],
        evidence: [],
        robustness: state.compute.robustness,
      };
      answerText = this.generateAnswerText(state);
    }

    // 5. 计算 token 数量
    const tokensEst = TokenCalculator.estimateTotalTokens(
      request.message,
      answerText,
      {
        route: routeOutput,
        result: result,
        state: {
          trip: state.trip,
          memory: state.memory,
          compute: state.compute,
          result: state.result,
        },
      }
    );

    // 6. 构建响应
    const latency = Date.now() - startTime;
    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: routeOutput,
      result: {
        status: this.mapStateStatusToResultStatus(state.result.status),
        answer_text: answerText,
        payload: {
          ...result,
          ...(state.result.status === 'SUSPENDED' && state.result.suspensionInfo
            ? { suspensionInfo: state.result.suspensionInfo }
            : {}),
        },
      },
      explain: {
        decision_log: state.react.decision_log.map(log => ({
          request_id: state.request_id,
          step: 'DONE' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `Action: ${log.chosen_action}, Reason: ${log.reason_code}`,
          outputs_summary: `执行了 ${log.chosen_action}，策略: ${log.policy_id}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            step_number: log.step,
            facts: log.facts,
            policy_id: log.policy_id,
          },
        })),
        // 🆕 生成简化版解释（减少认知负荷）
        simplified_explanation: this.generateSimplifiedExplanation(
          state.react.decision_log.map(log => ({
            request_id: state.request_id,
            step: 'DONE' as OrchestrationStep,
            actor: 'Orchestrator' as SubAgentType,
            inputs_summary: `Action: ${log.chosen_action}, Reason: ${log.reason_code}`,
            outputs_summary: `执行了 ${log.chosen_action}，策略: ${log.policy_id}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
          })),
          undefined
        ),
      },
      observability: {
        latency_ms: latency,
        router_ms: routerMs,
        system_mode: routeOutput.route.startsWith('SYSTEM1') ? 'SYSTEM1' : 'SYSTEM2',
        tool_calls: state.observability.tool_calls,
        browser_steps: state.observability.browser_steps,
        tokens_est: tokensEst,
        cost_est_usd: state.observability.cost_est_usd,
        fallback_used: state.observability.fallback_used,
        trace: traceInfo || {
          orchestration: {
            resolved: {
              mode: 'LEGACY',
              reason: 'Claude orchestration disabled, using legacy routing',
              matchedRules: ['legacy_fallback'],
            },
          },
          timestamp: new Date().toISOString(),
          orchestration_mode: 'LEGACY',
        },
      },
    };

    // 缓存响应（用于请求去重）
    if (this.requestDeduplication && !request.options?.dry_run) {
      const requestHash = this.requestDeduplication.generateRequestHash(request);
      this.requestDeduplication.cacheResponse(requestHash, response);
    }

    // 记录 agent_complete 事件
    if (this.eventTelemetry) {
      this.eventTelemetry.recordAgentComplete(
        request.request_id,
        response.result.status,
        latency,
        tokensEst,
        state.observability.cost_est_usd,
        {
          route: routeOutput.route,
          system_mode: response.observability.system_mode,
          tool_calls: response.observability.tool_calls,
          browser_steps: response.observability.browser_steps,
        }
      );
    }

    return response;
  }

  /**
   * 构建失败响应（标准化错误映射）
   */
  /**
   * 将 DSO.travelOntologyState 与编排 state 推导值合并后透出给 route_and_run payload。
   */
  private resolveTravelOntologyForPayload(
    result: unknown,
  ): DecisionState['travelOntologyState'] | undefined {
    if (!result || typeof result !== 'object') return undefined;
    const r = result as { state?: OrchestratorState; decisionState?: DecisionState };
    const fromDso = r.decisionState?.travelOntologyState;
    const fromOs = r.state ? buildTravelOntologyStateFromOrchestrator(r.state) : undefined;
    if (!fromDso) return fromOs;
    if (!fromOs) return fromDso;
    return mergeTravelOntologyState(fromDso, fromOs) ?? fromDso;
  }

  private buildFailureResponse(
    request: RouteAndRunRequestDto,
    startTime: number,
    nf: { status: string; errorType: string; message: string; isTimeout: boolean },
    obs: any,
    partialDecisionLog?: DecisionLogEntry[], // 🆕 部分决策日志（超时等情况）
  ): RouteAndRunResponseDto {
    const receivedRouteDirectionId = this.resolveRequestRouteDirectionId(request);
    return {
      request_id: request.request_id,
        route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 0.1,
        reasons: [RouterReason.MISSING_INFO],
        required_capabilities: [],
        consent_required: false,
        budget: {
          max_seconds: Math.round((obs.deadline_ms ?? 12000) / 1000),
          max_steps: 0,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: 'slow',
          status: nf.status === 'TIMEOUT' ? UIStatus.FAILED : UIStatus.FAILED,
          message: nf.message,
        },
      },
      result: {
        status: nf.status as any,
        answer_text: nf.message,
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          needsUserConfirmation: nf.status === 'NEED_CONFIRMATION' || nf.status === 'NEED_MORE_INFO',
          clarificationMessage: nf.message,
          errorType: (nf.isTimeout ? ErrorType.TIMEOUT_ERROR : ErrorType.UNKNOWN_ERROR) as ErrorType,
        },
      },
      explain: {
        decision_log: partialDecisionLog || [], // 🆕 使用部分决策日志（如果有）
        // 🆕 生成简化版解释（减少认知负荷）
        simplified_explanation: undefined, // 失败情况不生成简化版解释
      },
        observability: {
        latency_ms: Date.now() - startTime,
        router_ms: 0,
        system_mode: 'SYSTEM2',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: Boolean(obs.fallback_used),
        orchestration_mode_final: obs?.mode_final,
        received_route_direction_id: receivedRouteDirectionId,
        trace: {
          orchestration: {
            resolved: {
              mode: obs.mode_final || 'LEGACY',
              reason: `Failed with error: ${nf.errorType}`,
              matchedRules: ['stability_layer_failure'],
            },
          },
          timestamp: new Date().toISOString(),
          // @ts-ignore - 扩展 trace 以包含稳定化层信息
          deadline_ms: obs.deadline_ms,
          time_remaining_ms: obs.time_remaining_ms,
          mode_final: obs.mode_final,
        } as any,
      },
    };
  }

  private resolveRequestRouteDirectionId(
    request?: RouteAndRunRequestDto,
  ): string | undefined {
    if (!request) return undefined;
    const snake = (request as any)?.route_direction_id;
    const camel = (request as any)?.routeDirectionId;
    const v =
      (typeof snake === 'string' ? snake : undefined) ??
      (typeof camel === 'string' ? camel : undefined);
    const trimmed = typeof v === 'string' ? v.trim() : '';
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private attachObservability(
    resp: RouteAndRunResponseDto,
    obs: any,
    request?: RouteAndRunRequestDto,
  ): RouteAndRunResponseDto {
    if (!resp) return resp;
    const receivedRouteDirectionId = this.resolveRequestRouteDirectionId(request);
    resp.observability = {
      ...(resp.observability ?? {}),
      ...obs,
    };
    if (resp.observability && obs?.mode_final && !('orchestration_mode_final' in resp.observability)) {
      (resp.observability as any).orchestration_mode_final = obs.mode_final;
    }
    if (
      resp.observability &&
      receivedRouteDirectionId &&
      !('received_route_direction_id' in resp.observability)
    ) {
      (resp.observability as any).received_route_direction_id = receivedRouteDirectionId;
    }
    // 与 CLI `--show-poi-trace` 对齐：把稳定化层证据同步进 payload.poiTrace
    const omf =
      (resp.observability as any).orchestration_mode_final ?? obs?.mode_final;
    const rid =
      (resp.observability as any).received_route_direction_id ??
      receivedRouteDirectionId;
    const payloadAny = resp.result?.payload as Record<string, unknown> | undefined;
    const pt = payloadAny?.poiTrace;
    if (pt && typeof pt === 'object' && !Array.isArray(pt)) {
      payloadAny.poiTrace = {
        ...(pt as Record<string, unknown>),
        ...(omf ? { orchestration_mode_final: omf } : {}),
        ...(rid
          ? {
              received_route_direction_id: rid,
              requestRouteDirectionId: rid,
            }
          : {}),
      };
    }
    return resp;
  }

  /**
   * 🆕 生成AI能力展示（信任建立机制）
   */
  private generateAICapabilityDisplay(
    orchestrationResult: any,
    gateResult?: GateResult,
    state?: any
  ): AICapabilityDisplay | undefined {
    if (!orchestrationResult.success && !gateResult) {
      return undefined;
    }

    // 提取使用的AI能力
    const capabilitiesUsed: Array<{
      name: string;
      description: string;
      status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
    }> = [];

    // 从决策日志中提取使用的技能
    const decisionLog = orchestrationResult.decisionLog || [];
    const skillsUsed = new Set<string>();
    
    for (const entry of decisionLog) {
      if (entry.metadata?.tool_calls) {
        // 从metadata中提取技能名称
        const toolCalls = entry.metadata.tool_calls;
        if (Array.isArray(toolCalls)) {
          toolCalls.forEach((call: any) => {
            if (call.skill_name) {
              skillsUsed.add(call.skill_name);
            }
          });
        }
      }
    }

    // 添加核心能力
    if (gateResult) {
      capabilitiesUsed.push({
        name: '安全评估',
        description: '评估路线安全性和可行性',
        status: gateResult.gate_result === 'ALLOW' ? 'SUCCESS' : 'PARTIAL',
      });
    }

    if (state?.itinerary) {
      capabilitiesUsed.push({
        name: '行程生成',
        description: '生成详细的行程安排',
        status: 'SUCCESS',
      });
    }

    if (skillsUsed.has('transport.search')) {
      capabilitiesUsed.push({
        name: '交通查询',
        description: '查询交通班次和路线',
        status: 'SUCCESS',
      });
    }

    if (skillsUsed.has('poi.search')) {
      capabilitiesUsed.push({
        name: '地点搜索',
        description: '搜索和推荐景点',
        status: 'SUCCESS',
      });
    }

    if (skillsUsed.has('dem.get.profile')) {
      capabilitiesUsed.push({
        name: '地形分析',
        description: '分析地形和体力消耗',
        status: 'SUCCESS',
      });
    }

    // 计算数据质量指标
    const evidenceCount = decisionLog.reduce(
      (sum: number, entry: DecisionLogEntry) => sum + (entry.evidence_refs?.length || 0),
      0
    );
    const dataCompleteness = evidenceCount > 0 ? Math.min(1, evidenceCount / 10) : 0.5;
    const dataFreshness = 0.9; // 假设数据新鲜度（实际应从数据时间戳计算）
    const dataReliability = gateResult?.confidence || 0.8;

    // 计算决策置信度
    const gateConfidence = gateResult?.confidence || 0.8;
    const planConfidence = state?.itinerary ? 0.85 : 0.5;
    const overallConfidence = (gateConfidence + planConfidence) / 2;

    // 识别局限性
    const limitations: Array<{
      type: 'DATA_MISSING' | 'SERVICE_UNAVAILABLE' | 'UNCERTAINTY' | 'ASSUMPTION';
      description: string;
      impact: 'LOW' | 'MEDIUM' | 'HIGH';
    }> = [];

    if (dataCompleteness < 0.8) {
      limitations.push({
        type: 'DATA_MISSING',
        description: '部分数据可能不完整',
        impact: 'MEDIUM',
      });
    }

    if (gateResult?.gate_result === 'ADJUST_REQUIRED') {
      limitations.push({
        type: 'UNCERTAINTY',
        description: '行程需要根据实际情况调整',
        impact: 'MEDIUM',
      });
    }

    if (overallConfidence < 0.7) {
      limitations.push({
        type: 'UNCERTAINTY',
        description: '部分决策基于估算，建议人工确认',
        impact: 'HIGH',
      });
    }

    // ADR-B1：将 itinerary 风险标签摘要透出到 capability limitations
    const riskSummary = this.buildRiskTagsSummary(
      state?.itinerary ?? orchestrationResult?.result?.itinerary,
    );
    if (riskSummary && riskSummary.length > 0) {
      const top = riskSummary.slice(0, 3);
      const labels = top.map((x) => `${x.tag}(${x.count})`).join('、');
      const highImpactTags = new Set<ItineraryRiskTag>(['SAFETY', 'HEALTH']);
      const hasHigh = top.some((x) => highImpactTags.has(x.tag));
      limitations.push({
        type: 'UNCERTAINTY',
        description: `风险标签摘要：${labels}`,
        impact: hasHigh ? 'HIGH' : 'MEDIUM',
      });
    }

    return {
      success: orchestrationResult.success,
      capabilities_used: capabilitiesUsed,
      data_quality: {
        completeness: dataCompleteness,
        freshness: dataFreshness,
        reliability: dataReliability,
      },
      confidence: {
        overall: overallConfidence,
        gate_evaluation: gateConfidence,
        plan_generation: planConfidence,
      },
      limitations: limitations.length > 0 ? limitations : undefined,
    };
  }
}

