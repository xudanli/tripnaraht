/**
 * Exploration Consumer API Client — Hub ①「告诉 AI 我想去哪」
 * Base: `/api/exploration` · Research: `/api/research`
 */

import type {
  ApiResponse,
  ApplyDecisionView,
  CheckJobPollView,
  CommitmentResult,
  ConditionsCatalogView,
  ConsumerPrincipleCard,
  PrinciplesSummaryView,
  ContinuePackagesView,
  DepositPaymentView,
  ExplorationCandidatesStatus,
  ExplorationConditionsView,
  ExplorationFlowState,
  ExplorationScenarioCreated,
  ExplorationScenarioDetail,
  IssuesView,
  PaymentCatalogView,
  PriceLockResult,
  RepairOption,
  RouteCandidate,
  ExplorationRouteDetailView,
  CompareDimensionDef,
} from './frontend-exploration-api.types';

export {
  GENERATION_SOURCE_BADGES,
  formatExplorationIssuesSummary,
  getComparePageHeadline,
  getExplorationIssueSourceKind,
  getGenerationSourceBadge,
  getStaleCandidatesBannerText,
  getConditionsChangedBannerText,
  isCprePoiConsumerIssue,
  isOntologyConsumerIssue,
  shouldRegenerateCandidates,
  shouldShowComparePage,
} from './frontend-exploration-api.helpers';
export type {
  ExplorationIssueSourceKind,
  GenerationSourceBadge,
  GenerationSourceCode,
} from './frontend-exploration-api.helpers';

const EXPLORATION = '/api/exploration';
const RESEARCH = '/api/research';

export type { ExplorationFlowState };

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
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }
  if (json.data === undefined) throw new Error('Empty API response');
  return json.data;
}

/** Hub ① 入口 — Consumer 可配置条件（不传 researchProtocolId）或研究 protocol */
export async function startExplorationFromHub(
  token: string,
  body?: {
    researchProtocolId?: string;
    destinationCodes?: string[];
    dateRange?: { startDate: string; endDate: string };
    travelers?: Array<{ type: 'ADULT' | 'CHILD' | 'INFANT'; age?: number }>;
    budget?: { currency: string; min?: number; max?: number };
    mobilityContext?: { vehicleType?: string };
    insuranceContext?: { coverageTier?: 'BASIC' | 'STANDARD' | 'FULL' | 'UNKNOWN' };
    rentalContext?: {
      pickupLocation?: string;
      pickupTimeLocal?: string;
      afterHoursPickupConfirmed?: boolean;
    };
  },
): Promise<ExplorationScenarioCreated> {
  const payload: Record<string, unknown> = {};
  if (body?.researchProtocolId) {
    payload.researchProtocolId = body.researchProtocolId;
  }
  if (body?.destinationCodes) payload.destinationCodes = body.destinationCodes;
  if (body?.dateRange) payload.dateRange = body.dateRange;
  if (body?.travelers) payload.travelers = body.travelers;
  if (body?.budget) payload.budget = body.budget;
  if (body?.mobilityContext) payload.mobilityContext = body.mobilityContext;
  if (body?.insuranceContext) payload.insuranceContext = body.insuranceContext;
  if (body?.rentalContext) payload.rentalContext = body.rentalContext;

  return request(`${EXPLORATION}/scenarios`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchConditionsCatalog(
  token: string,
  destinationCode = 'IS',
): Promise<ConditionsCatalogView> {
  return request(
    `${EXPLORATION}/conditions/catalog?destinationCode=${encodeURIComponent(destinationCode)}`,
    token,
  );
}

export async function fetchScenarioDetail(
  token: string,
  scenarioId: string,
): Promise<ExplorationScenarioDetail> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}`, token);
}

export async function patchScenarioConditions(
  token: string,
  scenarioId: string,
  body: Partial<ExplorationConditionsView>,
): Promise<{
  scenarioId: string;
  lockedFields: string[];
  scenario: ExplorationConditionsView;
  materializationStatus: string;
  tripSynced?: boolean;
  candidatesInvalidated?: number;
  candidatesStatus?: ExplorationCandidatesStatus;
}> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/conditions`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function fetchPrincipleCatalog(token: string): Promise<ConsumerPrincipleCard[]> {
  return request(`${EXPLORATION}/principles/catalog`, token);
}

export async function savePrinciples(
  token: string,
  scenarioId: string,
  principles: Array<{ principleId: string; rank: number }>,
): Promise<{
  consumerPrinciples: ConsumerPrincipleCard[];
  constraintsVersion: number;
  candidatesInvalidated?: number;
  candidatesStatus?: ExplorationCandidatesStatus;
}> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/principles`, token, {
    method: 'PUT',
    body: JSON.stringify({ principles }),
  });
}

/** 原则页实时预览 — 不落库；空 principles 返回 placeholder */
export async function previewPrinciplesSummary(
  token: string,
  scenarioId: string,
  principles: Array<{ principleId: string; rank: number }>,
): Promise<PrinciplesSummaryView> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/principles/summary`, token, {
    method: 'POST',
    body: JSON.stringify({ principles }),
  });
}

