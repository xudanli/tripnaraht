/**
 * Travel Context API Client — RFC-003 Phase 2
 * Base: `/api/travel-contexts`
 */

import type { TravelContextViewName } from '../domain/travel-context.constants';
import type {
  ApiResponse,
  TravelContextDiff,
  TravelContextIntentRequest,
  TravelContextIntentResult,
  TravelContextResolveView,
  TravelContextRevisionEvent,
  TravelContextViewsIndex,
} from './travel-context-api.types';
import type { TravelContextSnapshot, TravelContextViewEnvelope } from '../domain/travel-context.types';

const DEFAULT_BASE = '/api/travel-contexts';

async function request<T>(
  url: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || json.success === false) {
    const err = new Error(json.error?.message ?? `HTTP ${res.status}`) as Error & {
      code?: string;
      status?: number;
      details?: Record<string, unknown>;
    };
    err.code = json.error?.code;
    err.status = res.status;
    err.details = (json.error as { details?: Record<string, unknown> })?.details;
    throw err;
  }
  if (json.data === undefined) throw new Error('Empty API response');
  return json.data;
}

export async function fetchTravelContextSnapshot(
  token: string,
  contextId: string,
  baseUrl = DEFAULT_BASE,
): Promise<TravelContextSnapshot> {
  return request(`${baseUrl}/${contextId}`, token);
}

export async function fetchTravelContextView<T = Record<string, unknown>>(
  token: string,
  contextId: string,
  view: TravelContextViewName,
  baseUrl = DEFAULT_BASE,
): Promise<TravelContextViewEnvelope<T>> {
  return request(`${baseUrl}/${contextId}/views/${view}`, token);
}

export async function fetchTravelContextViewsIndex(
  token: string,
  contextId: string,
  baseUrl = DEFAULT_BASE,
): Promise<TravelContextViewsIndex> {
  return request(`${baseUrl}/${contextId}/views`, token);
}

export async function resolveTravelContextByTrip(
  token: string,
  tripId: string,
  baseUrl = DEFAULT_BASE,
): Promise<TravelContextResolveView> {
  return request(`${baseUrl}/resolve/by-trip/${tripId}`, token);
}

export function viewCacheKey(contextId: string, view: TravelContextViewName, revision: number): string {
  return `${contextId}:${view}:${revision}`;
}

export async function submitTravelContextIntent(
  token: string,
  contextId: string,
  intent: TravelContextIntentRequest,
  baseUrl = DEFAULT_BASE,
): Promise<TravelContextIntentResult> {
  return request(`${baseUrl}/${contextId}/intents`, token, {
    method: 'POST',
    body: JSON.stringify(intent),
  });
}

export async function fetchTravelContextDiff(
  token: string,
  contextId: string,
  sinceRevision: number,
  baseUrl = DEFAULT_BASE,
): Promise<TravelContextDiff> {
  const url = `${baseUrl}/${contextId}/diff?sinceRevision=${encodeURIComponent(String(sinceRevision))}`;
  return request(url, token);
}

export function subscribeTravelContextRevisionEvents(
  token: string,
  contextId: string,
  onEvent: (event: TravelContextRevisionEvent) => void,
  baseUrl = DEFAULT_BASE,
): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const res = await fetch(`${baseUrl}/${contextId}/events`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;
          try {
            onEvent(JSON.parse(dataLine.slice(6)) as TravelContextRevisionEvent);
          } catch {
            // ignore malformed payloads
          }
        }
      }
    } catch {
      // stream closed or aborted
    }
  })();

  return () => controller.abort();
}
