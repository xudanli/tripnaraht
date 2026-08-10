/**
 * Gateway L1 编排引擎选择（routePolicy）。
 * 产出 CLAUDE_SM | CLAUDE_DYNAMIC | LEGACY；不负责 Claude 内 early-exit（那是 L2 RequestRouter）。
 */

import { OrchestrationOptions } from '../utils/resolve-orchestration-mode.util';
import { RoutingSignals } from '../utils/orchestration-signals.util';
import { resolveOrchestrationMode, OrchestrationMode, ResolveModeResult } from '../utils/resolve-orchestration-mode.util';
import { CircuitBreaker, ModeLock, StabilityContext } from '../services/orchestration-stability.util';

/**
 * 编排策略决策结果
 * 
 * 关键原则：
 * - mode: 实际执行路径（强制）
 * - recommendations: 仅建议，不得影响当前请求执行（除非 options 显式开启）
 */
export interface OrchestrationPolicyDecision {
  /** 实际执行路径（强制，不可变） */
  mode: OrchestrationMode;
  /** 决策原因 */
  reason: string;
  /** 匹配的规则列表 */
  matchedRules: string[];
  /** 路由信号 */
  signals: RoutingSignals;
  /** 标志位 */
  flags: ResolveModeResult['flags'];
  /** 建议（仅用于 trace，不影响执行） */
  recommendations?: {
    useStateMachine?: boolean;
    enableAudit?: boolean;
    requireConsent?: boolean;
    reason?: string; // 建议的原因
  };
}

/**
 * 编排策略决策（基于信号）
 * 
 * 结合 Feature Flags 和路由信号，决定最终的编排模式
 * 
 * @param env 环境变量
 * @param options 编排选项
 * @param signals 路由信号
 * @returns 策略决策结果
 */
/**
 * 规则函数：简单请求降级到 LEGACY
 * 
 * 规则：简单请求 + fast budget + legacy well supported + 未显式启用 → 降级到 LEGACY
 */
function applySimpleLegacyFallbackRule(
  modeResult: ResolveModeResult,
  options: OrchestrationOptions | undefined,
  signals: RoutingSignals,
): { mode: OrchestrationMode; reason: string; rule: string } | null {
  const explicitlyEnabled = options?.use_claude_orchestration === true;
  
  if (
    (modeResult.mode === 'CLAUDE_SM' || modeResult.mode === 'CLAUDE_DYNAMIC') &&
    !explicitlyEnabled &&
    signals.complexity === 'SIMPLE' &&
    signals.legacyWellSupported &&
    signals.latencyBudgetMs < 3000
  ) {
    return {
      mode: 'LEGACY',
      reason: `${modeResult.reason} → LEGACY (simple request + fast budget + legacy well supported, Claude not explicitly enabled)`,
      rule: 'rule_simple_legacy_fallback',
    };
  }
  
  return null;
}

/**
 * 规则函数：显式启用 Claude 时的简单任务优化
 * 
 * 规则：显式启用 + 简单任务 + 不需要结构化输出 → 使用 DYNAMIC（更快）
 * 
 * 例外：如果显式启用了状态机（use_state_machine_orchestration: true），则强制使用状态机
 */
function applyExplicitClaudeSimpleDynamicRule(
  modeResult: ResolveModeResult,
  options: OrchestrationOptions | undefined,
  signals: RoutingSignals,
): { mode: OrchestrationMode; reason: string; rule: string } | null {
  const explicitlyEnabled = options?.use_claude_orchestration === true;
  const explicitlyStateMachine = options?.use_state_machine_orchestration === true;
  
  // 如果显式启用了状态机，不降级
  if (explicitlyStateMachine) {
    return null;
  }
  
  if (
    explicitlyEnabled &&
    modeResult.mode === 'CLAUDE_SM' &&
    signals.complexity === 'SIMPLE' &&
    !signals.requiresStructuredOutput
  ) {
    return {
      mode: 'CLAUDE_DYNAMIC',
      reason: `${modeResult.reason} → CLAUDE_DYNAMIC (simple task, explicit Claude enabled, no structured output required)`,
      rule: 'rule_explicit_claude_simple_dynamic',
    };
  }
  
  return null;
}

/**
 * 规则函数：复杂结构化任务使用状态机
 * 
 * 规则：DYNAMIC + 需要结构化输出 + 工具调用 + 行程/预订 + 非简单 → 使用 SM
 */