export async function generateCandidates(
  token: string,
  scenarioId: string,
  options?: { force?: boolean; idempotencyKey?: string },
): Promise<{
  candidates: RouteCandidate[];
  generationVersion: number;
  generationMode?: 'STATIC' | 'PERSONALIZED' | 'ENGINE';
}> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/candidates`, token, {
    method: 'POST',
    body: JSON.stringify(options ?? {}),
  });
}

export async function regenerateCandidates(
  token: string,
  scenarioId: string,
): Promise<{
  candidates: RouteCandidate[];
  generationVersion: number;
  generationMode?: 'STATIC' | 'PERSONALIZED' | 'ENGINE';
  previousStatus: string;
}> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/candidates/regenerate`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export type CandidatesBundle = {
  candidates: RouteCandidate[];
  generationVersion: number;
  generationMode?: 'STATIC' | 'PERSONALIZED' | 'ENGINE';
  dimensions?: CompareDimensionDef[];
};

export type { CompareDimensionDef };

/** GET compare — 返回当前 DRAFT 候选（无则触发生成） */
export async function fetchCompareCandidates(
  token: string,
  scenarioId: string,
): Promise<CandidatesBundle> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/candidates/compare`, token);
}

/**
 * 对比页入口 — 按 candidatesStatus 自动选择 generate / regenerate / compare
 * @param detail 可选，已 fetch 的 scenario 详情以避免重复请求
 */
export async function ensureFreshCandidates(
  token: string,
  scenarioId: string,
  detail?: ExplorationScenarioDetail,
): Promise<CandidatesBundle & { action: 'generated' | 'regenerated' | 'reused' }> {
  const scenario = detail ?? (await fetchScenarioDetail(token, scenarioId));
  const status = scenario.candidatesStatus?.status;

  if (status === 'STALE') {
    const regen = await regenerateCandidates(token, scenarioId);
    return { ...regen, action: 'regenerated' };
  }

  if (status === 'READY' || status === 'SELECTED') {
    const bundle = await fetchCompareCandidates(token, scenarioId);
    return { ...bundle, action: 'reused' };
  }

  const created = await generateCandidates(token, scenarioId);
  return { ...created, action: 'generated' };
}

export async function fetchRouteDetail(
  token: string,
  scenarioId: string,
  routeId: string,
): Promise<ExplorationRouteDetailView> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/routes/${encodeURIComponent(routeId)}`, token);
}

export async function selectRoute(
  token: string,
  scenarioId: string,
  body: {
    routeId: string;
    selectionReason?: string;
    prioritizedGainIds?: string[];
    acceptedSacrificeIds?: string[];
  },
) {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/selections`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function runFeasibilityCheck(
  token: string,
  scenarioId: string,
  asyncMode = false,
): Promise<
  | { mode: 'sync'; job: CheckJobPollView['job']; issues: IssuesView }
  | { mode: 'async'; jobId: string; status: 'PENDING' }
> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/check`, token, {
    method: 'POST',
    body: JSON.stringify({ async: asyncMode }),
  });
}

/** 轮询可执行性检查任务（Sprint 5 — job 状态跨 Pod 持久化于 Redis） */
export async function pollCheckJob(token: string, jobId: string): Promise<CheckJobPollView> {
  return request(`${EXPLORATION}/check-jobs/${jobId}`, token);
}

/**
 * 等待 check job 完成。默认 2s 间隔、60s 超时。
 * 前端在 POST /check 返回 202 时使用。
 */
