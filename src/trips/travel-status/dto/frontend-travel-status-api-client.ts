/**
 * AI Native Travel Status · 前端 API 客户端
 * 复制到前端：`src/api/travel-status-client.ts`
 */

import type {
  AcceptRecommendedRequest,
  AcceptRecommendedResponse,
  ApiResponse,
  ConsumerDecisionItem,
  ConsumerDecisionQueueView,
  DepartureSlipRequest,
  DepartureSlipResponse,
  TravelStatusView,
  TripContextSnapshotView,
  TripIntentRouteResult,
} from './frontend-travel-status-api.types';

export interface TravelStatusApiConfig {
  baseUrl?: string;
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
}

const defaultConfig: TravelStatusApiConfig = {
  baseUrl: '/api',
};

let config: TravelStatusApiConfig = { ...defaultConfig };

export function configureTravelStatusApi(overrides: TravelStatusApiConfig): void {
  config = { ...config, ...overrides };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(config.getHeaders ? await config.getHeaders() : {}),
    ...(init?.headers ?? {}),
  };

  const res = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success || body.data === undefined) {
    throw new Error(body.error?.message ?? `Request failed: ${path}`);
  }
  return body.data;
}

export const travelStatusApi = {
  getStatus(tripId: string): Promise<TravelStatusView> {
    return request<TravelStatusView>(`/trips/${tripId}/travel-status`);
  },

  getDecisionQueue(tripId: string): Promise<ConsumerDecisionQueueView> {
    return request<ConsumerDecisionQueueView>(`/trips/${tripId}/decision-queue`);
  },

  getDecisionItem(tripId: string, problemId: string): Promise<ConsumerDecisionItem> {
    return request<ConsumerDecisionItem>(`/trips/${tripId}/decision-queue/${problemId}`);
  },

  acceptRecommended(
    tripId: string,
    problemId: string,
    body: AcceptRecommendedRequest = {},
  ): Promise<AcceptRecommendedResponse> {
    return request<AcceptRecommendedResponse>(
      `/trips/${tripId}/decision-queue/${problemId}/accept-recommended`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  /** 保留原计划 — 使用 queue item.actions.keepOriginal.actionId */
  keepOriginal(tripId: string, problemId: string, actionId: string): Promise<AcceptRecommendedResponse> {
    return travelStatusApi.acceptRecommended(tripId, problemId, { actionId });
  },

  /** 稍后再说 — 使用 queue item.actions.defer.actionId */
  defer(tripId: string, problemId: string, actionId: string): Promise<AcceptRecommendedResponse> {
    return travelStatusApi.acceptRecommended(tripId, problemId, { actionId });
  },

  /**
   * 「我晚了」— 上报执行偏差。
   * observedAt 须为 plannedDepartAt + delayMinutes（见 EXECUTION_SLIP_FRONTEND_HANDOFF.md）。
   */
  recordDepartureSlip(
    tripId: string,
    body: DepartureSlipRequest,
    idempotencyKey?: string,
  ): Promise<DepartureSlipResponse> {
    return request<DepartureSlipResponse>(`/trips/${tripId}/execution/departure-slip`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
  },
};

export const tripContextSnapshotApi = {
  getSnapshot(tripId: string, persist = false): Promise<TripContextSnapshotView> {
    const query = persist ? '?persist=1' : '';
    return request<TripContextSnapshotView>(`/trips/${tripId}/context-snapshot${query}`);
  },
};

export const tripIntentApi = {
  postIntent(
    tripId: string,
    body: { message: string; problemId?: string; dayIndex?: number },
    dryRun = false,
  ): Promise<TripIntentRouteResult> {
    const query = dryRun ? '?dryRun=1' : '';
    return request<TripIntentRouteResult>(`/trips/${tripId}/intent${query}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
