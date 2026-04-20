import type {
  AbuExpected,
  DrDreExpected,
  E2ECase,
  E2EReplayResult,
  NeptuneExpected,
} from './e2e-case.types';

function buildMinimalCgusDsoSnapshotFromFixture(input: {
  caseId: string;
  countryCode: string;
  season: number;
  planDays?: number;
  routeDirectionId?: string;
  abuAction: 'ALLOW' | 'REJECT';
}) {
  const days = Math.max(1, input.planDays ?? 3);
  const itemsPerDay = 2;
  const mkTime = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const itinerary = {
    days: Array.from({ length: days }).map((_, dayIdx) => ({
      items: Array.from({ length: itemsPerDay }).map((__, itemIdx) => {
        const startH = 9 + itemIdx * 2;
        return {
          id: `golden-item-${dayIdx}-${itemIdx}`,
          type: 'poi',
          start_window: { start: mkTime(startH, 0), end: mkTime(startH, 30) },
          end_window: { start: mkTime(startH + 1, 0), end: mkTime(startH + 1, 30) },
          location_ref: {
            place_id: `golden-poi-${dayIdx}-${itemIdx}`,
            name: `POI ${dayIdx}-${itemIdx}`,
            coordinates: { lat: 64.0 + dayIdx * 0.01, lng: -21.0 - itemIdx * 0.01 },
          },
          metadata: {
            distance_meters: 5000 + dayIdx * 1000 + itemIdx * 500,
            travel_duration_min_from_prev: 25 + itemIdx * 10,
          },
        };
      }),
    })),
  };

  const hardViolations =
    input.abuAction === 'REJECT'
      ? [{ type: 'DEM_VIOLATION', severity: 'HARD', degree: 1, detail: 'golden:abu_reject' }]
      : [];

  return {
    requestId: `e2e-${input.caseId}`,
    systemState: { requestId: `e2e-${input.caseId}` },
    environmentState: {
      month: input.season,
      countryCode: input.countryCode,
      routeDirectionId: input.routeDirectionId ?? `golden-rd-${input.caseId}`,
    },
    tripState: { planDraft: itinerary },
    constraints: { violations: hardViolations },
  };
}

function deriveAbuExpected(result: E2EReplayResult): AbuExpected {
  const abuLogs = result.actual.logs.filter(
    (log) => log.persona === 'ABU' && log.decisionStage === 'ABU_GATE',
  );
  const last = abuLogs[abuLogs.length - 1];
  return {
    action: (last?.action as 'ALLOW' | 'REJECT') ?? (result.actual.finalPlan?.allowed ? 'ALLOW' : 'REJECT'),
    reasonCodes: last?.reasonCodes,
  };
}

function deriveDrDreExpected(result: E2EReplayResult): DrDreExpected | undefined {
  const drdreLogs = result.actual.logs.filter(
    (log) => log.persona === 'DR_DRE' && log.decisionStage === 'PACE_ADJUST',
  );
  if (drdreLogs.length === 0) {
    return {
      mustAdjust: false,
    };
  }
  return {
    mustAdjust: true,
    adjustmentTypes: drdreLogs.flatMap((log) => log.reasonCodes) as Array<
      'SPLIT_DAY' | 'BUFFER_DAY' | 'ADJUST_PACE'
    >,
  };
}

function deriveNeptuneExpected(result: E2EReplayResult): NeptuneExpected | undefined {
  const neptuneLogs = result.actual.logs.filter(
    (log) => log.persona === 'NEPTUNE' && log.decisionStage === 'SPATIAL_REPAIR',
  );
  if (neptuneLogs.length === 0) {
    return {
      mustRepair: false,
    };
  }
  return {
    mustRepair: true,
    replacementTypes: neptuneLogs.flatMap((log) => log.reasonCodes) as Array<
      'ENTRY' | 'POI' | 'SEGMENT'
    >,
  };
}

export function captureReplayAsGoldenFixture(input: {
  fixtureId: string;
  fixtureName: string;
  fixtureDescription: string;
  source: string;
  replayResult: E2EReplayResult;
}): E2ECase {
  const result = input.replayResult;
  const traceSummary = result.actual.traceSummary;
  const stageSequence = result.actual.logs.map((log) => log.decisionStage);
  const abuExpected = deriveAbuExpected(result);
  const capturedSnapshot = (result.actual as any)?.decisionRunLog?.cgusDsoSnapshot;
  const capturedSnapshotNote = (result.actual as any)?.decisionRunLog?.cgusDsoSnapshotNote;

  return {
    id: input.fixtureId,
    name: input.fixtureName,
    description: input.fixtureDescription,
    input: result.case.input,
    expected: {
      routeDirectionId: result.actual.routeDirectionId,
      routeDirectionTags: result.case.expected.routeDirectionTags,
      abuExpected,
      drdreExpected: deriveDrDreExpected(result),
      neptuneExpected: deriveNeptuneExpected(result),
      finalState: {
        allowed: result.actual.finalPlan?.allowed ?? result.passed,
        planDays: result.actual.finalPlan?.days,
      },
      traceSummary,
      scientificExpected: traceSummary
        ? {
            optimization: {
              mustEmitTrace: true,
              minCandidateSearchIterations: traceSummary.candidateSearchAudit?.iterations?.length,
              minFinalFeasibleCount: traceSummary.candidateSearchAudit?.finalFeasibleCount,
              allowedStopReasons: traceSummary.candidateSearchAudit?.stopReason
                ? [traceSummary.candidateSearchAudit.stopReason]
                : undefined,
            },
          }
        : undefined,
      timelineExpected: {
        requiredStages: [...new Set(stageSequence)],
        orderedStages: [...new Set(stageSequence)],
      },
    },
    metadata: {
      tags: ['golden', result.case.input.countryCode.toLowerCase()],
      priority: result.case.metadata?.priority,
      source: input.source,
      description: `Captured from replay result ${result.case.id}`,
      fixtureKind: 'golden',
      cgusDsoSnapshot:
        capturedSnapshot ??
        buildMinimalCgusDsoSnapshotFromFixture({
          caseId: result.case.id,
          countryCode: result.case.input.countryCode,
          season: result.case.input.season,
          planDays: result.actual.finalPlan?.days,
          routeDirectionId: result.actual.routeDirectionId,
          abuAction: abuExpected.action,
        }),
      cgusDsoSnapshotNote:
        capturedSnapshotNote ??
        'derived minimal DecisionState-like snapshot (env + planDraft + injected violations) for CGUS offline replay; not a full engine DSO dump',
    },
  };
}

export function serializeGoldenFixtureJson(fixture: E2ECase): string {
  return `${JSON.stringify(fixture, null, 2)}\n`;
}
