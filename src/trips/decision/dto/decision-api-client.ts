/**
 * 决策层 HTTP 客户端（`DecisionController`）
 *
 * 全局前缀：`/api`，控制器：`decision` → `/api/decision/*`
 *
 * 也可从 `decision-http-clients.ts` 以命名空间 `decisionRestApi` 导入；引擎路由见 `decision-engine-api-client.ts`。
 */

const API_BASE = '/api/decision';

export interface DecisionApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<DecisionApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) },
    ...options,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      error: {
        code: (json as any).error?.code || 'HTTP_ERROR',
        message: (json as any).error?.message || `HTTP ${res.status}`,
        details: json,
      },
    };
  }
  return json as DecisionApiResponse<T>;
}

/** 约束冲突检测（可选 tripId → ECO 账本对齐） */
export async function detectConflicts(params: {
  tripId?: string;
  constraints: Record<string, unknown>;
  plan?: Record<string, unknown> | null;
  state?: Record<string, unknown>;
}): Promise<DecisionApiResponse<unknown>> {
  return request('/detect-conflicts', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 约束检查 + 不可行性解释（可选 tripId） */
export async function checkConstraintsWithExplanation(params: {
  tripId?: string;
  state: Record<string, unknown>;
  plan: Record<string, unknown>;
}): Promise<DecisionApiResponse<unknown>> {
  return request('/check-constraints-with-explanation', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 日级效用（可选 tripId） */
export async function computeDailyUtility(params: {
  tripId?: string;
  state: Record<string, unknown>;
  plan: Record<string, unknown>;
}): Promise<DecisionApiResponse<unknown>> {
  return request('/compute-daily-utility', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 多方案生成（与 {@link decision-engine-api-client.generateMultiplePlans} 路径不同：此处为 `/api/decision/generate-multiple-plans`） */
export async function generateMultiplePlansDecision(params: {
  tripId?: string;
  state: Record<string, unknown>;
  constraints: Record<string, unknown>;
}): Promise<DecisionApiResponse<unknown>> {
  return request('/generate-multiple-plans', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