function applyComplexStructuredSMRule(
  modeResult: ResolveModeResult,
  signals: RoutingSignals,
): { mode: OrchestrationMode; reason: string; rule: string } | null {
  if (
    modeResult.mode === 'CLAUDE_DYNAMIC' &&
    signals.requiresStructuredOutput &&
    signals.expectsToolCalls &&
    (signals.taskType === 'TRIP_PLANNING' || signals.taskType === 'BOOKING_WORKFLOW') &&
    signals.complexity !== 'SIMPLE'
  ) {
    return {
      mode: 'CLAUDE_SM',
      reason: `${modeResult.reason} → CLAUDE_SM (structured output + tool calls + trip/booking + not simple)`,
      rule: 'rule_sm_for_complex_structured',
    };
  }
  
  return null;
}

/**
 * 规则函数：简单任务使用动态编排
 * 
 * 规则：SM + 简单任务 + 不需要结构化输出 → 使用 DYNAMIC
 * 
 * 例外：如果显式启用了状态机（use_state_machine_orchestration: true），则强制使用状态机
 */
function applySimpleDynamicRule(
  modeResult: ResolveModeResult,
  options: OrchestrationOptions | undefined,
  signals: RoutingSignals,
): { mode: OrchestrationMode; reason: string; rule: string } | null {
  const explicitlyStateMachine = options?.use_state_machine_orchestration === true;
  
  // 如果显式启用了状态机，不降级
  if (explicitlyStateMachine) {
    return null;
  }
  
  if (
    modeResult.mode === 'CLAUDE_SM' &&
    signals.complexity === 'SIMPLE' &&
    !signals.requiresStructuredOutput
  ) {
    return {
      mode: 'CLAUDE_DYNAMIC',
      reason: `${modeResult.reason} → CLAUDE_DYNAMIC (simple task, no structured output required)`,
      rule: 'rule_dynamic_for_simple',
    };
  }
  
  return null;
}

/**
 * 编排策略决策（基于信号）
 * 
 * 关键规则：
 * 1. mode = 实际执行路径（强制，不可变）
 * 2. recommendations = 仅建议，不影响执行
 * 3. consent = 确定性规则（只在特定条件下触发）
 * 4. SM 边界 = 简单请求不走 SM，除非显式启用
 * 5. ModeLock 优先级：如果存在锁定模式，优先使用（避免抖动）
 * 6. Circuit Breaker：如果模式熔断，自动降级到下一级
 * 
 * @param env 环境变量
 * @param options 编排选项
 * @param signals 路由信号
 * @param stabilityContext 稳定化上下文（可选，用于 ModeLock 和 Circuit Breaker）
 * @param modeLock ModeLock 实例（可选）
 * @param breakers Circuit Breaker 实例映射（可选）
 * @returns 策略决策结果（已冻结，不可变）
 */
