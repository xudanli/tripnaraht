/**
 * Travel Compiler Golden Path — compile → project → VERIFY SSOT → repair recompile.
 *
 * 纯函数 harness，供 E2E spec 与 capture 脚本复用；不启动 Nest 全栈。
 */
import type { ConfigService } from '@nestjs/config';
import type { RouteAndRunRequestDto } from '../../agent/dto/route-and-run.dto';
import type { Itinerary, OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import { CanonicalPoiResolutionService } from '../../canonical-poi-resolution/services/canonical-poi-resolution.service';
import { PoiAliasRegistryService } from '../../canonical-poi-resolution/services/poi-alias-registry.service';
import type { CompilationResult } from '../../travel-compiler/contracts/compilation-result.types';
import { applyGraphVerifySsot } from '../../travel-compiler/projection/apply-graph-verify-ssot.util';
import { graphToItinerary } from '../../travel-compiler/projection/graph-to-itinerary.util';
import { TravelCompilerService } from '../../travel-compiler/travel-compiler.service';
import {
  runTravelCompilePhase,
  runTravelRecompileAfterRepair,
} from '../../agent/orchestration/travel-compile/travel-compile-phase.util';

export type TravelCompilerGoldenPathResult = {
  initialCompile: CompilationResult;
  projectedItinerary: Itinerary;
  verifySsotApplied: boolean;
  repairRecompile?: CompilationResult;
  finalItinerary?: Itinerary;
};

function mockRegistry() {
  const catalog = [
    { poiId: 'is.thingvellir', canonicalName: 'Thingvellir', aliases: ['辛格维利尔'], country: 'IS', status: 'ACTIVE' },
    { poiId: 'is.geysir', canonicalName: 'Geysir', aliases: ['间歇泉'], country: 'IS', status: 'ACTIVE' },
    { poiId: 'is.gullfoss', canonicalName: 'Gullfoss', aliases: ['黄金瀑布'], country: 'IS', status: 'ACTIVE' },
    { poiId: 'is.blue_lagoon', canonicalName: 'Blue Lagoon', aliases: ['蓝湖'], country: 'IS', status: 'ACTIVE' },
  ];
  return {
    getCatalog: () => catalog,
    getByPoiId: (id: string) => catalog.find((c) => c.poiId === id),
  };
}

export function buildTravelCompilerService(): TravelCompilerService {
  const prisma = { poiResolutionLog: { create: jest.fn().mockResolvedValue({}) } };
  const cpre = new CanonicalPoiResolutionService(
    mockRegistry() as unknown as PoiAliasRegistryService,
    prisma as never,
  );
  return new TravelCompilerService(cpre);
}

export function buildGoldenCirclePlannerItinerary(): Itinerary {
  return {
    request_id: 'req_gc_golden',
    days: [
      {
        date: '2026-08-03',
        items: [
          {
            id: 'gc_slot',
            type: 'POI',
            start_window: '09:00',
            end_window: '17:00',
            location_ref: { name: 'Golden Circle' },
            evidence_refs: [],
            verified: false,
          },
        ],
      },
    ],
  };
}

function mockConfig(enabledFlags: Record<string, string>): ConfigService {
  return {
    get: (key: string) => enabledFlags[key],
  } as unknown as ConfigService;
}

export async function runTravelCompilerGoldenPath(params?: {
  simulateRepair?: boolean;
}): Promise<TravelCompilerGoldenPathResult> {
  const compiler = buildTravelCompilerService();
  const configService = mockConfig({
    TRAVEL_COMPILER_ENABLED: '1',
    TRAVEL_COMPILER_VERIFY_SSOT: '1',
    TRAVEL_COMPILER_INCREMENTAL_REPAIR: '1',
    TRAVEL_COMPILER_STRICT: '0',
  });

  const itinerary = buildGoldenCirclePlannerItinerary();
  const state: OrchestratorState = {
    request_id: itinerary.request_id,
    current_step: 'PLAN_GEN',
    itinerary,
    trip_plan_request: { destination: 'IS' } as OrchestratorState['trip_plan_request'],
    metadata: {
      started_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
    },
    evidence_registry: new Map(),
    decision_log: [],
    errors: [],
  };

  const request = {
    request_id: itinerary.request_id,
    user_id: 'u_golden',
    message: 'plan golden circle',
    options: { enable_travel_compiler: true },
  } as RouteAndRunRequestDto;

  const compileOutcome = await runTravelCompilePhase({
    state,
    request,
    compiler,
    configService,
  });

  if (compileOutcome.skipped || !compileOutcome.result?.graph) {
    throw new Error('TRAVEL_COMPILE skipped or missing graph');
  }

  const projectedItinerary = graphToItinerary(compileOutcome.result.graph);
  const ssot = applyGraphVerifySsot(state);

  const result: TravelCompilerGoldenPathResult = {
    initialCompile: compileOutcome.result,
    projectedItinerary,
    verifySsotApplied: ssot.applied,
  };

  if (params?.simulateRepair) {
    const itineraryBeforeRepair = structuredClone(state.itinerary!) as Itinerary;
    const day0 = state.itinerary!.days[0]!;
    day0.items.push({
      id: 'added_poi',
      type: 'POI',
      start_window: '17:30',
      end_window: '18:30',
      location_ref: { name: '蓝湖' },
      evidence_refs: [],
      verified: false,
    });

    const repairOutcome = await runTravelRecompileAfterRepair({
      state,
      request,
      compiler,
      configService,
      itineraryBeforeRepair,
      repairApplied: true,
      verificationIssues: [{ dayIndex: 0 }],
    });

    if (repairOutcome.skipped || !repairOutcome.result?.graph) {
      throw new Error('REPAIR recompile skipped or missing graph');
    }

    result.repairRecompile = repairOutcome.result;
    result.finalItinerary = state.itinerary;
  }

  return result;
}

export function assertGoldenPathProjection(result: TravelCompilerGoldenPathResult): void {
  expect(result.initialCompile.engine).toBe('CTRE');
  expect(result.initialCompile.graph?.stats.routeTemplatesResolved).toBeGreaterThanOrEqual(1);
  expect(result.verifySsotApplied).toBe(true);

  const items = result.projectedItinerary.days[0]?.items ?? [];
  expect(items.some((i) => i.type === 'POI')).toBe(true);
  expect(items.some((i) => i.type === 'DRIVE')).toBe(true);

  const poiIds = items
    .map((i) => i.metadata?.canonical_poi_id)
    .filter(Boolean);
  expect(poiIds).toEqual(
    expect.arrayContaining(['is.thingvellir', 'is.geysir', 'is.gullfoss']),
  );
}
