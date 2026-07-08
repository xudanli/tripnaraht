/**
 * 约束控制台 / 旅行决策合同 — 前端 API Client
 *
 * Base URL: `/api/trips/:tripId/constraints`
 */

import type {
  ApiResponse,
  ConstraintConsoleViewModel,
  PatchTravelDecisionContractRequest,
  PatchTravelDecisionContractResponse,
  TripConstraint,
  TripConstraintCheckResponse,
  TripConstraintImpactPreviewResponse,
  TripConstraintsListResponse,
} from './frontend-travel-decision-contract-api.types';
import { buildConstraintConsoleViewModel } from './frontend-travel-decision-contract-view.util';

const API_PREFIX = '/api';

async function request<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.error?.message ?? `HTTP ${response.status}`);
  }
  return data as ApiResponse<T>;
}

export async function fetchConstraintConsole(
  tripId: string,
  query?: { type?: string; category?: string; conflictOnly?: boolean },
): Promise<ConstraintConsoleViewModel> {
  const params = new URLSearchParams();
  if (query?.type) params.set('type', query.type);
  if (query?.category) params.set('category', query.category);
  if (query?.conflictOnly) params.set('conflictOnly', '1');

  const qs = params.toString();
  const res = await request<TripConstraintsListResponse>(
    `${API_PREFIX}/trips/${tripId}/constraints${qs ? `?${qs}` : ''}`,
  );
  if (!res.data) throw new Error('Empty constraints response');
  return buildConstraintConsoleViewModel(res.data);
}

export async function patchTravelDecisionContract(
  tripId: string,
  body: PatchTravelDecisionContractRequest,
): Promise<PatchTravelDecisionContractResponse> {
  const res = await request<PatchTravelDecisionContractResponse>(
    `${API_PREFIX}/trips/${tripId}/constraints/contract`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  if (!res.data) throw new Error('Empty patch contract response');
  return res.data;
}

export async function previewConstraintImpact(
  tripId: string,
  changes: Array<{ constraintId: string; patch: Partial<TripConstraint> }>,
  options?: { persist?: boolean; refreshType?: 'quick' | 'deep'; constraintsVersion?: number },
): Promise<TripConstraintImpactPreviewResponse> {
  const res = await request<TripConstraintImpactPreviewResponse>(
    `${API_PREFIX}/trips/${tripId}/constraints/preview-impact`,
    {
      method: 'POST',
      body: JSON.stringify({
        changes,
        persist: options?.persist ?? false,
        refreshType: options?.refreshType,
        constraintsVersion: options?.constraintsVersion,
      }),
    },
  );
  if (!res.data) throw new Error('Empty preview-impact response');
  return res.data;
}

export async function checkConstraintConflicts(
  tripId: string,
): Promise<TripConstraintCheckResponse> {
  const res = await request<TripConstraintCheckResponse>(
    `${API_PREFIX}/trips/${tripId}/constraints/check`,
    { method: 'POST', body: '{}' },
  );
  if (!res.data) throw new Error('Empty check response');
  return res.data;
}

export { buildConstraintConsoleViewModel };
