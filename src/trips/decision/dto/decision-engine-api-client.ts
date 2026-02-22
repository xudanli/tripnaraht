// src/trips/decision/dto/decision-engine-api-client.ts
/**
 * 决策引擎 API 前端客户端
 *
 * 统一入口：/api/decision-engine/v1/*
 * 参考: docs/DECISION_ENGINE_API_PRD.md
 */

const API_BASE = '/api/decision-engine/v1';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) },
    ...options,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      error: {
        code: json.error?.code || 'HTTP_ERROR',
        message: json.error?.message || `HTTP ${res.status}`,
        details: json,
      },
    };
  }
  return json as ApiResponse<T>;
}

/** 健康检查 */
export async function health(): Promise<ApiResponse<{ status: string; capabilities: Record<string, boolean> }>> {
  return request('/health', { method: 'GET' });
}

/** 生成计划 */
export async function generatePlan(params: {
  tripId?: string;
  state: Record<string, unknown>;
  requestId?: string;
}): Promise<ApiResponse<{ plan: unknown; log: unknown }>> {
  return request('/generate-plan', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 修复计划 */
export async function repairPlan(params: {
  tripId?: string;
  state: Record<string, unknown>;
  plan: Record<string, unknown>;
  trigger?: string;
}): Promise<ApiResponse<{ plan: unknown; log: unknown }>> {
  return request('/repair-plan', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 安全校验 */
export async function validateSafety(params: {
  tripId: string;
  plan: Record<string, unknown>;
  worldContext: Record<string, unknown>;
}): Promise<ApiResponse<{ allowed: boolean; violations: unknown[]; alternativeRoutes: unknown[] }>> {
  return request('/validate-safety', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 约束校验 */
export async function checkConstraints(params: {
  state: Record<string, unknown>;
  plan: Record<string, unknown>;
}): Promise<ApiResponse<{ feasible: boolean; violations: unknown[]; infeasibilityExplanation?: unknown }>> {
  return request('/check-constraints', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 多方案生成 */
export async function generateMultiplePlans(params: {
  state: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  count?: number;
  requestId?: string;
}): Promise<ApiResponse<{ variants: unknown[]; log: unknown }>> {
  return request('/generate-multiple-plans', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 决策解释 */
export async function explainPlan(params: {
  plan: Record<string, unknown>;
  log: Record<string, unknown>;
  violations?: unknown[];
}): Promise<ApiResponse<{ summary: string; whyThisPlan: unknown[]; slots: unknown[]; violations?: unknown[] }>> {
  return request('/explain-plan', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 节奏调整 */
export async function adjustPacing(params: {
  tripId: string;
  plan: Record<string, unknown>;
  worldContext: Record<string, unknown>;
}): Promise<ApiResponse<{ success: boolean; adjustedPlan?: unknown; changes?: unknown[] }>> {
  return request('/adjust-pacing', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 节点替换 */
export async function replaceNodes(params: {
  tripId: string;
  plan: Record<string, unknown>;
  worldContext: Record<string, unknown>;
  unavailableNodes: Array<{ nodeId: string; reason: string }>;
}): Promise<ApiResponse<{ success: boolean; replacedPlan?: unknown; replacements?: unknown[] }>> {
  return request('/replace-nodes', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
