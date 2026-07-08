import type { FeasibilityIssueDto, TripFeasibilityReportDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type {
  DecisionOutcomeValidation,
  DecisionProblemDetail,
  DecisionRecord,
} from '../types/decision-semantics.types';
import { adaptFeasibilityIssueToProblem } from '../normalizers/from-feasibility-issue.adapter';
import { adaptGateViolationToProblem } from '../normalizers/from-gate-violation.adapter';
import { DecisionSemanticsService } from '../services/decision-semantics.service';
import { DecisionRepairExecutorService } from '../services/decision-repair-executor.service';
import type { CollectedDecisionProblems } from '../collectors/decision-problem.collector';
import type { DecisionProblemResolution } from '../types/decision-semantics.types';
import { applyProblemResolutions } from '../read/apply-problem-resolution.util';

const TRIP_ID = 'trip-decision-center-e2e';
const TRIP_VERSION = 'rev-e2e-1';
const DETECTED_AT = '2026-06-30T08:00:00Z';
const USER_ID = 'user-e2e-owner';

function stubFeasibilityReport(issues: FeasibilityIssueDto[]): TripFeasibilityReportDto {
  return {
    tripId: TRIP_ID,
    tripTitle: 'Decision Center E2E',
    verdict: { status: 'NOT_EXECUTABLE', headline: '不可执行' },
    overallScore: 50,
    currentTripVersion: TRIP_VERSION,
    isStale: false,
    canStartExecute: false,
    gateExecute: { blocked: issues.length > 0, reasons: [] },
    dimensions: [],
    dayTimeline: [],
    issues,
    alternatives: [],
    summary: {
      mustHandle: issues.filter((i) => i.priority === 'must_handle').length,
      suggestAdjust: issues.filter((i) => i.priority === 'suggest_adjust').length,
      pendingConfirm: 0,
      blockers: 0,
    },
  };
}

function feasibilityIssue(
  partial: Partial<FeasibilityIssueDto> & Pick<FeasibilityIssueDto, 'id' | 'message'>,
): FeasibilityIssueDto {
  return {
    priority: 'must_handle',
    category: 'transport',
    title: partial.message.slice(0, 60),
    affectedDays: [2],
    severity: 'high',
    ...partial,
    message: partial.message,
    id: partial.id,
  };
}

export function buildRoadClosureCollected(): CollectedDecisionProblems {
  const issue = feasibilityIssue({
    id: 'issue-road-closure-d2',
    message: 'F-road 关闭导致 Day 2 不可达',
    issueKind: 'visitor_access',
    category: 'route',
    repairOptions: [
      {
        id: 'bypass_via_ring',
        label: '改走 1 号公路绕行',
        description: '避开关闭路段，增加 45 分钟',
        impactSummary: 'medium',
        actionType: 'change_route',
      },
    ],
    proofs: [
      {
        entity: 'F208',
        constraint: 'road_closure',
        currentFact: 'closed',
        evidenceSource: 'road_feed',
        evidenceType: 'official_closure',
        conclusion: '官方关闭',
      },
    ],
  });

  const { problem, assertion } = adaptFeasibilityIssueToProblem(
    issue,
    TRIP_ID,
    TRIP_VERSION,
    DETECTED_AT,
  );
  const detail: DecisionProblemDetail = { ...problem, assertions: [assertion] };

  const issueByProblemId = new Map<string, FeasibilityIssueDto>();
  issueByProblemId.set(problem.id, issue);
  issueByProblemId.set(issue.id, issue);

  return {
    tripVersion: TRIP_VERSION,
    detectedAt: DETECTED_AT,
    feasibilityIssues: [issue],
    items: [detail],
    issueByProblemId,
    feasibilityReport: stubFeasibilityReport([issue]),
  };
}

export function buildDailyDriveCollected(): CollectedDecisionProblems {
  const issue = feasibilityIssue({
    id: 'issue-daily-drive-d3',
    message: 'Day 3 累计驾驶超过上限',
    issueKind: 'daily_drive',
    affectedDays: [3],
    anchors: { shortfallMinutes: 90, travelMinutes: 492 },
    repairOptions: [
      {
        id: 'insert_rest',
        label: '插入缓冲日',
        description: '拆分长途驾驶',
        impactSummary: 'high',
        actionType: 'insert_rest_day',
      },
      {
        id: 'drop_poi',
        label: '移除远端 POI',
        description: '从 Day 3 移除较远景点，预计可缩短约 95 分钟驾驶。',
        impactSummary: '-95 分钟',
        actionType: 'remove_poi',
        payload: {
          itemId: 'item-far-poi',
          itemLabel: '远端 POI',
          dayNumber: 3,
          savedMinutes: 95,
          validateScope: { type: 'issue', issueId: 'issue-daily-drive-d3' },
        },
      },
    ],
  });

  const { problem, assertion } = adaptFeasibilityIssueToProblem(
    issue,
    TRIP_ID,
    TRIP_VERSION,
    DETECTED_AT,
  );
  const detail: DecisionProblemDetail = { ...problem, assertions: [assertion] };

  const issueByProblemId = new Map<string, FeasibilityIssueDto>();
  issueByProblemId.set(problem.id, issue);
  issueByProblemId.set(issue.id, issue);

  return {
    tripVersion: TRIP_VERSION,
    detectedAt: DETECTED_AT,
    feasibilityIssues: [issue],
    items: [detail],
    issueByProblemId,
    feasibilityReport: stubFeasibilityReport([issue]),
  };
}

export function buildBudgetCollected(): CollectedDecisionProblems {
  const issue = feasibilityIssue({
    id: 'issue-budget-over',
    message: '行程预算超出上限 1200 ISK',
    issueKind: 'budget',
    category: 'budget',
    priority: 'suggest_adjust',
    severity: 'medium',
    anchors: { shortfallMinutes: 0 },
    repairOptions: [
      {
        id: 'increase_budget',
        label: '提高预算上限',
        description: '由行程负责人确认',
        impactSummary: 'low',
        actionType: 'increase_budget',
      },
    ],
  });

  const { problem, assertion } = adaptFeasibilityIssueToProblem(
    issue,
    TRIP_ID,
    TRIP_VERSION,
    DETECTED_AT,
  );
  const detail: DecisionProblemDetail = { ...problem, assertions: [assertion] };

  const issueByProblemId = new Map<string, FeasibilityIssueDto>();
  issueByProblemId.set(problem.id, issue);
  issueByProblemId.set(issue.id, issue);

  return {
    tripVersion: TRIP_VERSION,
    detectedAt: DETECTED_AT,
    feasibilityIssues: [issue],
    items: [detail],
    issueByProblemId,
    feasibilityReport: stubFeasibilityReport([issue]),
  };
}

export function buildSafetyGateCollected(): CollectedDecisionProblems {
  const { problem, assertion } = adaptGateViolationToProblem(
    {
      type: 'SAFETY',
      severity: 'HARD',
      detail: '高地 F-road 安全硬约束：禁止通行',
      constraint: 'highlands_safety_v1',
    },
    0,
    TRIP_ID,
    TRIP_VERSION,
    DETECTED_AT,
  );
  const detail: DecisionProblemDetail = { ...problem, assertions: [assertion] };

  return {
    tripVersion: TRIP_VERSION,
    detectedAt: DETECTED_AT,
    feasibilityIssues: [],
    items: [detail],
    issueByProblemId: new Map(),
    feasibilityReport: stubFeasibilityReport([]),
  };
}

export function buildGateReachabilityCollected(): CollectedDecisionProblems {
  const { problem, assertion } = adaptGateViolationToProblem(
    {
      type: 'REACHABILITY',
      severity: 'HARD',
      detail: '路段不可达：官方封路',
      constraint: 'road_closure_f208',
    },
    0,
    TRIP_ID,
    TRIP_VERSION,
    DETECTED_AT,
  );
  const detail: DecisionProblemDetail = { ...problem, assertions: [assertion] };

  return {
    tripVersion: TRIP_VERSION,
    detectedAt: DETECTED_AT,
    feasibilityIssues: [],
    items: [detail],
    issueByProblemId: new Map(),
    feasibilityReport: stubFeasibilityReport([]),
  };
}

/** Gate problem + related feasibility issue for bridge applyRepair tests */
export function buildGateReachabilityWithBridgeCollected(): CollectedDecisionProblems {
  const gate = buildGateReachabilityCollected();
  const road = buildRoadClosureCollected();
  return {
    ...gate,
    feasibilityIssues: road.feasibilityIssues,
    issueByProblemId: road.issueByProblemId,
    feasibilityReport: road.feasibilityReport,
  };
}

export interface DecisionCenterHarness {
  service: DecisionSemanticsService;
  records: DecisionRecord[];
  ledgerNodeIndex: Record<string, string>;
  setCollected: (collected: CollectedDecisionProblems) => void;
  /** Harness eval counters — DS-BLOCKER-IDEMPOTENCY-001 */
  counters: {
    applyRepairCalls: number;
    validateCalls: number;
    resolveTripVersionCalls: number;
  };
}

export interface DecisionCenterHarnessOptions {
  /** After applyRepair succeeds, post-apply validate throws ROUTE_RECALC_FAILED */
  postApplyValidateFails?: boolean;
  /** When validate fails, rollbackLastRepair returns ok (Path A) */
  rollbackOnValidateFail?: boolean;
  /** Supporting proofs use expired observedAt — blocks auto-repair (DATA_STALE) */
  staleRepairEvidence?: boolean;
}

export function createDecisionCenterHarness(
  initialCollected: CollectedDecisionProblems,
  options: DecisionCenterHarnessOptions = {},
): DecisionCenterHarness {
  let collected = initialCollected;
  if (options.staleRepairEvidence) {
    const staleObservedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    collected = {
      ...collected,
      items: collected.items.map((item) => ({
        ...item,
        assertions: item.assertions.map((a) => ({
          ...a,
          proofs: a.proofs.map((p) => ({
            ...p,
            observedAt: staleObservedAt,
          })),
        })),
      })),
    };
  }
  const records: DecisionRecord[] = [];
  const resolvedProblems: DecisionProblemResolution[] = [];
  const ledgerNodeIndex: Record<string, string> = {};
  const counters = { applyRepairCalls: 0, validateCalls: 0, resolveTripVersionCalls: 0 };

  const collector = {
    collect: jest.fn(async () => {
      const { items } = applyProblemResolutions(collected.items, resolvedProblems);
      return { ...collected, items };
    }),
    resolveTripVersion: jest.fn(async () => {
      counters.resolveTripVersionCalls += 1;
      return `${TRIP_VERSION}-after`;
    }),
  };

  const feasibility = {
    getReport: jest.fn(async () => ({
      tripId: TRIP_ID,
      verdict: { status: 'NEEDS_ATTENTION', headline: '需处理' },
      overallScore: 72,
      canStartExecute: false,
      currentTripVersion: TRIP_VERSION,
      issues: collected.feasibilityIssues ?? [],
    })),
    getRepairOptions: jest.fn(async (_tripId: string, issueId: string) => {
      const issue = collected.issueByProblemId.get(issueId);
      const options =
        issue?.repairOptions?.map((r) => ({
          id: r.id,
          title: r.label,
          description: r.description,
          impact: (['high', 'medium', 'low'].includes(String(r.impactSummary))
            ? r.impactSummary
            : 'medium') as 'high' | 'medium' | 'low',
          actionType: r.actionType ?? r.type,
        })) ?? [];
      return { options };
    }),
    previewRepair: jest.fn(async () => ({
      tripId: TRIP_ID,
      previewId: 'preview-1',
      changes: [{ type: 'route_change' }],
    })),
    applyRepair: jest.fn(async () => {
      counters.applyRepairCalls += 1;
      return {
        tripId: TRIP_ID,
        status: 'applied',
        message: 'repair applied',
        actionType: 'change_route',
        persisted: true,
        persistence: {
          applied: true,
          createdItemIds: ['item-new-route'],
          updatedItemIds: ['item-day2-leg'],
          removedItemIds: [],
          skippedLockedItemIds: [],
        },
      };
    }),
    validate: jest.fn(async () => {
      counters.validateCalls += 1;
      if (options.postApplyValidateFails) {
        throw new Error('ROUTE_RECALC_FAILED: route recalculation failed after itinerary persist');
      }
      return { tripId: TRIP_ID, verdict: { status: 'OK' } };
    }),
    rollbackLastRepair: jest.fn(async () => ({
      ok: options.postApplyValidateFails === true && options.rollbackOnValidateFail === true,
    })),
  };

  const repairExecutor = new DecisionRepairExecutorService(feasibility as any);

  const recordStore = {
    buildRecord: jest.fn((input: Omit<DecisionRecord, 'id' | 'decidedAt' | 'validationStatus'>) => ({
      ...input,
      id: `dec_${records.length + 1}`,
      decidedAt: new Date().toISOString(),
      validationStatus: 'PENDING' as const,
      rejectedOptionIds: input.rejectedOptionIds ?? [],
      decidedBy: input.decidedBy ?? [{ role: 'TRIP_OWNER' as const, userId: USER_ID }],
    })),
    appendRecord: jest.fn(async (_tripId: string, record: DecisionRecord, opts?: { ledgerCausality?: Record<string, string> }) => {
      records.push(record);
      Object.assign(ledgerNodeIndex, opts?.ledgerCausality ?? {});
      return record;
    }),
    getRecord: jest.fn(async (_tripId: string, decisionId: string) =>
      records.find((r) => r.id === decisionId),
    ),
    resolveDecisionForLedgerNode: jest.fn(async (_tripId: string, nodeId: string) => {
      const decisionId = ledgerNodeIndex[nodeId];
      if (!decisionId) return undefined;
      return { decisionId, record: records.find((r) => r.id === decisionId) };
    }),
    listRecords: jest.fn(async () => records),
    findEffectiveByIdempotencyKey: jest.fn(async (_tripId: string, idempotencyKey: string) => {
      const key = idempotencyKey.trim();
      for (let i = records.length - 1; i >= 0; i -= 1) {
        const r = records[i];
        if (r.idempotencyKey !== key) continue;
        if (r.recordKind === 'IDEMPOTENT_REPLAY_AUDIT') continue;
        if (r.status === 'SUPERSEDED') continue;
        return r;
      }
      return undefined;
    }),
    listProblemResolutions: jest.fn(async () => resolvedProblems),
    markProblemResolved: jest.fn(async (_tripId: string, resolution: DecisionProblemResolution) => {
      const without = resolvedProblems.filter(
        (r) => r.semanticKey !== resolution.semanticKey && r.problemId !== resolution.problemId,
      );
      resolvedProblems.length = 0;
      resolvedProblems.push(...without, resolution);
      return resolution;
    }),
    removeProblemResolutionsBySemanticKeys: jest.fn(async (_tripId: string, keys: string[]) => {
      const keySet = new Set(keys);
      for (let i = resolvedProblems.length - 1; i >= 0; i -= 1) {
        if (keySet.has(resolvedProblems[i].semanticKey)) {
          resolvedProblems.splice(i, 1);
        }
      }
    }),
  };

  const outcomeValidation = {
    capturePostDecisionBaseline: jest.fn(async () => ({
      validationBaseline: {
        capturedAt: new Date().toISOString(),
        feasibilityMustHandle: 0,
        feasibilityVerdict: 'OK',
        problemOpen: false,
      },
    })),
    validateDecision: jest.fn(
      async (_tripId: string, decisionId: string): Promise<DecisionOutcomeValidation> => ({
        id: `val_${decisionId}`,
        decisionId,
        tripId: TRIP_ID,
        expectedOutcomes: [],
        observedOutcomes: [],
        verdict: 'CONFIRMED',
        evaluatedAt: new Date().toISOString(),
        confidence: 0.85,
      }),
    ),
  };

  const ledgerBridge = {
    loadLedgerContext: jest.fn(async () => ({ snapshotVersion: 1, nodeIds: ['node-src-1'] })),
    captureLedgerRefs: jest.fn(async ({ decisionId }: { decisionId: string }) => ({
      sourceNodeIds: ['node-src-1'],
      recomputedNodeIds: ['node-recompute-1'],
      causedByAnnotatedNodeIds: ['node-recompute-1'],
      ledgerSnapshotVersion: 1,
      ledgerRunId: `run_${decisionId}`,
    })),
    persistDecisionCausality: jest.fn(async (_tripId: string, _decisionId: string, refs: unknown) => refs),
    resolveDecisionForLedgerNode: jest.fn(async (_tripId: string, nodeId: string) => ledgerNodeIndex[nodeId]),
  };

  const service = new DecisionSemanticsService(
    { get: jest.fn() } as any,
    collector as any,
    feasibility as any,
    recordStore as any,
    repairExecutor as any,
    outcomeValidation as any,
    ledgerBridge as any,
  );

  return {
    service,
    records,
    ledgerNodeIndex,
    setCollected: (next) => {
      collected = next;
    },
    counters,
  };
}

export { TRIP_ID, USER_ID };
