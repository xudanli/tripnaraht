/**
 * Agentic 日 token 配额（Harness Control P1）。
 * Redis 优先；无 Redis 时进程内 Map 兜底（单 Pod dev）。
 */

export interface AgenticTokenQuotaConfig {
  enabled: boolean;
  perUserDaily: number;
  perOrgDaily: number;
  globalDaily: number;
  perSessionCap: number;
}

export interface AgenticTokenQuotaCheckResult {
  allowed: boolean;
  scope: 'none' | 'session' | 'org_daily' | 'user_daily' | 'global_daily';
  used: number;
  limit: number;
  remaining: number;
  session_id?: string | null;
  org_id?: string | null;
  userMessage?: string;
}

const QUOTA_KEY_PREFIX = 'agentic_token_quota:v1';
const QUOTA_TTL_SECONDS = 48 * 3600;

export function parsePositiveIntEnv(raw: string | undefined | null): number {
  if (raw == null || String(raw).trim() === '') return 0;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseAgenticTokenQuotaConfig(env: NodeJS.ProcessEnv): AgenticTokenQuotaConfig {
  const perUserDaily = parsePositiveIntEnv(env.AGENTIC_DAILY_TOKEN_QUOTA_PER_USER);
  const perOrgDaily = parsePositiveIntEnv(env.AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG);
  const globalDaily = parsePositiveIntEnv(env.AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL);
  const perSessionCap = parsePositiveIntEnv(env.AGENTIC_SESSION_TOKEN_CAP);
  return {
    enabled: perUserDaily > 0 || perOrgDaily > 0 || globalDaily > 0 || perSessionCap > 0,
    perUserDaily,
    perOrgDaily,
    globalDaily,
    perSessionCap,
  };
}

export function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function buildAgenticUserQuotaRedisKey(userId: string, dateKey = utcDateKey()): string {
  return `${QUOTA_KEY_PREFIX}:user:${userId}:${dateKey}`;
}

export function buildAgenticGlobalQuotaRedisKey(dateKey = utcDateKey()): string {
  return `${QUOTA_KEY_PREFIX}:global:${dateKey}`;
}

export function buildAgenticOrgQuotaRedisKey(orgId: string, dateKey = utcDateKey()): string {
  return `${QUOTA_KEY_PREFIX}:org:${orgId}:${dateKey}`;
}

export function buildAgenticSessionQuotaRedisKey(sessionId: string): string {
  return `${QUOTA_KEY_PREFIX}:session:${sessionId}`;
}

export function agenticTokenQuotaTtlSeconds(): number {
  return QUOTA_TTL_SECONDS;
}

export function evaluateAgenticTokenQuota(params: {
  config: AgenticTokenQuotaConfig;
  userUsed: number;
  orgUsed?: number;
  globalUsed: number;
  sessionUsed?: number;
  estimatedTokens: number;
  hasUserId: boolean;
  sessionId?: string | null;
  orgId?: string | null;
}): AgenticTokenQuotaCheckResult {
  const { config, userUsed, globalUsed, estimatedTokens, hasUserId } = params;
  const sessionUsed = params.sessionUsed ?? 0;
  const orgUsed = params.orgUsed ?? 0;
  const sessionId = params.sessionId?.trim() || null;
  const orgId = params.orgId?.trim() || null;
  if (!config.enabled) {
    return { allowed: true, scope: 'none', used: 0, limit: 0, remaining: Number.MAX_SAFE_INTEGER };
  }

  const est = Math.max(0, Math.floor(estimatedTokens));

  if (config.perSessionCap > 0 && sessionId && sessionUsed + est > config.perSessionCap) {
    return {
      allowed: false,
      scope: 'session',
      used: sessionUsed,
      limit: config.perSessionCap,
      remaining: Math.max(0, config.perSessionCap - sessionUsed),
      session_id: sessionId,
      userMessage: '本会话 Agent 推理额度已用尽，请开启新会话或缩小问题范围。',
    };
  }

  if (config.perOrgDaily > 0 && orgId && orgUsed + est > config.perOrgDaily) {
    return {
      allowed: false,
      scope: 'org_daily',
      used: orgUsed,
      limit: config.perOrgDaily,
      remaining: Math.max(0, config.perOrgDaily - orgUsed),
      org_id: orgId,
      userMessage: '本组织今日 Agent 推理额度已用尽，请联系管理员或明日再试。',
    };
  }

  if (config.globalDaily > 0 && globalUsed + est > config.globalDaily) {
    return {
      allowed: false,
      scope: 'global_daily',
      used: globalUsed,
      limit: config.globalDaily,
      remaining: Math.max(0, config.globalDaily - globalUsed),
      userMessage: '平台今日 Agent 推理额度已用尽，请明日再试或联系管理员。',
    };
  }

  if (config.perUserDaily > 0 && hasUserId && userUsed + est > config.perUserDaily) {
    return {
      allowed: false,
      scope: 'user_daily',
      used: userUsed,
      limit: config.perUserDaily,
      remaining: Math.max(0, config.perUserDaily - userUsed),
      userMessage: '您今日 Agent 推理额度已用尽，请明日再试或缩小问题范围。',
    };
  }

  if (config.perSessionCap > 0 && sessionId) {
    return {
      allowed: true,
      scope: 'session',
      used: sessionUsed,
      limit: config.perSessionCap,
      remaining: Math.max(0, config.perSessionCap - sessionUsed - est),
      session_id: sessionId,
    };
  }

  if (config.perOrgDaily > 0 && orgId) {
    return {
      allowed: true,
      scope: 'org_daily',
      used: orgUsed,
      limit: config.perOrgDaily,
      remaining: Math.max(0, config.perOrgDaily - orgUsed - est),
      org_id: orgId,
    };
  }

  if (config.perUserDaily > 0 && hasUserId) {
    return {
      allowed: true,
      scope: 'user_daily',
      used: userUsed,
      limit: config.perUserDaily,
      remaining: Math.max(0, config.perUserDaily - userUsed - est),
    };
  }

  if (config.globalDaily > 0) {
    return {
      allowed: true,
      scope: 'global_daily',
      used: globalUsed,
      limit: config.globalDaily,
      remaining: Math.max(0, config.globalDaily - globalUsed - est),
    };
  }

  return { allowed: true, scope: 'none', used: 0, limit: 0, remaining: Number.MAX_SAFE_INTEGER };
}
