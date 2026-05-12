/**
 * PRD I5（Robustness）：编排 / MCP / LLM 异常的稳定分类，便于 ExecutionIntegration 与日志聚合
 * 区别于自由文本：failure_domain + failure_code + source_layer 应保持稳定枚举语义。
 */

export type OrchestratorFailureDomain =
  | 'TIMEOUT'
  | 'TOOL'
  | 'LLM'
  | 'NETWORK'
  | 'BUSINESS_RULE'
  | 'ORCHESTRATION'
  | 'UNKNOWN';

/** 责任分层：区分「模型」「工具」「内核约束」「基础设施」 */
export type OrchestratorFailureSourceLayer =
  | 'MCP'
  | 'LLM_PROVIDER'
  | 'SKILL'
  | 'KERNEL'
  | 'ORCHESTRATOR'
  | 'DATABASE'
  | 'UNKNOWN';

export interface OrchestratorRobustnessMetadata {
  failure_domain: OrchestratorFailureDomain;
  /** 稳定机读码：如 LIVE_TOOL_TIMEOUT、VERIFICATION_FATAL */
  failure_code: string;
  source_layer: OrchestratorFailureSourceLayer;
  /** 是否倾向可重试（启发式，非 SLA） */
  retryable_hint?: boolean;
  classified_at?: string;
  orchestrator_step_at_failure?: string;
  /** 截断、单行友善预览（不含 stack） */
  message_preview?: string;
}

function extractMessage(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error && typeof error.message === 'string') return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  try {
    return JSON.stringify(error).slice(0, 500);
  } catch {
    return String(error);
  }
}

function extractCode(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const c = (error as { code?: unknown }).code;
    if (typeof c === 'string' && c.length > 0) return c;
    if (typeof c === 'number') return String(c);
  }
  return '';
}

export function truncateOrchestratorFailurePreview(message: string, maxLen = 240): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

/**
 * 将任意异常映射为 I5 结构化切片（用于 decision_log.metadata / API observability）。
 *
 * 若错误已由 Skill/MCP 层打上 `orchestratorRobustness`，直接透传（避免二次分类退化）。
 */
function tryExtractEmbeddedRobustness(error: unknown): OrchestratorRobustnessMetadata | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const r = (error as { orchestratorRobustness?: OrchestratorRobustnessMetadata }).orchestratorRobustness;
  if (r && typeof r.failure_domain === 'string' && typeof r.failure_code === 'string') return r;
  return undefined;
}

