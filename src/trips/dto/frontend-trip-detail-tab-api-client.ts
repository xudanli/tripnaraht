/**
 * 行程详情 Tab · 前端 API 客户端
 *
 * 用法（Next/React）：
 * ```ts
 * import { tripFilesApi, tripTimelineApi, tripCollabApi } from '@/api/trip-detail-tab-client';
 *
 * const stats = await tripFilesApi.getStats(tripId);
 * const overview = await tripTimelineApi.getOverview(tripId);
 * const collab = await tripCollabApi.getOverview(tripId);
 * ```
 *
 * 可复制到前端 `src/api/trip-detail-tab-client.ts`，并接入现有 `apiClient`。
 */

import type {
  AccommodationOverviewQuery,
  AccommodationOverviewResponse,
  ActivityFavoritesListResponse,
  ApiResponse,
  SetActivityFavoriteInput,
  SetActivityFavoriteResponse,
  CollabOverviewQuery,
  CollabOverviewResponse,
  CreateTripFilePendingInput,
  TimelineOverviewQuery,
  TimelineOverviewResponse,
  TripDetailFirstPaintData,
  TripFileDownloadResponse,
  TripFileItem,
  TripFileListQuery,
  TripFileListResponse,
  TripFileOverviewQuery,
  TripFileOverviewResponse,
  TripFileStatsResponse,
  UploadTripFileInput,
} from './frontend-trip-detail-tab-api.types';
import { TRIP_DETAIL_TAB_BFF_INCLUDES } from './frontend-trip-detail-tab-api.types';

export { TRIP_DETAIL_TAB_BFF_INCLUDES } from './frontend-trip-detail-tab-api.types';

export interface TripDetailTabApiConfig {
  baseUrl?: string;
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
}

const defaultConfig: TripDetailTabApiConfig = {
  baseUrl: '/api',
};

let globalConfig: TripDetailTabApiConfig = { ...defaultConfig };

export function configureTripDetailTabApi(config: TripDetailTabApiConfig): void {
  globalConfig = { ...defaultConfig, ...config };
}

function tripsBase(tripId: string): string {
  const base = globalConfig.baseUrl?.replace(/\/$/, '') ?? '/api';
  return `${base}/trips/${encodeURIComponent(tripId)}`;
}

function serializeInclude(
  include?: string | string[] | readonly string[],
): string | undefined {
  if (!include) return undefined;
  if (typeof include === 'string') return include;
  return [...include].join(',');
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function requestJson<T>(
  url: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const extraHeaders = globalConfig.getHeaders ? await globalConfig.getHeaders() : {};
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...extraHeaders,
      ...init.headers,
    },
  });

  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok && body.success !== false) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (body.success === false) {
    throw new Error(body.error?.message ?? 'Request failed');
  }
  return body;
}

async function requestForm<T>(url: string, form: FormData): Promise<ApiResponse<T>> {
  const extraHeaders = globalConfig.getHeaders ? await globalConfig.getHeaders() : {};
  const { 'Content-Type': _drop, ...headersWithoutContentType } = extraHeaders;
  const response = await fetch(url, {
    method: 'POST',
    body: form,
    headers: {
      Accept: 'application/json',
      ...headersWithoutContentType,
    },
  });
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok && body.success !== false) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (body.success === false) {
    throw new Error(body.error?.message ?? 'Upload failed');
  }
  return body;
}

function unwrap<T>(res: ApiResponse<T>): T {
  if (res.data === undefined) {
    throw new Error('Empty response data');
  }
  return res.data;
}

