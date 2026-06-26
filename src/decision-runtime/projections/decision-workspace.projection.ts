import { Gate1TravelEventType } from '../types/runtime-event-catalog';

/** Minimal travel event row for projection replay. */
export interface TravelEventRecord {
  id: string;
  tripId: string;
  eventType: string;
  source: string;
  occurredAt: Date | string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}

export interface ProjectedDecision {
  decisionId: string;
  materialChange: boolean;
  selectedCandidateId: string | null;
  occurredAt: string;
}

export interface ProjectedConflictReport {
  reportId: string;
  version: number;
  findingCount: number;
  occurredAt: string;
}

export interface ProjectedCandidate {
  candidateId: string;
  version: number;
  label: string;
  sourceType: string;
  occurredAt: string;
}

export interface ProjectedPlanB {
  planBId: string;
  label: string;
  occurredAt: string;
}

export interface ProjectedOutcome {
  outcomeId: string;
  valueRating: number | null;
  occurredAt: string;
}

export interface ProjectedReadinessBlocker {
  findingId: string;
  reportId: string;
  reportVersion: number;
  dimension: string;
  status: string;
  title: string;
  occurredAt: string;
}

/** Shadow read model rebuilt from Gate1 runtime events only. */
export interface DecisionWorkspaceProjection {
  tripId: string;
  gate1ProjectId: string | null;
  generatedAt: string;
  sourceEventCount: number;
  decisions: ProjectedDecision[];
  conflictReports: ProjectedConflictReport[];
  candidates: ProjectedCandidate[];
  planBs: ProjectedPlanB[];
  outcomes: ProjectedOutcome[];
  readinessBlockers: ProjectedReadinessBlocker[];
}

function runtimeMeta(event: TravelEventRecord): Record<string, unknown> | undefined {
  const meta = event.metadata;
  if (!meta || typeof meta !== 'object') return undefined;
  const runtime = (meta as Record<string, unknown>).runtime;
  return runtime && typeof runtime === 'object'
    ? (runtime as Record<string, unknown>)
    : undefined;
}

function gate1ProjectIdFromEvent(event: TravelEventRecord): string | null {
  const payloadId = event.payload.gate1ProjectId;
  if (typeof payloadId === 'string') return payloadId;
  const runtime = runtimeMeta(event);
  const runtimeId = runtime?.gate1ProjectId;
  return typeof runtimeId === 'string' ? runtimeId : null;
}

function occurredIso(event: TravelEventRecord): string {
  const d = event.occurredAt instanceof Date ? event.occurredAt : new Date(event.occurredAt);
  return d.toISOString();
}

function aggregateId(event: TravelEventRecord, payloadKey: string): string | null {
  const runtime = runtimeMeta(event);
  const fromRuntime = runtime?.aggregateId;
  if (typeof fromRuntime === 'string') return fromRuntime;
  const fromPayload = event.payload[payloadKey];
  return typeof fromPayload === 'string' ? fromPayload : null;
}

/**
 * Fold Gate1 runtime travel events into a decision_workspace projection.
 * Idempotent: last event wins per aggregate id for mutable views.
 */