export function routePolicy(
  env: NodeJS.ProcessEnv,
  options: OrchestrationOptions | undefined,
  signals: RoutingSignals,
  stabilityContext?: StabilityContext,
  modeLock?: ModeLock,
  breakers?: {
    sm?: CircuitBreaker;
    dyn?: CircuitBreaker;
    legacy?: CircuitBreaker;
  },
  unifiedIntentOpts?: {
    message?: string;
    tripId?: string | null;
  },
): OrchestrationPolicyDecision {
  const matchedRules: string[] = [];
  
  // 1. 首先基于 Feature Flags 判定基础模式（硬规则）
  const modeResult = resolveOrchestrationMode(env, options);
  matchedRules.push(`flag_resolution: ${modeResult.mode}`);

  // 2. 根据信号调整策略（但遵守硬边界）
  let finalMode = modeResult.mode;
  let reason = modeResult.reason;
  const recommendations: OrchestrationPolicyDecision['recommendations'] = {};

  // 2.1 ModeLock：仅未完成 planning operation 可粘模式；无 operation id 时不粘 trip session
  // CONSULT / Admission deny 不得锁回 SM；LOCAL_EDIT/ASSESS/GLOBAL 可从 DYNAMIC 升 SM
  if (stabilityContext && modeLock) {
    const lockedMode = modeLock.get(stabilityContext);
    if (lockedMode) {
      let bypassModeLock = false;
      if (unifiedIntentOpts?.message) {
        try {
          const { evaluatePlanningAdmission } = require('./planning-admission-gate.util') as typeof import('./planning-admission-gate.util');
          const admission = evaluatePlanningAdmission({
            message: unifiedIntentOpts.message,
            tripId: unifiedIntentOpts.tripId,
            modeLockHint: true,
          });
          if (!admission.admitted && lockedMode === 'CLAUDE_SM') {
            bypassModeLock = true;
            if (finalMode === 'CLAUDE_SM') {
              finalMode = 'CLAUDE_DYNAMIC';
            }
            matchedRules.push('rule_mode_lock_bypass_planning_admission_denied');
            reason = `${reason} → ModeLock bypass + demote SM (planning_admission_denied: ${admission.reason})`;
          }
        } catch {
          /* ignore */
        }
        try {
          const { resolveLiveRouteTakeover } = require('../intent/unified-intent.execution-route') as typeof import('../intent/unified-intent.execution-route');
          const takeover = resolveLiveRouteTakeover({
            message: unifiedIntentOpts.message,
            tripId: unifiedIntentOpts.tripId,
          });
          if (takeover?.kind === 'CONSULT' && lockedMode === 'CLAUDE_SM') {
            bypassModeLock = true;
            matchedRules.push('rule_mode_lock_bypass_readonly_unified_intent');
            reason = `${reason} → ModeLock bypass (${takeover.kind}: ${takeover.reason})`;
          } else if (
            !bypassModeLock &&
            (takeover?.kind === 'LOCAL_EDIT' ||
              takeover?.kind === 'ASSESS_IMPACT' ||
              takeover?.kind === 'GLOBAL_PLAN') &&
            lockedMode === 'CLAUDE_DYNAMIC'
          ) {
            try {
              const { evaluatePlanningAdmission } = require('./planning-admission-gate.util') as typeof import('./planning-admission-gate.util');
              const admission = evaluatePlanningAdmission({
                message: unifiedIntentOpts.message,
                tripId: unifiedIntentOpts.tripId,
              });
              if (admission.admitted || takeover.kind === 'ASSESS_IMPACT') {
                bypassModeLock = true;
                finalMode = 'CLAUDE_SM';
                matchedRules.push('rule_mode_lock_force_sm_for_unified_edit_or_assess');
                reason = `${reason} → CLAUDE_SM (ModeLock override: ${takeover.kind})`;
              }
            } catch {
              bypassModeLock = true;
              finalMode = 'CLAUDE_SM';
              matchedRules.push('rule_mode_lock_force_sm_for_unified_edit_or_assess');
              reason = `${reason} → CLAUDE_SM (ModeLock override: ${takeover.kind})`;
            }
          }
        } catch {
          /* ignore resolve errors — fall through to ModeLock */
        }
      }
      if (!bypassModeLock) {
        finalMode = lockedMode;
        reason = `${reason} → ${lockedMode} (ModeLock: 复用未完成 operation 模式，避免抖动)`;
        matchedRules.push('rule_mode_lock_priority');
      }
    }
  }

  // 2.2 Circuit Breaker 检查：如果模式熔断，自动降级
  if (breakers) {
    const checkBreaker = (mode: OrchestrationMode): OrchestrationMode | null => {
      if (mode === 'CLAUDE_SM' && breakers.sm && !breakers.sm.canPass()) {
        matchedRules.push('rule_breaker_open_claude_sm');
        return 'CLAUDE_DYNAMIC'; // 降级到 DYNAMIC
      }
      if (mode === 'CLAUDE_DYNAMIC' && breakers.dyn && !breakers.dyn.canPass()) {
        matchedRules.push('rule_breaker_open_claude_dynamic');
        return 'LEGACY'; // 降级到 LEGACY
      }
      if (mode === 'LEGACY' && breakers.legacy && !breakers.legacy.canPass()) {
        matchedRules.push('rule_breaker_open_legacy');
        // LEGACY 是最后一级，无法再降级，但可以记录
        return null;
      }
      return null;
    };

    const breakerAdjustedMode = checkBreaker(finalMode);
    if (breakerAdjustedMode) {
      reason = `${reason} → ${breakerAdjustedMode} (Circuit Breaker: ${finalMode} 已熔断，自动降级)`;
      finalMode = breakerAdjustedMode;
      // 如果降级后的模式也熔断，继续降级
      const secondBreakerAdjusted = checkBreaker(finalMode);
      if (secondBreakerAdjusted) {
        reason = `${reason} → ${secondBreakerAdjusted} (Circuit Breaker: ${finalMode} 也已熔断，继续降级)`;
        finalMode = secondBreakerAdjusted;
      }
    }
  }

  // 3. 应用规则函数（按优先级顺序）
  if (modeResult.mode === 'CLAUDE_SM' || modeResult.mode === 'CLAUDE_DYNAMIC') {
    // 规则 1: 简单请求降级到 LEGACY（优先级最高）
    const fallbackResult = applySimpleLegacyFallbackRule(modeResult, options, signals);
    if (fallbackResult) {
      finalMode = fallbackResult.mode;
      reason = fallbackResult.reason;
      matchedRules.push(fallbackResult.rule);
      recommendations.useStateMachine = true;
      recommendations.reason = 'signals suggest Claude SM for better structured output, but request is simple and legacy supported';
    }
    // 规则 2: 显式启用时的简单任务优化
    else {
      const dynamicResult = applyExplicitClaudeSimpleDynamicRule(modeResult, options, signals);
      if (dynamicResult) {
        finalMode = dynamicResult.mode;
        reason = dynamicResult.reason;
        matchedRules.push(dynamicResult.rule);
        recommendations.useStateMachine = false;
      }
      // 规则 3: 复杂结构化任务使用状态机
      else {
        const smResult = applyComplexStructuredSMRule(modeResult, signals);
        if (smResult) {
          finalMode = smResult.mode;
          reason = smResult.reason;
          matchedRules.push(smResult.rule);
          recommendations.useStateMachine = true;
        }
        // 规则 4: 简单任务使用动态编排
        else {
          const simpleDynamicResult = applySimpleDynamicRule(modeResult, options, signals);
          if (simpleDynamicResult) {
            finalMode = simpleDynamicResult.mode;
            reason = simpleDynamicResult.reason;
            matchedRules.push(simpleDynamicResult.rule);
            recommendations.useStateMachine = false;
          }
        }
      }
    }
  }

  // 3.5 Planning Admission Gate：未准入不得停留在 CLAUDE_SM（覆盖 flag / ModeLock / 信号抬升）
  if (finalMode === 'CLAUDE_SM' && unifiedIntentOpts?.message) {
    try {
      const { evaluatePlanningAdmission } = require('./planning-admission-gate.util') as typeof import('./planning-admission-gate.util');
      const admission = evaluatePlanningAdmission({
        message: unifiedIntentOpts.message,
        tripId: unifiedIntentOpts.tripId,
      });
      if (!admission.admitted) {
        finalMode = 'CLAUDE_DYNAMIC';
        reason = `${reason} → CLAUDE_DYNAMIC (planning_admission_denied: ${admission.reason})`;
        matchedRules.push('rule_planning_admission_deny_full_planning');
        recommendations.useStateMachine = false;
        recommendations.reason = `planning admission denied: ${admission.reason}`;
      }
    } catch {
      /* ignore */
    }
  }

  // 4. 如果 Flag 是 LEGACY，但信号强烈推荐 Claude 编排（仅建议，不强制）
  if (finalMode === 'LEGACY') {
    if (!signals.legacyWellSupported && (signals.taskType === 'TRIP_PLANNING' || signals.taskType === 'BOOKING_WORKFLOW')) {
      recommendations.useStateMachine = true; // 推荐但不强制
      recommendations.reason = `signals suggest Claude SM would be better for ${signals.taskType}, but Claude orchestration is disabled`;
      matchedRules.push('recommendation_sm_for_trip_booking');
    }
  }

  // 5. 审计建议（基于 dry_run）
  recommendations.enableAudit = signals.needsAudit;
  if (options?.dry_run) {
    recommendations.enableAudit = false;
    matchedRules.push('rule_dry_run_no_audit');
  }

  // 6. 硬规则 B: Consent 边界（确定性规则）
  // 只有当"需要 webbrowse 或外部数据访问"且 options.allow_webbrowse !== true 时才 requireConsent=true
  const needsWebBrowse = signals.expectsToolCalls && 
    (signals.taskType === 'BOOKING_WORKFLOW' || signals.taskType === 'TRIP_PLANNING');
  const allowWebbrowse = options?.allow_webbrowse === true;
  
  if (needsWebBrowse && !allowWebbrowse) {
    recommendations.requireConsent = true;
    recommendations.reason = 'needs webbrowse or external data access but allow_webbrowse not enabled';
    matchedRules.push('rule_consent_webbrowse_required');
  } else {
    recommendations.requireConsent = false;
  }

  const decision: OrchestrationPolicyDecision = {
    mode: finalMode,
    reason,
    matchedRules,
    signals,
    flags: modeResult.flags,
    recommendations: Object.keys(recommendations).length > 0 ? recommendations : undefined,
  };

  // 冻结决策对象，防止后续代码篡改
  Object.freeze(decision);
  if (decision.recommendations) {
    Object.freeze(decision.recommendations);
  }
  Object.freeze(decision.signals);
  Object.freeze(decision.flags);

  return decision;
}