export async function waitForCheckJob(
  token: string,
  jobId: string,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<CheckJobPollView> {
  const intervalMs = options?.intervalMs ?? 2000;
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const view = await pollCheckJob(token, jobId);
    if (view.job.status === 'COMPLETED' || view.job.status === 'FAILED') {
      return view;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Check job ${jobId} timed out after ${timeoutMs}ms`);
}

export async function fetchIssues(token: string, scenarioId: string): Promise<IssuesView> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/issues`, token);
}

export async function fetchRepairOptions(
  token: string,
  scenarioId: string,
  issueId: string,
): Promise<{ problemId: string; options: RepairOption[] }> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/issues/${issueId}/options`, token);
}

export async function submitDecision(
  token: string,
  scenarioId: string,
  problemId: string,
  optionId: string,
  reason?: string,
) {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/decisions/${problemId}/submit`, token, {
    method: 'POST',
    body: JSON.stringify({ optionId, reason }),
  });
}

export async function applyDecision(
  token: string,
  scenarioId: string,
  problemId: string,
): Promise<ApplyDecisionView> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/decisions/${problemId}/apply`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchContinuePackages(
  token: string,
  scenarioId: string,
): Promise<ContinuePackagesView> {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/continue/packages`, token);
}

export async function submitPackageFeedback(
  token: string,
  scenarioId: string,
  body: {
    packageRankings: string[];
    valueScores: Record<string, number>;
    trustScores: Record<string, number>;
    acceptablePriceUsd?: { min?: number; max?: number; currency?: string };
    leastPreferredPackageId?: string;
  },
) {
  return request(`${EXPLORATION}/scenarios/${scenarioId}/continue/feedback`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function submitCommitment(
  token: string,
  sessionId: string,
  body: {
    commitmentType: 'NOTIFY_ME' | 'SELF_CHECK';
    email?: string;
    phone?: string;
  },
): Promise<CommitmentResult> {
  return request(`${RESEARCH}/sessions/${sessionId}/commitments`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function batchResearchEvents(
  token: string,
  sessionId: string,
  events: Array<{ eventName: string; payload: Record<string, unknown> }>,
) {
  return request(`${RESEARCH}/sessions/${sessionId}/events/batch`, token, {
    method: 'POST',
    body: JSON.stringify({ events }),
  });
}

/**
 * Sprint 4B — 支付 SKU 与法务文案
 * @remarks 当前 Consumer MVP 不接支付；需 `RESEARCH_PAYMENT_COMMITMENT_ENABLED=1` 且产品明确开启 4B
 */
export async function fetchPaymentCatalog(token: string): Promise<PaymentCatalogView> {
  return request(`${RESEARCH}/payments/catalog`, token);
}

export async function startResearchDeposit(
  token: string,
  sessionId: string,
): Promise<DepositPaymentView> {
  return request(`${RESEARCH}/sessions/${sessionId}/payments/deposit/start`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function confirmResearchDeposit(
  token: string,
  sessionId: string,
): Promise<DepositPaymentView> {
  return request(`${RESEARCH}/sessions/${sessionId}/payments/deposit/confirm`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function refundResearchDeposit(
  token: string,
  sessionId: string,
): Promise<{ paymentRecordId: string; status: string; refundedAt?: string; message: string }> {
  return request(`${RESEARCH}/sessions/${sessionId}/payments/deposit/refund`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getResearchDepositStatus(
  token: string,
  sessionId: string,
): Promise<DepositPaymentView | { status: 'NOT_STARTED' }> {
  return request(`${RESEARCH}/sessions/${sessionId}/payments/deposit/status`, token);
}

export async function submitPriceLock(
  token: string,
  sessionId: string,
  body: { lockedPriceUsd: number; email?: string; phone?: string },
): Promise<PriceLockResult> {
  return request(`${RESEARCH}/sessions/${sessionId}/price-lock`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const FLOW_KEY = 'tripnara.exploration.flow';

export function persistFlowState(state: ExplorationFlowState) {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(FLOW_KEY, JSON.stringify(state));
  }
}

export function readFlowState(): ExplorationFlowState | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(FLOW_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExplorationFlowState;
  } catch {
    return null;
  }
}

export function clearFlowState() {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(FLOW_KEY);
}