export function classifyOrchestratorFailure(
  error: unknown,
  ctx?: {
    orchestrator_step?: string;
    tool_id?: string;
    skill_name?: string;
    mcp_service?: string;
    mcp_tool?: string;
  },
): OrchestratorRobustnessMetadata {
  const embedded = tryExtractEmbeddedRobustness(error);
  if (embedded) return embedded;

  const msg = extractMessage(error);
  const code = extractCode(error);
  const preview = truncateOrchestratorFailurePreview(msg);
  const base = () => ({
    classified_at: new Date().toISOString(),
    orchestrator_step_at_failure: ctx?.orchestrator_step,
    message_preview: preview,
  });

  /** JSON-RPC 2.0（MCP / 部分桥接层文本形态） */
  if (/-32603\b/.test(msg) || code === '-32603') {
    return {
      ...base(),
      failure_domain: 'TOOL',
      failure_code: 'MCP_JSONRPC_INTERNAL',
      source_layer: 'MCP',
      retryable_hint: true,
    };
  }
  if (/-32602\b/.test(msg) || code === '-32602') {
    return {
      ...base(),
      failure_domain: 'BUSINESS_RULE',
      failure_code: 'MCP_JSONRPC_INVALID_PARAMS',
      source_layer: 'MCP',
      retryable_hint: false,
    };
  }
  if (/-32601\b/.test(msg) || code === '-32601') {
    return {
      ...base(),
      failure_domain: 'BUSINESS_RULE',
      failure_code: 'MCP_JSONRPC_METHOD_NOT_FOUND',
      source_layer: 'MCP',
      retryable_hint: false,
    };
  }

  /** OTA / 供应商业务：不可盲目退避重试 */
  if (
    /余额不足|额度不足|quota\s*exceeded|insufficient\s*funds|payment\s*required|\b402\b|无可用房源|NO_AVAILABILITY|sold\s*out/i.test(
      msg,
    )
  ) {
    return {
      ...base(),
      failure_domain: 'BUSINESS_RULE',
      failure_code: 'OTA_QUOTA_OR_INVENTORY',
      source_layer: 'MCP',
      retryable_hint: false,
    };
  }

  if (/(SERVICE|Skill).*未注入|不可用|not\s*available|SERVICE_UNAVAILABLE/i.test(msg)) {
    return {
      ...base(),
      failure_domain: 'BUSINESS_RULE',
      failure_code: 'SKILL_DEPENDENCY_MISSING',
      source_layer: 'SKILL',
      retryable_hint: false,
    };
  }

  if (msg.includes('LIVE_TOOL_TIMEOUT')) {
    return {
      ...base(),
      failure_domain: 'TOOL',
      failure_code: 'LIVE_TOOL_TIMEOUT',
      source_layer: 'MCP',
      retryable_hint: true,
    };
  }

  if (msg.includes('NO_HOTEL_RESULTS')) {
    return {
      ...base(),
      failure_domain: 'TOOL',
      failure_code: 'NO_HOTEL_RESULTS',
      source_layer: 'MCP',
      retryable_hint: true,
    };
  }

  if (msg.startsWith('TIMEOUT:') || msg.includes('TIMEOUT:CLAUDE')) {
    return {
      ...base(),
      failure_domain: 'TIMEOUT',
      failure_code: 'ORCHESTRATION_TIMEOUT',
      source_layer: 'ORCHESTRATOR',
      retryable_hint: true,
    };
  }

  const netCodes = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'ESOCKETTIMEDOUT',
    'ECONNABORTED',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ]);
  if (code && netCodes.has(code)) {
    return {
      ...base(),
      failure_domain: 'NETWORK',
      failure_code: code,
      source_layer: 'UNKNOWN',
      retryable_hint: true,
    };
  }

  if (/429|rate\s*limit|RateLimit|tokens?\s*quota|RESOURCE_EXHAUSTED/i.test(msg)) {
    return {
      ...base(),
      failure_domain: 'LLM',
      failure_code: 'RATE_LIMIT',
      source_layer: 'LLM_PROVIDER',
      retryable_hint: true,
    };
  }

  if (/VERIFICATION_FATAL|FATAL_VERIFICATION|hasFatal/i.test(msg)) {
    return {
      ...base(),
      failure_domain: 'BUSINESS_RULE',
      failure_code: 'VERIFICATION_FATAL',
      source_layer: 'KERNEL',
      retryable_hint: false,
    };
  }

  if (/PrismaClientKnownRequestError|P20\d{2}|Unique constraint/i.test(msg)) {
    return {
      ...base(),
      failure_domain: 'BUSINESS_RULE',
      failure_code: 'DATABASE_CONSTRAINT',
      source_layer: 'DATABASE',
      retryable_hint: false,
    };
  }

  if (ctx?.skill_name) {
    const transient =
      /timeout|timed\s*out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|429|rate\s*limit|temporar/i.test(msg);
    return {
      ...base(),
      failure_domain: transient ? 'TOOL' : 'ORCHESTRATION',
      failure_code: transient ? 'SKILL_TRANSIENT_ERROR' : 'SKILL_EXECUTION_ERROR',
      source_layer: 'SKILL',
      retryable_hint: transient,
    };
  }

  if (ctx?.tool_id) {
    return {
      ...base(),
      failure_domain: 'TOOL',
      failure_code: 'MCP_TOOL_ERROR',
      source_layer: 'MCP',
      retryable_hint: true,
    };
  }

  return {
    ...base(),
    failure_domain: 'ORCHESTRATION',
    failure_code: code || 'ORCHESTRATION_ERROR',
    source_layer: 'ORCHESTRATOR',
    retryable_hint: false,
  };
}

/** API observability 扁平嵌套（避免网关解析任意 JSON） */
export function toOrchestrationFailureObservability(meta: OrchestratorRobustnessMetadata): {
  orchestration_failure: {
    domain: OrchestratorFailureDomain;
    code: string;
    source_layer: OrchestratorFailureSourceLayer;
    retryable_hint?: boolean;
    orchestrator_step?: string;
    message_preview?: string;
  };
} {
  return {
    orchestration_failure: {
      domain: meta.failure_domain,
      code: meta.failure_code,
      source_layer: meta.source_layer,
      retryable_hint: meta.retryable_hint,
      orchestrator_step: meta.orchestrator_step_at_failure,
      message_preview: meta.message_preview,
    },
  };
}

/**
 * 编排 catch 已判定为 wall-clock / deadline 超时时，统一域为 TIMEOUT（避免与 NETWORK 混淆）。
 */
export function coerceOrchestratorFailureForWallClockTimeout(
  meta: OrchestratorRobustnessMetadata,
): OrchestratorRobustnessMetadata {
  return {
    ...meta,
    failure_domain: 'TIMEOUT',
    failure_code: meta.failure_code === 'ORCHESTRATION_TIMEOUT' ? meta.failure_code : 'WALL_CLOCK_OR_DEADLINE',
    source_layer: 'ORCHESTRATOR',
    retryable_hint: true,
  };
}
