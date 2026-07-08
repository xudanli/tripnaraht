/**
 * CPRE HTTP Client — Base: `/api/poi`
 * 建议复制到前端 `features/poi-resolution/api/` 或与 exploration client 同目录
 */

import type {
  ApiResponse,
  CanonicalPOIView,
  ResolutionResult,
  ResolvePoiBatchResult,
} from './frontend-cpre-api.types';

const POI_BASE = '/api/poi';

async function request<T>(
  path: string,
  token: string | undefined,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error?.message ?? `CPRE HTTP ${res.status}`);
  }
  return body.data as T;
}

export async function resolvePoi(
  input: {
    name: string;
    countryCode?: string;
    locale?: string;
    lat?: number;
    lng?: number;
    tripId?: string;
  },
  token?: string,
): Promise<ResolutionResult> {
  return request(`${POI_BASE}/resolve`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function resolvePoiBatch(
  items: Array<{
    name: string;
    countryCode?: string;
    locale?: string;
  }>,
  token?: string,
): Promise<ResolvePoiBatchResult> {
  return request(`${POI_BASE}/resolve/batch`, token, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function getCanonicalPoi(
  poiId: string,
  token?: string,
): Promise<CanonicalPOIView | null> {
  return request(`${POI_BASE}/canonical/${encodeURIComponent(poiId)}`, token);
}

/** 用户从候选列表确认 POI — 触发 Learning Flywheel（需 JWT） */
export async function confirmPoiResolution(
  token: string,
  input: {
    queryName: string;
    selectedPoiId: string;
    countryCode?: string;
    locale?: string;
    resolutionLogId?: string;
  },
): Promise<ResolutionResult> {
  return request(`${POI_BASE}/confirm`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
