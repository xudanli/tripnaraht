import { buildIcelandPlanningContextFixture } from '../../fixtures/contexts/iceland-planning.fixture';
import { assertContextAssembly001 } from '../../context-assembly/context-assembly.util';
import {
  assertProjectionConsistency001,
  assertProjectionConsistency002,
  assertAllProjectionsShareRevision,
} from '../../projections/projection-consistency.util';
import { TravelContextProjectionResolverService } from '../../../../travel-context/projections/travel-context-projection-resolver.service';
import { buildThreePersonaTraces, assertAgentGroundingCross001 } from '../../agents/agent-grounding.util';
import {
  assertIntentTransition001,
  assertIntentTransition002,
  assertIntentTransition003,
  simulateIntentTransition,
} from '../../intents/intent-transition.util';
import {
  assertReplanRoadClosure001,
  simulateRoadClosureReplanning,
} from '../../replanning/replanning.util';
import { buildIcelandRoadClosureReadyFixture } from '../../fixtures/contexts/iceland-road-closure-ready.fixture';
import { runTravelContextHarnessCase, harnessAssert } from '../../../protocol/run-travel-context-harness.util';
import { mapExplorationScenarioToTravelContext } from '../../../../travel-context/snapshot/adapters/exploration-context.adapter';
import { assertExplorationProjectionConsistency } from '../../../../travel-context/projections/exploration-projection-consistency.util';

export interface TravelContextRegressionCaseResult {
  caseId: string;
  pass: boolean;
  errors: string[];
}

export interface TravelContextRegressionGateResult {
  pass: boolean;
  caseCount: number;
  passedCount: number;
  cases: TravelContextRegressionCaseResult[];
  errors: string[];
}