export const tripFilesApi = {
  async getList(tripId: string, query?: TripFileListQuery): Promise<TripFileListResponse> {
    const url =
      tripsBase(tripId) +
      '/files' +
      buildQuery({
        category: query?.category,
        status: query?.status,
        limit: query?.limit,
        offset: query?.offset,
      });
    return unwrap(await requestJson<TripFileListResponse>(url));
  },

  async getStats(tripId: string): Promise<TripFileStatsResponse> {
    const url = `${tripsBase(tripId)}/files/stats`;
    return unwrap(await requestJson<TripFileStatsResponse>(url));
  },

  async getOverview(
    tripId: string,
    query?: TripFileOverviewQuery,
  ): Promise<TripFileOverviewResponse> {
    const url =
      `${tripsBase(tripId)}/files/overview` +
      buildQuery({
        category: query?.category,
        status: query?.status,
        source: query?.source,
        limit: query?.limit,
        offset: query?.offset,
        includePending:
          query?.includePending === undefined ? undefined : query.includePending ? 'true' : 'false',
      });
    return unwrap(await requestJson<TripFileOverviewResponse>(url));
  },

  async upload(tripId: string, input: UploadTripFileInput): Promise<TripFileItem> {
    const form = new FormData();
    form.append('file', input.file);
    form.append('category', input.category);
    if (input.title) form.append('title', input.title);
    if (input.description) form.append('description', input.description);
    if (input.expiresAt) form.append('expiresAt', input.expiresAt);
    if (input.itineraryItemId) form.append('itineraryItemId', input.itineraryItemId);
    const url = `${tripsBase(tripId)}/files`;
    return unwrap(await requestForm<TripFileItem>(url, form));
  },

  async createPending(tripId: string, input: CreateTripFilePendingInput): Promise<TripFileItem> {
    const url = `${tripsBase(tripId)}/files/pending`;
    return unwrap(
      await requestJson<TripFileItem>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  },

  async getDownloadUrl(tripId: string, fileId: string): Promise<TripFileDownloadResponse> {
    const url = `${tripsBase(tripId)}/files/${encodeURIComponent(fileId)}/download`;
    return unwrap(await requestJson<TripFileDownloadResponse>(url));
  },

  async delete(tripId: string, fileId: string): Promise<{ deleted: true }> {
    const url = `${tripsBase(tripId)}/files/${encodeURIComponent(fileId)}`;
    return unwrap(await requestJson<{ deleted: true }>(url, { method: 'DELETE' }));
  },

  async loadTabData(tripId: string): Promise<TripFileOverviewResponse> {
    return this.getOverview(tripId, { limit: 50, offset: 0 });
  },
};

export const tripTimelineApi = {
  async getOverview(
    tripId: string,
    query?: TimelineOverviewQuery,
  ): Promise<TimelineOverviewResponse> {
    const url =
      `${tripsBase(tripId)}/timeline-overview` +
      buildQuery({
        include: serializeInclude(query?.include),
        preset: query?.preset,
      });
    return unwrap(await requestJson<TimelineOverviewResponse>(url));
  },

  /** 首屏壳层 — preset=shell（stats only，~550ms p95 冰岛 fixture） */
  getShellOverview(tripId: string) {
    return this.getOverview(tripId, { preset: 'shell' });
  },

  /** Phase-2 — pipeline/tasks/reminders + stats.newSuggestionCount，不含 suggestions 列表 */
  getPhase2Overview(tripId: string) {
    return this.getOverview(tripId, { preset: 'full' });
  },

  /** 含 suggestions 派生列表（~+250ms，建议 lazy） */
  getOverviewWithSuggestions(tripId: string) {
    return this.getOverview(tripId, {
      include: TRIP_DETAIL_TAB_BFF_INCLUDES.timelineWithSuggestions,
    });
  },
};

export const tripCollabApi = {
  async getOverview(
    tripId: string,
    query?: CollabOverviewQuery,
  ): Promise<CollabOverviewResponse> {
    const url =
      `${tripsBase(tripId)}/collab-overview` +
      buildQuery({
        include: serializeInclude(query?.include),
        preset: query?.preset,
      });
    return unwrap(await requestJson<CollabOverviewResponse>(url));
  },

  getShellOverview(tripId: string) {
    return this.getOverview(tripId, { preset: 'shell' });
  },

  getPhase2Overview(tripId: string) {
    return this.getOverview(tripId, { preset: 'full' });
  },
};

export const tripAccommodationApi = {
  async getOverview(
    tripId: string,
    query?: AccommodationOverviewQuery,
  ): Promise<AccommodationOverviewResponse> {
    const url =
      `${tripsBase(tripId)}/accommodation-overview` +
      buildQuery({ include: serializeInclude(query?.include) });
    return unwrap(await requestJson<AccommodationOverviewResponse>(url));
  },

  async loadTabData(tripId: string): Promise<AccommodationOverviewResponse> {
    return this.getOverview(tripId);
  },
};

export const tripActivityFavoritesApi = {
  async list(tripId: string): Promise<ActivityFavoritesListResponse> {
    const url = `${tripsBase(tripId)}/activity-favorites`;
    return unwrap(await requestJson<ActivityFavoritesListResponse>(url));
  },

  async setFavorite(
    tripId: string,
    input: SetActivityFavoriteInput,
  ): Promise<SetActivityFavoriteResponse> {
    const url = `${tripsBase(tripId)}/activity-favorites`;
    return unwrap(
      await requestJson<SetActivityFavoriteResponse>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  },

  async toggleItineraryItem(
    tripId: string,
    itineraryItemId: string,
    favorited: boolean,
  ): Promise<SetActivityFavoriteResponse> {
    return this.setFavorite(tripId, { itineraryItemId, favorited });
  },
};

export const tripDetailTabApi = {
  files: tripFilesApi,
  timeline: tripTimelineApi,
  collab: tripCollabApi,
  accommodation: tripAccommodationApi,
  activityFavorites: tripActivityFavoritesApi,
  configure: configureTripDetailTabApi,

  /** 首屏四 Tab 并行（shell timeline/collab + files/accommodation） */
  async loadFirstPaint(tripId: string): Promise<TripDetailFirstPaintData> {
    const [timeline, collab, files, accommodation] = await Promise.all([
      tripTimelineApi.getShellOverview(tripId),
      tripCollabApi.getShellOverview(tripId),
      tripFilesApi.getOverview(tripId, { limit: 50, offset: 0 }),
      tripAccommodationApi.getOverview(tripId),
    ]);
    return { timeline, collab, files, accommodation };
  },

  /** 二段 lazy — timeline/collab phase-2（进入 Tab 或 idle 时调用） */
  async loadPhase2(tripId: string) {
    const [timeline, collab] = await Promise.all([
      tripTimelineApi.getPhase2Overview(tripId),
      tripCollabApi.getPhase2Overview(tripId),
    ]);
    return { timeline, collab };
  },
};

export default tripDetailTabApi;