export function projectDecisionWorkspaceFromEvents(
  events: TravelEventRecord[],
  tripId: string,
): DecisionWorkspaceProjection {
  const gate1Events = events
    .filter(
      (e) =>
        e.tripId === tripId &&
        (e.source === 'gate1.runtime' || e.eventType.startsWith('gate1.')),
    )
    .sort((a, b) => {
      const ta = new Date(a.occurredAt).getTime();
      const tb = new Date(b.occurredAt).getTime();
      return ta - tb;
    });

  const decisions = new Map<string, ProjectedDecision>();
  const conflictReports = new Map<string, ProjectedConflictReport>();
  const candidates = new Map<string, ProjectedCandidate>();
  const planBs = new Map<string, ProjectedPlanB>();
  const outcomes = new Map<string, ProjectedOutcome>();
  const readinessBlockers = new Map<string, ProjectedReadinessBlocker>();

  let gate1ProjectId: string | null = null;

  for (const event of gate1Events) {
    gate1ProjectId = gate1ProjectIdFromEvent(event) ?? gate1ProjectId;
    const at = occurredIso(event);

    switch (event.eventType) {
      case Gate1TravelEventType.DECISION_RECORDED: {
        const id = aggregateId(event, 'decisionId');
        if (!id) break;
        decisions.set(id, {
          decisionId: id,
          materialChange: event.payload.materialChange === true,
          selectedCandidateId:
            typeof event.payload.selectedCandidateId === 'string'
              ? event.payload.selectedCandidateId
              : null,
          occurredAt: at,
        });
        break;
      }
      case Gate1TravelEventType.CONFLICT_DETECTED: {
        const id = aggregateId(event, 'reportId');
        if (!id) break;
        const version =
          typeof event.payload.version === 'number' ? event.payload.version : 0;
        conflictReports.set(`${id}:v${version}`, {
          reportId: id,
          version,
          findingCount:
            typeof event.payload.findingCount === 'number'
              ? event.payload.findingCount
              : 0,
          occurredAt: at,
        });
        break;
      }
      case Gate1TravelEventType.CANDIDATE_STRATEGY_CREATED: {
        const id = aggregateId(event, 'candidateId');
        if (!id) break;
        candidates.set(id, {
          candidateId: id,
          version:
            typeof event.payload.version === 'number' ? event.payload.version : 1,
          label: typeof event.payload.label === 'string' ? event.payload.label : '',
          sourceType:
            typeof event.payload.sourceType === 'string'
              ? event.payload.sourceType
              : 'UNKNOWN',
          occurredAt: at,
        });
        break;
      }
      case Gate1TravelEventType.CONTINGENCY_PLAN_CREATED: {
        const id = aggregateId(event, 'planBId');
        if (!id) break;
        planBs.set(id, {
          planBId: id,
          label: typeof event.payload.label === 'string' ? event.payload.label : '',
          occurredAt: at,
        });
        break;
      }
      case Gate1TravelEventType.OUTCOME_RECORDED: {
        const id = aggregateId(event, 'outcomeId');
        if (!id) break;
        outcomes.set(id, {
          outcomeId: id,
          valueRating:
            typeof event.payload.valueRating === 'number'
              ? event.payload.valueRating
              : null,
          occurredAt: at,
        });
        break;
      }
      case Gate1TravelEventType.READINESS_BLOCKER_RAISED: {
        const id = aggregateId(event, 'findingId');
        if (!id) break;
        readinessBlockers.set(id, {
          findingId: id,
          reportId:
            typeof event.payload.reportId === 'string' ? event.payload.reportId : '',
          reportVersion:
            typeof event.payload.reportVersion === 'number'
              ? event.payload.reportVersion
              : 0,
          dimension:
            typeof event.payload.dimension === 'string' ? event.payload.dimension : '',
          status:
            typeof event.payload.status === 'string' ? event.payload.status : 'RED',
          title: typeof event.payload.title === 'string' ? event.payload.title : '',
          occurredAt: at,
        });
        break;
      }
      case Gate1TravelEventType.READINESS_BLOCKER_RESOLVED: {
        const id = aggregateId(event, 'findingId');
        if (id) readinessBlockers.delete(id);
        break;
      }
      default:
        break;
    }
  }

  return {
    tripId,
    gate1ProjectId,
    generatedAt: new Date().toISOString(),
    sourceEventCount: gate1Events.length,
    decisions: [...decisions.values()],
    conflictReports: [...conflictReports.values()],
    candidates: [...candidates.values()],
    planBs: [...planBs.values()],
    outcomes: [...outcomes.values()],
    readinessBlockers: [...readinessBlockers.values()],
  };
}

export interface EntityReconciliation {
  entity: string;
  gate1Count: number;
  eventCount: number;
  missingInEvents: string[];
  extraInEvents: string[];
  matched: boolean;
}

export interface DecisionWorkspaceReconciliation {
  projectId: string;
  tripId: string;
  projectTitle: string;
  linked: boolean;
  projection: DecisionWorkspaceProjection;
  entities: EntityReconciliation[];
  allMatched: boolean;
  skippedReason?: string;
}

function reconcileIds(
  entity: string,
  gate1Ids: string[],
  eventIds: string[],
): EntityReconciliation {
  const gate1Set = new Set(gate1Ids);
  const eventSet = new Set(eventIds);
  const missingInEvents = gate1Ids.filter((id) => !eventSet.has(id));
  const extraInEvents = eventIds.filter((id) => !gate1Set.has(id));
  return {
    entity,
    gate1Count: gate1Ids.length,
    eventCount: eventIds.length,
    missingInEvents,
    extraInEvents,
    matched: missingInEvents.length === 0 && extraInEvents.length === 0,
  };
}

/** Compare Gate1 table snapshot vs event-store projection. */
export function reconcileDecisionWorkspace(input: {
  projectId: string;
  tripId: string;
  projectTitle: string;
  projection: DecisionWorkspaceProjection;
  gate1DecisionIds: string[];
  gate1PublishedConflictKeys: string[];
  gate1PublishedCandidateIds: string[];
  gate1PublishedPlanBIds: string[];
  gate1OutcomeIds: string[];
  gate1RedFindingIds: string[];
}): DecisionWorkspaceReconciliation {
  const eventConflictKeys = input.projection.conflictReports.map(
    (r) => `${r.reportId}:v${r.version}`,
  );

  const entities: EntityReconciliation[] = [
    reconcileIds('decisions', input.gate1DecisionIds, input.projection.decisions.map((d) => d.decisionId)),
    reconcileIds(
      'conflict_reports_published',
      input.gate1PublishedConflictKeys,
      eventConflictKeys,
    ),
    reconcileIds(
      'candidates_published',
      input.gate1PublishedCandidateIds,
      input.projection.candidates.map((c) => c.candidateId),
    ),
    reconcileIds(
      'plan_b_published',
      input.gate1PublishedPlanBIds,
      input.projection.planBs.map((p) => p.planBId),
    ),
    reconcileIds('outcomes', input.gate1OutcomeIds, input.projection.outcomes.map((o) => o.outcomeId)),
    reconcileIds(
      'readiness_blockers_red',
      input.gate1RedFindingIds,
      input.projection.readinessBlockers.map((b) => b.findingId),
    ),
  ];

  return {
    projectId: input.projectId,
    tripId: input.tripId,
    projectTitle: input.projectTitle,
    linked: true,
    projection: input.projection,
    entities,
    allMatched: entities.every((e) => e.matched),
  };
}
