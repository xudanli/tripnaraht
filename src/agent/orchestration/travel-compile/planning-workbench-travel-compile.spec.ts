import { runPlanningWorkbenchTravelCompile } from './planning-workbench-travel-compile.util';
import { buildTravelCompilerService } from '../../../e2e/golden-path/travel-compiler-golden-path.harness';
import type { PlanContext, PlanState } from '../../../skills/plan/shared/plan-state.types';

function icelandPlanState(): PlanState {
  return {
    plan_id: 'plan_wb_ctre',
    plan_version: 1,
    constraints: {
      time: { days: 1, startDate: '2026-08-03' },
      budget: {},
      fitness: {},
    },
    itinerary: {
      tripId: 'trip_wb',
      routeDirectionId: 'rd_1',
      segments: [
        {
          segmentId: 'day_1_segment_1',
          dayIndex: 0,
          distanceKm: 0,
          ascentM: 0,
          slopePct: 0,
          metadata: {
            day: 1,
            theme: 'Golden Circle',
            attractions: [{ name: 'Gullfoss' }, { name: 'Geysir' }],
          },
        },
      ],
    },
    mobility: { transferSegments: [] },
    budget: {},
    pace: {},
    gate: { status: 'NEED_CONFIRM', reasons: [], missingEvidence: [] },
    evidence_refs: [],
    decision_log_refs: [],
    status: 'PROPOSED',
    metadata: {},
  };
}

const context: PlanContext = {
  destination: { country: 'Iceland' },
  days: 1,
};

describe('runPlanningWorkbenchTravelCompile', () => {
  it('skips when compiler disabled', async () => {
    const planState = icelandPlanState();
    const out = await runPlanningWorkbenchTravelCompile({
      planState,
      context,
      enableTravelCompiler: false,
      configService: { get: () => 'false' } as never,
    });
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('travel_compiler_disabled');
  });

  it('compiles plan state and persists graph when tripId provided', async () => {
    const planState = icelandPlanState();
    const persist = jest.fn().mockResolvedValue(undefined);
    const progressMessages: string[] = [];

    const out = await runPlanningWorkbenchTravelCompile({
      planState,
      context,
      tripId: 'trip_wb',
      userAction: 'commit',
      enableTravelCompiler: true,
      compiler: buildTravelCompilerService(),
      graphStore: { persistCompilation: persist } as never,
      configService: { get: () => 'true' } as never,
      onProgress: (msg) => progressMessages.push(msg),
    });

    expect(out.skipped).toBe(false);
    expect(out.progress?.engine).toBe('CTRE');
    expect(out.progress?.counters.POI?.done).toBeGreaterThanOrEqual(1);
    expect(persist).toHaveBeenCalledWith('trip_wb', expect.objectContaining({ graph: expect.any(Object) }));
    expect(planState.metadata?.ctre_compile_progress).toBeDefined();
    expect(planState.metadata?.canonical_travel_graph).toBeDefined();
    expect(out.segmentEnrichment?.poiTagsApplied).toBeGreaterThanOrEqual(1);
    expect(out.verifySsotApplied).toBe(true);
    expect(planState.metadata?.verify_itinerary_source).toBe('canonical_travel_graph@v0');
    const attraction = (planState.itinerary.segments[0]?.metadata as Record<string, unknown>)
      ?.attractions as Array<Record<string, unknown>>;
    expect(attraction?.some((a) => a.canonical_poi_id === 'is.gullfoss')).toBe(true);
    expect(progressMessages.some((m) => m.includes('CTRE'))).toBe(true);
  });

  it('skips compare action', async () => {
    const planState = icelandPlanState();
    const out = await runPlanningWorkbenchTravelCompile({
      planState,
      context,
      userAction: 'compare',
      enableTravelCompiler: true,
      compiler: buildTravelCompilerService(),
      configService: { get: () => 'true' } as never,
    });
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('compare_action_skipped');
  });
});