async function runCase(
  caseId: string,
  execute: () => Promise<{ pass: boolean; errors: string[] }>,
): Promise<TravelContextRegressionCaseResult> {
  try {
    return { caseId, ...(await execute()) };
  } catch (e) {
    return {
      caseId,
      pass: false,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }
}

/** H-P3 — bundled Travel Context harness cases for release regression gate. */
export async function runTravelContextRegressionGate(): Promise<TravelContextRegressionGateResult> {
  const snapshot = buildIcelandPlanningContextFixture();
  const replanSnapshot = buildIcelandRoadClosureReadyFixture();

  const cases: TravelContextRegressionCaseResult[] = [];

  cases.push(
    await runCase('PROJECTION-CONSISTENCY-001', async () => {
      const result = await runTravelContextHarnessCase({
        caseId: 'PROJECTION-CONSISTENCY-001',
        snapshot,
        run: async () => assertProjectionConsistency001(snapshot),
      });
      return { pass: result.pass, errors: result.errors };
    }),
  );

  cases.push(
    await runCase('PROJECTION-CONSISTENCY-002', async () => {
      const result = await runTravelContextHarnessCase({
        caseId: 'PROJECTION-CONSISTENCY-002',
        snapshot,
        run: async () => assertProjectionConsistency002(snapshot),
      });
      return { pass: result.pass, errors: result.errors };
    }),
  );

  cases.push(
    await runCase('PROJECTION-CONSISTENCY-003', async () => {
      const resolver = new TravelContextProjectionResolverService();
      const views = (['overview', 'plan', 'decisions', 'monitoring'] as const).map((view) =>
        resolver.resolve(snapshot, view),
      );
      const result = await runTravelContextHarnessCase({
        caseId: 'PROJECTION-CONSISTENCY-003',
        snapshot,
        run: async () =>
          assertAllProjectionsShareRevision(
            views.map((v) => ({ revision: v.revision, view: v.view })),
          ),
      });
      return { pass: result.pass, errors: result.errors };
    }),
  );

  cases.push(
    await runCase('CONTEXT-ASSEMBLY-001', async () => {
      const result = await runTravelContextHarnessCase({
        caseId: 'CONTEXT-ASSEMBLY-001',
        snapshot,
        run: async () =>
          assertContextAssembly001(snapshot, {
            destinationCode: 'IS',
            minOpenDecisions: 1,
          }),
      });
      return { pass: result.pass, errors: result.errors };
    }),
  );

  cases.push(
    await runCase('EXPLORATION-PROJECTION-001', async () => {
      const explorationSnapshot = mapExplorationScenarioToTravelContext({
        scenario: {
          id: 'explore-gate-1',
          contextId: 'explore-gate-1',
          userId: 'user-gate',
          status: 'DRAFT',
          researchProtocolId: null,
          initialInput: {
            destinationCodes: ['IS'],
            dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
            travelers: [{ type: 'ADULT' }],
            source: 'USER_CREATED',
          },
          tripId: null,
          materializedAt: null,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-05T00:00:00.000Z'),
        },
        candidatesStatus: { activeCount: 2, selectedRouteId: 'route_gate', generationVersion: 1 },
        rejectedRouteIds: ['route_old'],
      });
      const result = await runTravelContextHarnessCase({
        caseId: 'EXPLORATION-PROJECTION-001',
        snapshot: explorationSnapshot,
        run: async () =>
          assertExplorationProjectionConsistency(explorationSnapshot).map((a) => harnessAssert(a)),
      });
      return { pass: result.pass, errors: result.errors };
    }),
  );

  cases.push(
    await runCase('AGENT-GROUNDING-CROSS-001', async () => {
      const traces = buildThreePersonaTraces(snapshot);
      const result = await runTravelContextHarnessCase({
        caseId: 'AGENT-GROUNDING-CROSS-001',
        snapshot,
        run: async () => assertAgentGroundingCross001(traces),
      });
      return { pass: result.pass, errors: result.errors };
    }),
  );

  const intentApplied = simulateIntentTransition({
    snapshot,
    intent: {
      type: 'SELECT_ROUTE',
      basedOnRevision: snapshot.meta.revision,
      payload: { routeId: 'route_gate' },
    },
    runtimeAuthority: 'CANONICAL',
    authorityRunId: 'gate-intent-001',
  });

  cases.push(
    await runCase('INTENT-TRANSITION-001', async () => {
      const result = await runTravelContextHarnessCase({
        caseId: 'INTENT-TRANSITION-001',
        snapshot,
        outputSnapshot: intentApplied.outputSnapshot,
        trace: intentApplied.trace,
        invariantIds: ['CTX-STATE-002', 'CTX-AUTH-004'],
        run: async () => assertIntentTransition001(snapshot, intentApplied),
      });
      return { pass: result.pass, errors: result.errors };
    }),
  );

  const intentStale = simulateIntentTransition({
    snapshot,
    intent: {
      type: 'SELECT_ROUTE',
      basedOnRevision: snapshot.meta.revision - 1,
      payload: { routeId: 'route_stale' },
    },
    runtimeAuthority: 'CANONICAL',
    authorityRunId: 'gate-intent-002',
  });

  cases.push(
    await runCase('INTENT-TRANSITION-002', async () => {
      const result = await runTravelContextHarnessCase({
        caseId: 'INTENT-TRANSITION-002',
        snapshot,
        run: async () => assertIntentTransition002(snapshot, intentStale),
      });
      return { pass: result.pass, errors: result.errors };
    }),
  );

  const intentLegacy = simulateIntentTransition({
    snapshot,
    intent: {
      type: 'APPLY_PLAN',
      basedOnRevision: snapshot.meta.revision,
      payload: { planVersionId: 'pv_bad' },
    },
    runtimeAuthority: 'LEGACY',
    authorityRunId: 'gate-intent-003',
  });

  cases.push(
    await runCase('INTENT-TRANSITION-003', async () => {
      const result = await runTravelContextHarnessCase({
        caseId: 'INTENT-TRANSITION-003',
        snapshot,
        run: async () => assertIntentTransition003(snapshot, intentLegacy),
      });
      return { pass: result.pass, errors: result.errors };
    }),
  );

  const replan = simulateRoadClosureReplanning({
    snapshot: replanSnapshot,
    event: {
      type: 'ROAD_CLOSED',
      roadId: 'IS-F208',
      observedAt: '2026-07-05T10:00:00Z',
      sourceId: 'gate',
    },
    authorityRunId: 'gate-replan-001',
  });

  cases.push(
    await runCase('REPLAN-ROAD-CLOSURE-001', async () => {
      const result = await runTravelContextHarnessCase({
        caseId: 'REPLAN-ROAD-CLOSURE-001',
        snapshot: replanSnapshot,
        outputSnapshot: replan.outputSnapshot,
        trace: replan.trace,
        invariantIds: ['CTX-STATE-002', 'CTX-AUTH-001', 'CTX-WORLD-001'],
        run: async () => assertReplanRoadClosure001(replanSnapshot, replan),
      });
      return { pass: result.pass, errors: result.errors };
    }),
  );

  const passedCount = cases.filter((c) => c.pass).length;
  const errors = cases.flatMap((c) => c.errors.map((e) => `[${c.caseId}] ${e}`));

  return {
    pass: passedCount === cases.length,
    caseCount: cases.length,
    passedCount,
    cases,
    errors,
  };
}

export function expectTravelContextRegressionGatePass(result: TravelContextRegressionGateResult): void {
  if (!result.pass) {
    throw new Error(
      `Travel Context Regression Gate failed: ${result.passedCount}/${result.caseCount}\n${result.errors.join('\n')}`,
    );
  }
}
