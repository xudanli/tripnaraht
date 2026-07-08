import type { TravelContextViewName } from '../domain/travel-context.constants';
import type { TravelContextViewEnvelope } from '../domain/travel-context.types';
import {
  fetchTravelContextDiff,
  fetchTravelContextSnapshot,
  fetchTravelContextView,
  resolveTravelContextByTrip,
  submitTravelContextIntent,
  subscribeTravelContextRevisionEvents,
  viewCacheKey,
} from './travel-context-api-client';
import type {
  TravelContextDiff,
  TravelContextIntentRequest,
  TravelContextIntentResult,
  TravelContextProvider,
  TravelContextProviderOptions,
  TravelContextProviderState,
  TravelContextRevisionEvent,
} from './travel-context-api.types';

/** In-memory projection cache — key: contextId:view:revision */
export class TravelContextViewCache {
  private readonly store = new Map<string, TravelContextViewEnvelope>();

  get(contextId: string, view: TravelContextViewName, revision: number) {
    return this.store.get(viewCacheKey(contextId, view, revision));
  }

  set(envelope: TravelContextViewEnvelope) {
    this.store.set(viewCacheKey(envelope.contextId, envelope.view, envelope.revision), envelope);
  }

  invalidateContext(contextId: string) {
    for (const key of this.store.keys()) {
      if (key.startsWith(`${contextId}:`)) this.store.delete(key);
    }
  }
}

/**
 * Framework-agnostic Travel Context Provider (RFC-003 §10).
 * React/Vue apps wrap this with hooks; revision + view cache included.
 */
export function createTravelContextProvider(
  options: TravelContextProviderOptions,
): TravelContextProvider {
  const baseUrl = options.baseUrl ?? '/api/travel-contexts';
  const cache = new TravelContextViewCache();
  const listeners = new Set<() => void>();
  let activeContextId = options.contextId;

  let state: TravelContextProviderState = {
    contextId: activeContextId,
    revision: 0,
    snapshotId: '',
    stage: 'EXPLORATION',
    views: {},
    loading: false,
  };

  const notify = () => {
    for (const listener of listeners) notifySafe(listener);
  };

  const setState = (patch: Partial<TravelContextProviderState>) => {
    state = { ...state, ...patch };
    notify();
  };

  async function refresh() {
    setState({ loading: true, error: undefined });
    try {
      const snapshot = await fetchTravelContextSnapshot(options.token, activeContextId, baseUrl);
      cache.invalidateContext(activeContextId);
      setState({
        contextId: snapshot.identity.contextId,
        revision: snapshot.meta.revision,
        snapshotId: snapshot.meta.snapshotId,
        stage: snapshot.identity.stage,
        snapshot,
        views: {},
        loading: false,
      });

      if (options.prefetchViews?.length) {
        await Promise.all(options.prefetchViews.map((view) => getView(view)));
      }
    } catch (e) {
      setState({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  async function getView(view: TravelContextViewName): Promise<TravelContextViewEnvelope> {
    const cached = cache.get(state.contextId, view, state.revision);
    if (cached) return cached;

    const envelope = await fetchTravelContextView(options.token, state.contextId, view, baseUrl);

    if (envelope.revision !== state.revision) {
      setState({
        revision: envelope.revision,
        snapshotId: envelope.snapshotId,
      });
    }

    cache.set(envelope);
    setState({
      views: { ...state.views, [view]: envelope },
    });
    return envelope;
  }

  async function resolveFromTrip(tripId: string) {
    const resolved = await resolveTravelContextByTrip(options.token, tripId, baseUrl);
    activeContextId = resolved.contextId;
    setState({
      contextId: resolved.contextId,
      revision: resolved.revision,
      snapshotId: resolved.snapshotId,
      stage: resolved.stage,
    });
    await refresh();
    return resolved;
  }

  async function submitIntent(intent: TravelContextIntentRequest): Promise<TravelContextIntentResult> {
    const result = await submitTravelContextIntent(
      options.token,
      activeContextId,
      intent,
      baseUrl,
    );
    cache.invalidateContext(activeContextId);
    setState({
      revision: result.revision,
      snapshotId: result.snapshotId,
      stage: result.stage,
      views: {},
      snapshot: undefined,
    });
    await refresh();
    return result;
  }

  async function fetchDiff(sinceRevision: number): Promise<TravelContextDiff> {
    return fetchTravelContextDiff(options.token, activeContextId, sinceRevision, baseUrl);
  }

  async function handleRevisionEvent(event: TravelContextRevisionEvent) {
    if (event.revision <= state.revision) return;

    const since = state.revision;
    const diff = await fetchDiff(since);

    if (diff.requiresFullRefresh) {
      await refresh();
      return;
    }

    cache.invalidateContext(activeContextId);
    setState({
      revision: event.revision,
      snapshotId: event.snapshotId,
      views: {},
      snapshot: undefined,
    });

    if (options.prefetchViews?.length) {
      await Promise.all(options.prefetchViews.map((view) => getView(view)));
    }
  }

  if (options.subscribeRevisionEvents) {
    subscribeTravelContextRevisionEvents(
      options.token,
      activeContextId,
      (event) => {
        void handleRevisionEvent(event);
      },
      baseUrl,
    );
  }

  function subscribeRevisionEvents() {
    return subscribeTravelContextRevisionEvents(
      options.token,
      activeContextId,
      (event) => {
        void handleRevisionEvent(event);
      },
      baseUrl,
    );
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    getView,
    resolveFromTrip,
    submitIntent,
    fetchDiff,
    subscribeRevisionEvents,
  };
}

function notifySafe(listener: () => void) {
  try {
    listener();
  } catch {
    // subscriber errors must not break provider
  }
}
