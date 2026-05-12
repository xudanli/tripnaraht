/**
 * Phase B：履约 / R-Loop —— 基于 PRD I5 `OrchestratorRobustnessMetadata` 的恢复策略。
 * 纯函数，无 Nest 依赖，便于单测与 Agent / MCP 侧复用。
 */

import type { OrchestratorRobustnessMetadata } from '../../agent/utils/orchestrator-failure-taxonomy.util';

export type ExecutionRecoveryKind =
  /** 业务/内核约束：交由上层弹出澄清或收窄约束（不由本层盲重试） */
  | 'REQUEST_CLARIFICATION'
  /** 超时 / 网络 / 可重试工具：指数退避 */
  | 'RETRY_WITH_EXPONENTIAL_BACKOFF'
  /** LLM / 编排逻辑失败：记录严重日志并降级（安全模式），避免疯狂重试 */
  | 'SAFE_MODE_DEGRADED';

export interface ExecutionBackoffParams {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** 0..1，在延迟上叠加随机抖动比例 */
  jitterRatio: number;
}

export interface ExecutionRecoveryPlan {
  kind: ExecutionRecoveryKind;
  reason: string;
  backoff?: ExecutionBackoffParams;
  clarification?: {
    suggested_prompt_zh: string;
  };
  logging: {
    level: 'warn' | 'error';
    tags: string[];
  };
}

export function computeBackoffDelayMs(attemptIndexZeroBased: number, b: ExecutionBackoffParams): number {
  const raw = Math.min(b.maxDelayMs, b.baseDelayMs * Math.pow(2, attemptIndexZeroBased));
  const jitter = raw * b.jitterRatio * Math.random();
  return Math.round(raw + jitter);
}

/** 与 `resolveExecutionRecoveryPlan` 中默认退避合并；未设置或非法时保留内置默认。 */
export const EXECUTION_RECOVERY_ENV = {
  MAX_ATTEMPTS: 'EXECUTION_RECOVERY_MAX_ATTEMPTS',
  BASE_DELAY_MS: 'EXECUTION_RECOVERY_BASE_DELAY_MS',
  MAX_DELAY_MS: 'EXECUTION_RECOVERY_MAX_DELAY_MS',
  JITTER_RATIO: 'EXECUTION_RECOVERY_JITTER_RATIO',
} as const;

function parseEnvInt(env: NodeJS.ProcessEnv | undefined, key: string, fallback: number): number {
  if (!env) return fallback;
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseEnvFloat01(env: NodeJS.ProcessEnv | undefined, key: string, fallback: number): number {
  if (!env) return fallback;
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/**
 * 将环境变量覆盖到退避参数（生产 / Dev 分区调参；上限防止极端配置）。
 */
export function mergeExecutionBackoffFromEnv(
  base: ExecutionBackoffParams,
  env?: NodeJS.ProcessEnv,
): ExecutionBackoffParams {
  if (!env) return base;
  const maxAttemptsRaw = parseEnvInt(env, EXECUTION_RECOVERY_ENV.MAX_ATTEMPTS, base.maxAttempts);
  const maxAttempts = Math.max(1, Math.min(20, maxAttemptsRaw));
  const baseDelayMs = Math.max(0, parseEnvInt(env, EXECUTION_RECOVERY_ENV.BASE_DELAY_MS, base.baseDelayMs));
  const maxDelayMs = Math.max(
    baseDelayMs,
    parseEnvInt(env, EXECUTION_RECOVERY_ENV.MAX_DELAY_MS, Math.max(base.maxDelayMs, baseDelayMs)),
  );
  const jitterRatio = parseEnvFloat01(env, EXECUTION_RECOVERY_ENV.JITTER_RATIO, base.jitterRatio);
  return { maxAttempts, baseDelayMs, maxDelayMs, jitterRatio };
}

/**
 * 将 I5 分类映射为履约恢复策略。
 *
 * - BUSINESS_RULE → 澄清（不自动盲重试）
 * - TIMEOUT / NETWORK → 指数退避
 * - TOOL 且 retryable_hint → 退避（与 MCP 瞬时失败对齐）
 * - LLM / ORCHESTRATION / 其余 → 安全模式 + error 级日志
 */
export function resolveExecutionRecoveryPlan(
  meta: OrchestratorRobustnessMetadata | undefined | null,
  env?: NodeJS.ProcessEnv,
): ExecutionRecoveryPlan | null {
  if (!meta) return null;

  const { failure_domain, failure_code, retryable_hint } = meta;
  const codeTag = failure_code || 'UNSPECIFIED';

  if (failure_domain === 'BUSINESS_RULE') {
    return {
      kind: 'REQUEST_CLARIFICATION',
      reason: `business_rule:${codeTag}`,
      clarification: {
        suggested_prompt_zh: `当前规则或校验未通过（${codeTag}）。请确认是否放宽约束、补充必要信息，或由您确认后再继续。`,
      },
      logging: { level: 'warn', tags: ['EXECUTION_RECOVERY', 'CLARIFY', codeTag] },
    };
  }

  if (
    failure_domain === 'TIMEOUT' ||
    failure_domain === 'NETWORK' ||
    (failure_domain === 'TOOL' && retryable_hint === true)
  ) {
    const backoff = mergeExecutionBackoffFromEnv(
      {
        maxAttempts: 4,
        baseDelayMs: 500,
        maxDelayMs: 8000,
        jitterRatio: 0.2,
      },
      env,
    );
    return {
      kind: 'RETRY_WITH_EXPONENTIAL_BACKOFF',
      reason: `${failure_domain}:${codeTag}`,
      backoff,
      logging: { level: 'warn', tags: ['EXECUTION_RECOVERY', 'BACKOFF', failure_domain, codeTag] },
    };
  }

  return {
    kind: 'SAFE_MODE_DEGRADED',
    reason: `${failure_domain}:${codeTag}`,
    logging: { level: 'error', tags: ['EXECUTION_RECOVERY', 'SAFE_MODE', failure_domain, codeTag] },
  };
}
