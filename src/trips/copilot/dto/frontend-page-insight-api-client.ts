/**
 * Nara Page Insight — frontend TS client (Web / iOS shared contract).
 *
 * Canonical: `/api/trips/:tripId/copilot/...`
 * Mobile may call the same paths or a future `/api/mobile/...` alias.
 *
 * @see PAGE_INSIGHT_API.md
 * @see FRONTEND_INSIGHT_CARD.md
 */

import type {
  ClientPageState,
  PageInsightEvaluateResponse,
  PageInsightFeedbackRequest,
  PageInsightGetResponse,
} from '../contracts/page-insight.types';

export type {
  ClientPageState,
  NaraPageInsight,
  InsightAction,
  PageInsightEvaluateResponse,
  PageInsightGetResponse,
  PageInsightFeedbackRequest,
} from '../contracts/page-insight.types';

type FetchLike = typeof fetch;

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!res.ok || body.success === false) {
    throw new Error(body.error?.message || body.error?.code || `HTTP ${res.status}`);
  }
  return body.data as T;
}

export function createPageInsightApiClient(opts: {
  baseUrl: string;
  getAccessToken?: () => string | Promise<string | undefined>;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function authHeaders(): Promise<HeadersInit> {
    const token = opts.getAccessToken ? await opts.getAccessToken() : undefined;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  return {
    async evaluate(
      tripId: string,
      client: ClientPageState,
    ): Promise<PageInsightEvaluateResponse> {
      const res = await fetchImpl(
        joinUrl(opts.baseUrl, `/api/trips/${tripId}/copilot/page-insights:evaluate`),
        {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify(client),
        },
      );
      return readJson(res);
    },

    async getInsight(tripId: string, insightId: string): Promise<PageInsightGetResponse> {
      const res = await fetchImpl(
        joinUrl(opts.baseUrl, `/api/trips/${tripId}/copilot/page-insights/${insightId}`),
        { headers: await authHeaders() },
      );
      return readJson(res);
    },

    async feedback(
      tripId: string,
      insightId: string,
      body: PageInsightFeedbackRequest,
    ): Promise<{ ok: true; insightId: string; type: string }> {
      const res = await fetchImpl(
        joinUrl(
          opts.baseUrl,
          `/api/trips/${tripId}/copilot/page-insights/${insightId}/feedback`,
        ),
        {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify(body),
        },
      );
      return readJson(res);
    },
  };
}

/**
 * Resolve PREVIEW payloadRef → existing Decision API paths.
 * Copilot does not host options/preview itself.
 */
export function resolveDecisionPreviewFromPayloadRef(
  tripId: string,
  payloadRef: string,
): { problemId: string; detailPath: string; optionsPath: string; bundlePath: string } | null {
  const m = /^decision-problem:(.+)$/.exec(payloadRef);
  if (!m) return null;
  const problemId = m[1];
  return {
    problemId,
    detailPath: `/api/trips/${tripId}/decision-problems/${problemId}`,
    optionsPath: `/api/trips/${tripId}/decision-problems/${problemId}/options`,
    bundlePath: `/api/trips/${tripId}/decision-space-bundle?problemId=${encodeURIComponent(problemId)}&surface=default`,
  };
}

/**
 * Resolve PREVIEW_ADD_ACTIVITY payloadRef → arrange-itinerary proposal.
 */
export function resolvePlanProposalFromPayloadRef(
  tripId: string,
  payloadRef: string,
): { proposalId: string; proposalPath: string; inspectorPath: string } | null {
  const m = /^plan-proposal:(.+)$/.exec(payloadRef);
  if (!m) return null;
  const proposalId = m[1];
  return {
    proposalId,
    proposalPath: `/api/trips/${tripId}/arrange-itinerary/proposals/${proposalId}`,
    inspectorPath: `/api/trips/${tripId}/arrange-itinerary/decision-inspector?proposalId=${encodeURIComponent(proposalId)}`,
  };
}

