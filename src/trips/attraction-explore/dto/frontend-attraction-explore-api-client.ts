/**
 * Attraction Explore BFF Client
 * Base: `/api/trips/:tripId/attraction-explore`
 */

import type {
  AttractionExploreAiConsultResult,
  AttractionExploreAutoArrangeResult,
  AttractionExploreCandidatesView,
  AttractionExploreContextView,
  AttractionExploreMapView,
  AttractionExplorePriority,
  AttractionExploreRecommendationsView,
  AttractionExploreViewTab,
} from './frontend-attraction-explore-api.types';

export type {
  AttractionExploreAiConsultResult,
  AttractionExploreAutoArrangeResult,
  AttractionExploreCandidatesView,
  AttractionExploreContextView,
  AttractionExploreMapView,
  AttractionExplorePriority,
  AttractionExploreRecommendationsView,
  AttractionExploreViewTab,
};

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

function base(tripId: string) {
  return `/api/trips/${tripId}/attraction-explore`;
}

async function request<T>(url: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success) {
    throw new Error((json as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return json.data;
}

export async function fetchAttractionExploreContext(
  token: string,
  tripId: string,
): Promise<AttractionExploreContextView> {
  return request(`${base(tripId)}/context`, token);
}

export async function patchAttractionExploreContext(
  token: string,
  tripId: string,
  body: {
    themeIds?: string[];
    suitabilityIds?: string[];
    viewTab?: AttractionExploreViewTab;
  },
): Promise<AttractionExploreContextView> {
  return request(`${base(tripId)}/context`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function fetchAttractionExploreRecommendations(
  token: string,
  tripId: string,
  query?: { themeIds?: string[]; suitabilityIds?: string[]; viewTab?: AttractionExploreViewTab },
): Promise<AttractionExploreRecommendationsView> {
  const params = new URLSearchParams();
  if (query?.themeIds?.length) params.set('themeIds', query.themeIds.join(','));
  if (query?.suitabilityIds?.length) params.set('suitabilityIds', query.suitabilityIds.join(','));
  if (query?.viewTab) params.set('viewTab', query.viewTab);
  const qs = params.toString();
  return request(`${base(tripId)}/recommendations${qs ? `?${qs}` : ''}`, token);
}

export async function searchAttractionExplore(
  token: string,
  tripId: string,
  body: {
    query: string;
    themeIds?: string[];
    suitabilityIds?: string[];
    viewTab?: AttractionExploreViewTab;
    limit?: number;
  },
): Promise<AttractionExploreRecommendationsView> {
  return request(`${base(tripId)}/search`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 服务端持久化候选 — 含攻略 accept / 路线 seed 写入的点 */
export async function fetchAttractionExploreCandidates(
  token: string,
  tripId: string,
): Promise<AttractionExploreCandidatesView> {
  return request(`${base(tripId)}/candidates`, token);
}

export async function addAttractionExploreCandidate(
  token: string,
  tripId: string,
  body: { placeId?: number; attractionId?: string; priority?: AttractionExplorePriority },
): Promise<AttractionExploreCandidatesView> {
  return request(`${base(tripId)}/candidates`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patchAttractionExploreCandidates(
  token: string,
  tripId: string,
  body: {
    candidates: Array<{ id: string; priority: AttractionExplorePriority; sortOrder: number }>;
  },
): Promise<AttractionExploreCandidatesView> {
  return request(`${base(tripId)}/candidates`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteAttractionExploreCandidate(
  token: string,
  tripId: string,
  candidateId: string,
): Promise<AttractionExploreCandidatesView> {
  return request(`${base(tripId)}/candidates/${candidateId}`, token, {
    method: 'DELETE',
  });
}

export async function autoArrangeAttractionExplore(
  token: string,
  tripId: string,
  body?: { candidateIds?: string[] },
): Promise<AttractionExploreAutoArrangeResult> {
  return request(`${base(tripId)}/auto-arrange`, token, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export async function consultAttractionExploreAi(
  token: string,
  tripId: string,
  body?: { question?: string; candidateIds?: string[] },
): Promise<AttractionExploreAiConsultResult> {
  return request(`${base(tripId)}/ai-consult`, token, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export async function fetchAttractionExploreMap(
  token: string,
  tripId: string,
  query?: {
    candidateIds?: string[];
    viewTab?: AttractionExploreViewTab;
    dayIndex?: number;
    highlightItemId?: string;
  },
): Promise<AttractionExploreMapView> {
  const params = new URLSearchParams();
  if (query?.candidateIds?.length) params.set('candidateIds', query.candidateIds.join(','));
  if (query?.viewTab) params.set('viewTab', query.viewTab);
  if (query?.dayIndex != null) params.set('dayIndex', String(query.dayIndex));
  if (query?.highlightItemId) params.set('highlightItemId', query.highlightItemId);
  const qs = params.toString();
  return request(`${base(tripId)}/map${qs ? `?${qs}` : ''}`, token);
}
