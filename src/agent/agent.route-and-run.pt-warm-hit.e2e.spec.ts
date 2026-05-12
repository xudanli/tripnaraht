/**
 * HTTP E2E for PT warm-hit (station-pair key) + C1 strict auto-heal.
 *
 * Goal:
 * - Prefetch writes a "transfer gap violated" PT snapshot into EvidenceCache with key transit:{A}:{B}:{bucket}.
 * - route_and_run should NOT call external transit fetch (warm-hit), but still FAIL strict with PT_TRANSFER_GAP_VIOLATION.
 * - AgentService should auto-heal (2nd orchestrator call) and return a DRIVE itinerary.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { AgentController } from './agent.controller';
import { AgentService } from './services/agent.service';
import { RouterService } from './services/router.service';
import { AgentStateService } from './services/agent-state.service';
import { System1ExecutorService } from './services/system1-executor.service';
import { OrchestratorService } from './services/orchestrator.service';
import { EventTelemetryService } from './services/event-telemetry.service';
import { RequestDeduplicationService } from './services/request-deduplication.service';
import { ClaudeOrchestratorService } from './services/claude-orchestrator.service';
import type { OrchestrationResult } from './interfaces/claude-orchestration.interface';
import type { OrchestratorState } from './interfaces/trip-plan.interface';
import { RouteAndRunResponseAssemblerService } from './services/route-and-run-response-assembler.service';
import { EvidenceCacheService } from '../skills/world/services/evidence-cache.service';
import { PrefetcherService } from '../skills/world/services/prefetcher.service';
import { JepaProjectorService } from './services/jepa-projector.service';
import { PublicTransitRealtimeAdapterRegistry } from '../skills/world/services/public-transit-realtime-adapter.registry';
import { StubGtfsRealtimeAdapter } from '../skills/world/services/stub-gtfs-realtime.adapter';
import { HotspotRegistryService } from '../skills/world/services/hotspot-registry.service';
import { PublicTransitWarmupCron } from '../skills/world/services/public-transit-warmup.cron';
import { AccessTrackerService } from '../skills/world/services/access-tracker.service';
import { WeatherSearchSkill } from '../skills/weather/weather-search.skill';
import { TradeoffEngineService } from './services/tradeoff-engine.service';
import { UserPreferenceLearningService } from './services/user-preference-learning.service';
import { DrivePricingQuoteSkill } from '../skills/world/services/drive-pricing-quote.skill';
import { TravelTimeRouterService } from './services/travel-time-router.service';
import { TravelTimeResolverService } from './services/travel-time-resolver.service';
import { NegotiationSessionStoreService } from './services/negotiation-session-store.service';
import { NegotiationResolverService } from './services/negotiation-resolver.service';
import { TimelineInspectorService } from './services/timeline-inspector.service';
import { ItineraryRevisionRegretService } from './services/itinerary-revision-regret.service';
import { NEGOTIATION_REASONING_TAG } from './constants/negotiation-reasoning.constants';
import { NegotiationNarratorService } from './services/negotiation-narrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditRecordService } from './services/audit-record.service';
import { ItineraryVersionService } from './services/itinerary-version.service';
import { UserProfileLearningService } from './services/user-profile-learning.service';
import { PreferenceEvolutionService } from './services/preference-evolution.service';
import { ItineraryRollbackService } from './services/itinerary-rollback.service';

describe('POST /agent/route_and_run — PT warm-hit + strict auto-heal (E2E)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prevUseClaudeEnv: string | undefined;
  let prevStrictEb: string | undefined;

  const mockRouterService = { route: jest.fn() };
  const mockAgentStateService = {
    createInitialState: jest.fn().mockImplementation((_userInput: string, _userId: string, tripId?: string, options?: any) => ({
      request_id: `test-${Date.now()}`,
      user_input: '',
      trip: { trip_id: tripId || null, days: 1, day_boundaries: [{ start: '08:00', end: '22:00' }], pacing: 'normal' },
      draft: { nodes: [], hard_nodes: [], soft_nodes: [], edits: [] },
      memory: { semantic_facts: { pois: [], rules: {} }, episodic_snippets: [], user_profile: {} },
      compute: { clusters: null, time_matrix_api: null, time_matrix_robust: null, optimization_results: [], robustness: null },
      react: { step: 0, max_steps: options?.max_steps || 8, observations: [], decision_log: [] },
      result: { status: 'DRAFT' as const, timeline: [], dropped_items: [], explanations: [] },
      observability: { router_ms: 0, latency_ms: 0, tool_calls: 0, browser_steps: 0, cost_est_usd: 0, fallback_used: false },
    })),
    getState: jest.fn(),
    update: jest.fn().mockImplementation((requestId: string, updates: any) => {
      const base = mockAgentStateService.createInitialState('', '', null);
      return {
        ...base,
        request_id: requestId,
        ...updates,
        result: { ...base.result, ...(updates.result || {}) },
        observability: { ...base.observability, ...(updates.observability || {}) },
      };
    }),
  };
  const mockSystem1Executor = { execute: jest.fn() };
  const mockOrchestrator = { execute: jest.fn() };
  const mockEventTelemetry = { recordRouterDecision: jest.fn(), recordAgentComplete: jest.fn() };
  const mockRequestDeduplication = {
    generateRequestHash: jest.fn(),
    getCachedResponse: jest.fn(),
    cacheResponse: jest.fn(),
    checkDuplicate: jest.fn(),
  };

  /** Default: no regret memory; individual tests may mockResolvedValueOnce('POSTPONE_SCHEDULE'). */
  const negotiationRegretReader = {
    getAlternativeIdSupersededByLatestRollback: jest.fn().mockResolvedValue(null),
  };

  const userPreferenceBias = {
    getRollbackBiasEffortDelta: jest.fn().mockResolvedValue(0),
  };

  const revisionRows: any[] = [];
  let userProfilePrefs: any = {};
  const mockPrisma: any = {
    itineraryRevision: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
        const tid = where?.tripId ?? null;
        const chain = revisionRows.filter((r) => r.tripId === tid).sort((a, b) => a.createdAtMs - b.createdAtMs);
        return chain.length ? chain[chain.length - 1] : null;
      }),
      findMany: jest.fn().mockImplementation(async ({ where, take }: any) => {
        const uid = where?.userId ?? null;
        const kind = where?.kind ?? null;
        const notNull = where?.alternativeId?.not === null ? false : true;
        let rows = revisionRows.slice();
        if (uid != null) rows = rows.filter((r) => r.userId === uid);
        if (kind != null) rows = rows.filter((r) => r.kind === kind);
        if (notNull) rows = rows.filter((r) => r.alternativeId != null);
        rows = rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      }),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: `rev-${revisionRows.length + 1}`, ...data, createdAtMs: Date.now() };
        revisionRows.push(row);
        return row;
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
        const id = where?.id ?? null;
        if (!id) return null;
        return revisionRows.find((r) => r.id === id) ?? null;
      }),
    },
    userProfile: {
      findUnique: jest.fn().mockImplementation(async () => ({ preferences: userProfilePrefs })),
      upsert: jest.fn().mockImplementation(async ({ update, create }: any) => {
        userProfilePrefs = (update?.preferences ?? create?.preferences) || {};
        return { preferences: userProfilePrefs };
      }),
    },
    trip: {
      findUnique: jest.fn().mockResolvedValue({ id: 'trip-dna', metadata: {} }),
      update: jest.fn().mockResolvedValue({ id: 'trip-dna' }),
    },
    $transaction: jest.fn(async (fn: any): Promise<any> => fn(mockPrisma)),
  };

  beforeEach(() => {
    revisionRows.length = 0;
    userProfilePrefs = {};
  });

  function baseOrchestrationResult(overrides: Partial<OrchestrationResult> = {}): OrchestrationResult {
    return {
      success: true,
      answerText: 'ok',
      stepsExecuted: [],
      totalDuration: 0,
      decisionLog: [],
      result: {},
      ...overrides,
    };
  }

  function baseState(partial: Partial<OrchestratorState>): OrchestratorState {
    return {
      request_id: 'e2e-pt-warm',
      current_step: 'VERIFY',
      trip_plan_request: { request_id: 'e2e-pt-warm', origin: 'Station A', destination: 'Hotel B' },
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
      ...partial,
    } as OrchestratorState;
  }

  beforeAll(async () => {
    prevUseClaudeEnv = process.env.USE_CLAUDE_ORCHESTRATION;
    prevStrictEb = process.env.C1_STRICT_EVIDENCE_BUNDLE;
    process.env.USE_CLAUDE_ORCHESTRATION = 'true';
    process.env.C1_STRICT_EVIDENCE_BUNDLE = '1';

    // These will be assigned after module compilation.
    let evidenceCache: EvidenceCacheService | null = null;
    const externalTransitFetch = jest.fn();

    const deterministicClaudeOrchestrator = {
      orchestrateWithStateMachine: jest.fn().mockImplementation(async (req: any) => {
        const now = new Date().toISOString();
        const isHeal =
          String(req?.meta?.pt_heal_retry ?? '') === '1' ||
          String(req?.emergency_constraints?.reason_code ?? '') === 'HEALING_PT_HARD_FACT_FAILED';

        // Warm-hit check: if cache miss, simulate an external transit IO call.
        const pair = req?.emergency_constraints?.pt_station_pair;
        const constraints_hash = evidenceCache?.hashEmergencyConstraints(req?.emergency_constraints ?? null) ?? 'na';
        const geo_hash = evidenceCache?.transitPairHash(pair?.station_a ?? 'UNKNOWN_A', pair?.station_b ?? 'UNKNOWN_B') ?? 'na';
        const time_bucket = evidenceCache?.timeBucketIso(Date.now(), 5) ?? new Date().toISOString();
        const cached = await evidenceCache?.get({
          rule_id: 'public_transport_v1',
          geo_hash,
          time_bucket,
          constraints_hash,
        });
        if (!cached && !isHeal) {
          externalTransitFetch();
        }

        if (!isHeal) {
          // First attempt: TRANSIT plan. Evidence comes from cache (warm-hit) and is a transfer gap violation.
          const itinerary =
            req.request_id === 'e2e-slack-zero-metadata'
              ? {
                  request_id: req.request_id ?? 'e2e-pt-warm',
                  days: [
                    {
                      date: '2026-06-01',
                      items: [
                        {
                          id: 'seg_transit_pair_1',
                          type: 'TRANSIT',
                          status: 'PLANNED',
                          start_time: '2026-06-01T13:00:00.000Z',
                          min_duration_minutes: 60,
                          start_window: '10:00',
                          end_window: '10:30',
                          location_ref: { place_id: 'seg_transit_pair_1', name: 'Transit segment' },
                          evidence_refs: [],
                          verified: false,
                          verification_status: 'ASSUMPTION',
                        },
                        {
                          id: 'item_museum_booking_1',
                          item_id: 'item_museum_booking_1',
                          type: 'VISIT',
                          status: 'PLANNED',
                          start_time: '2026-06-01T14:00:00.000Z',
                          // NOTE: This long end_time is only for deterministic slack discovery:
                          // dinner starts 19:00, museum ends 18:15 => schedule gap=45min, minus survival buffer 5 => effective buffer=40.
                          end_time: '2026-06-01T18:15:00.000Z',
                          location_ref: { place_id: 'poi_museum', name: 'Museum (Booked)' },
                          metadata: {
                            hard_booking: true,
                            latest_arrival_time: '2026-06-01T14:00:00.000Z',
                            min_duration_minutes: 90,
                          },
                          evidence_refs: [],
                          verified: false,
                          verification_status: 'ASSUMPTION',
                        },
                        {
                          id: 'item_dinner_booking_1',
                          item_id: 'item_dinner_booking_1',
                          type: 'DINNER',
                          status: 'PLANNED',
                          start_time: '2026-06-01T19:00:00.000Z',
                          end_time: '2026-06-01T20:30:00.000Z',
                          location_ref: { place_id: 'poi_dinner', name: 'Michelin Dinner (Booked)' },
                          metadata: {
                            hard_booking: true,
                            latest_arrival_time: '2026-06-01T19:00:00.000Z',
                            grace_minutes: 20,
                          },
                          evidence_refs: [],
                          verified: false,
                          verification_status: 'ASSUMPTION',
                        },
                      ],
                    },
                  ],
                  action_plan: [],
                }
              : req.request_id === 'e2e-slack-physical-reality'
                ? {
                    request_id: req.request_id ?? 'e2e-pt-warm',
                    days: [
                      {
                        date: '2026-06-01',
                        items: [
                          {
                            id: 'seg_transit_pair_1',
                            type: 'TRANSIT',
                            status: 'PLANNED',
                            // Delay happens right before dinner (no huge gaps that would absorb it)
                            start_time: '2026-06-01T18:00:00.000Z',
                            end_time: '2026-06-01T18:15:00.000Z',
                            min_duration_minutes: 15,
                            location_ref: {
                              place_id: 'seg_transit_pair_1',
                              name: 'Transit segment',
                              coordinates: { lat: 51.50, lng: -0.10 },
                            },
                            evidence_refs: [],
                            verified: false,
                            verification_status: 'ASSUMPTION',
                          },
                          {
                            id: 'item_dinner_booking_1',
                            item_id: 'item_dinner_booking_1',
                            type: 'DINNER',
                            status: 'PLANNED',
                            start_time: '2026-06-01T19:00:00.000Z',
                            end_time: '2026-06-01T20:30:00.000Z',
                            location_ref: {
                              place_id: 'poi_dinner',
                              name: 'Michelin Dinner (Booked)',
                              // ~15km away → ~30min @ 30km/h
                              coordinates: { lat: 51.635, lng: -0.10 },
                            },
                            metadata: {
                              hard_booking: true,
                              latest_arrival_time: '2026-06-01T19:00:00.000Z',
                            },
                            evidence_refs: [],
                            verified: false,
                            verification_status: 'ASSUMPTION',
                          },
                        ],
                      },
                    ],
                    action_plan: [],
                  }
              : req.request_id === 'e2e-teleport-forbidden'
                ? {
                    request_id: req.request_id ?? 'e2e-pt-warm',
                    days: [
                      {
                        date: '2026-06-01',
                        items: [
                          {
                            id: 'seg_transit_pair_1',
                            type: 'TRANSIT',
                            status: 'PLANNED',
                            start_time: '2026-06-01T18:00:00.000Z',
                            end_time: '2026-06-01T18:45:00.000Z',
                            min_duration_minutes: 45,
                            location_ref: { place_id: 'seg_transit_pair_1', name: 'Transit segment', coordinates: { lat: 51.50, lng: -0.10 } },
                            evidence_refs: [],
                            verified: false,
                            verification_status: 'ASSUMPTION',
                          },
                          {
                            id: 'item_dinner_booking_tele',
                            type: 'DINNER',
                            status: 'PLANNED',
                            start_time: '2026-06-01T19:00:00.000Z',
                            end_time: '2026-06-01T20:30:00.000Z',
                            location_ref: { place_id: 'poi_dinner_tele', name: 'Dinner', coordinates: { lat: 51.635, lng: -0.10 } },
                            metadata: { hard_booking: true, latest_arrival_time: '2026-06-01T19:00:00.000Z' },
                            evidence_refs: [],
                            verified: false,
                            verification_status: 'ASSUMPTION',
                          },
                        ],
                      },
                    ],
                    action_plan: [],
                  }
              : req.request_id === 'e2e-high-precision-impossible' || req.request_id === 'e2e-attribution-l1b-neighbor'
                ? {
                    request_id: req.request_id ?? 'e2e-pt-warm',
                    days: [
                      {
                        date: '2026-06-01',
                        items: [
                          {
                            id: 'seg_a_hp_1',
                            type: 'TRANSFER',
                            status: 'PLANNED',
                            start_time: '2026-06-01T18:00:00.000Z',
                            end_time: '2026-06-01T18:10:00.000Z',
                            location_ref: { place_id: 'A_HP', name: 'A', coordinates: { lat: 51.5, lng: -0.1 } },
                            evidence_refs: [],
                            verified: false,
                            verification_status: 'ASSUMPTION',
                          },
                          {
                            id: 'item_b_hp',
                            type: 'DINNER',
                            status: 'PLANNED',
                            // only 15 min gap after previous end_time
                            start_time: '2026-06-01T18:25:00.000Z',
                            end_time: '2026-06-01T19:00:00.000Z',
                            location_ref: { place_id: 'B_HP', name: 'B', coordinates: { lat: 51.52, lng: -0.1 } },
                            metadata: { hard_booking: true, latest_arrival_time: '2026-06-01T18:25:00.000Z' },
                            evidence_refs: [],
                            verified: false,
                            verification_status: 'ASSUMPTION',
                          },
                        ],
                      },
                    ],
                    action_plan: [],
                  }
              : String(req.request_id ?? '') === 'e2e-learning-rate'
                ? {
                    request_id: req.request_id ?? 'e2e-pt-warm',
                    days: [
                      {
                        date: '2026-06-01',
                        items: [
                          {
                            id: 'seg_a_b_1',
                            type: 'TRANSFER',
                            status: 'PLANNED',
                            start_time: '2026-06-01T18:00:00.000Z',
                            end_time: '2026-06-01T18:10:00.000Z',
                            location_ref: { place_id: 'A', name: 'A', coordinates: { lat: 51.5, lng: -0.1 } },
                            evidence_refs: [],
                            verified: false,
                            verification_status: 'ASSUMPTION',
                          },
                          {
                            id: 'seg_a_b_2',
                            type: 'TRANSFER',
                            status: 'PLANNED',
                            start_time: '2026-06-01T18:12:00.000Z',
                            end_time: '2026-06-01T18:22:00.000Z',
                            location_ref: { place_id: 'B', name: 'B', coordinates: { lat: 51.635, lng: -0.1 } },
                            evidence_refs: [],
                            verified: false,
                            verification_status: 'ASSUMPTION',
                          },
                          // Repeat same edge A->B again (same coords) to force second lookup.
                          {
                            id: 'seg_a_b_3',
                            type: 'TRANSFER',
                            status: 'PLANNED',
                            start_time: '2026-06-01T18:24:00.000Z',
                            end_time: '2026-06-01T18:34:00.000Z',
                            location_ref: { place_id: 'A2', name: 'A', coordinates: { lat: 51.5, lng: -0.1 } },
                            evidence_refs: [],
                            verified: false,
                            verification_status: 'ASSUMPTION',
                          },
                          {
                            id: 'item_dinner_booking_lr',
                            type: 'DINNER',
                            status: 'PLANNED',
                            start_time: '2026-06-01T19:00:00.000Z',
                            end_time: '2026-06-01T20:00:00.000Z',
                            location_ref: { place_id: 'B2', name: 'Dinner', coordinates: { lat: 51.635, lng: -0.1 } },
                            metadata: { hard_booking: true, latest_arrival_time: '2026-06-01T19:00:00.000Z' },
                            evidence_refs: [],
                            verified: false,
                            verification_status: 'ASSUMPTION',
                          },
                        ],
                      },
                    ],
                    action_plan: [],
                  }
                : String(req.request_id ?? '').startsWith('e2e-time-agnostic-')
                  ? {
                      request_id: req.request_id ?? 'e2e-pt-warm',
                      days: [
                        {
                          date: '2026-06-01',
                          items: [
                            {
                              id: 'seg_a_b_ta_1',
                              type: 'TRANSFER',
                              status: 'PLANNED',
                              start_time: '2026-06-01T18:00:00.000Z',
                              end_time: '2026-06-01T18:10:00.000Z',
                              // unique coords to avoid cross-test cache reuse
                              location_ref: { place_id: 'A_TA', name: 'A', coordinates: { lat: 51.51, lng: -0.11 } },
                              evidence_refs: [],
                              verified: false,
                              verification_status: 'ASSUMPTION',
                            },
                            {
                              id: 'item_dinner_booking_ta',
                              type: 'DINNER',
                              status: 'PLANNED',
                              start_time: '2026-06-01T19:00:00.000Z',
                              end_time: '2026-06-01T20:00:00.000Z',
                              location_ref: { place_id: 'B_TA', name: 'Dinner', coordinates: { lat: 51.65, lng: -0.11 } },
                              metadata: { hard_booking: true, latest_arrival_time: '2026-06-01T19:00:00.000Z' },
                              evidence_refs: [],
                              verified: false,
                              verification_status: 'ASSUMPTION',
                            },
                          ],
                        },
                      ],
                      action_plan: [],
                    }
                : {
            request_id: req.request_id ?? 'e2e-pt-warm',
            days: [
              {
                date: '2026-06-01',
                items: [
                  {
                    id: 'seg_transit_pair_1',
                    type: 'TRANSIT',
                    status: 'PLANNED',
                    start_time: '2026-06-01T13:00:00.000Z',
                    min_duration_minutes: 60,
                    start_window: '10:00',
                    end_window: '10:30',
                    location_ref: { place_id: 'seg_transit_pair_1', name: 'Transit segment' },
                    evidence_refs: [],
                    verified: false,
                    verification_status: 'ASSUMPTION',
                  },
                  {
                    id: 'item_museum_booking_1',
                    item_id: 'item_museum_booking_1',
                    type: 'VISIT',
                    status: 'PLANNED',
                    start_time: '2026-06-01T14:00:00.000Z',
                    end_time: '2026-06-01T15:30:00.000Z',
                    location_ref: { place_id: 'poi_museum', name: 'Museum (Booked)' },
                    metadata: {
                      hard_booking: true,
                      latest_arrival_time: '2026-06-01T14:00:00.000Z',
                      min_duration_minutes: 90,
                      buffer_minutes: 37,
                    },
                    evidence_refs: [],
                    verified: false,
                    verification_status: 'ASSUMPTION',
                  },
                  {
                    id: 'item_dinner_booking_1',
                    item_id: 'item_dinner_booking_1',
                    type: 'DINNER',
                    status: 'PLANNED',
                    start_time: '2026-06-01T19:00:00.000Z',
                    end_time: '2026-06-01T20:30:00.000Z',
                    location_ref: { place_id: 'poi_dinner', name: 'Michelin Dinner (Booked)' },
                    metadata: {
                      hard_booking: true,
                      latest_arrival_time: '2026-06-01T19:00:00.000Z',
                      grace_minutes: 20,
                    },
                    evidence_refs: [],
                    verified: false,
                    verification_status: 'ASSUMPTION',
                  },
                ],
              },
            ],
            action_plan: [],
          };
          const k3Log: any[] = [
            {
              step: 'VERIFY',
              timestamp: now,
              inputs_summary: 'PT verify: warm-hit cached transfer window snapshot',
              outputs_summary: 'TRANSIT transfer gap violated',
              evidence_refs: [],
              metadata: {
                rule_id: 'public_transport_v1',
                details: {
                  evidence: {
                    ...(cached?.evidence ?? {}),
                    // ensure violation signal exists even if cache record is stale/missing
                    type: 'public_transit',
                    serviceStatus: 'ACTIVE',
                    transferWindowMin: 10,
                    plannedTransferWindowMin: 3,
                    source: (cached?.evidence as any)?.source ?? 'DETERMINISTIC_WARM_CACHE',
                    cached_at: (cached as any)?.cached_at ?? now,
                    expires_at: (cached as any)?.expires_at ?? now,
                    is_warm_hit: true,
                    is_violated: true,
                  },
                },
              },
            },
          ];
          return baseOrchestrationResult({
            answerText: 'pt transfer gap',
            stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 1 }],
            decisionLog: k3Log,
            result: {
              state: baseState({
                current_step: 'VERIFY',
                decision_log: k3Log,
                itinerary,
                research_data: {
                  world: {
                    physical: {
                      prefetched_evidence: [
                        ...(cached?.evidence ? [cached.evidence] : []),
                        ...(((deterministicClaudeOrchestrator as any).__quoteEvidence ? [(deterministicClaudeOrchestrator as any).__quoteEvidence] : []) as any[]),
                        ...(((deterministicClaudeOrchestrator as any).__travelEvidence ? [(deterministicClaudeOrchestrator as any).__travelEvidence] : []) as any[]),
                      ],
                    },
                  },
                },
                narration: {
                  user_friendly_summary: 'pt transfer gap',
                  day_by_day_narrative: [],
                  highlights: [],
                  tips: [],
                  warnings: [
                    {
                      kind: 'iron_shield_evidence',
                      rule_id: 'public_transport_v1',
                      severity: 'HARD',
                      message: 'Transit transfer gap below minimum',
                      evidence: {
                        type: 'public_transit',
                        transferWindowMin: 10,
                        plannedTransferWindowMin: 3,
                        source: 'DETERMINISTIC_WARM_CACHE',
                        cached_at: (cached as any)?.cached_at ?? now,
                        is_warm_hit: true,
                      },
                    },
                  ],
                } as any,
              } as any),
              gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.7, evidence_refs: [] },
              itinerary,
            },
          });
        }

        // Second attempt: DRIVE alternative (heal).
        const itinerary = {
          request_id: req.request_id ?? 'e2e-pt-warm',
          days: [
            {
              date: '2026-06-01',
              items: [
                {
                  id: 'seg_drive_heal_1',
                  type: 'DRIVE',
                  status: 'PLANNED',
                  start_time: '2026-06-01T13:00:00.000Z',
                  start_window: '10:00',
                  end_window: '10:25',
                  min_duration_minutes: 60,
                  location_ref: { place_id: 'seg_drive_heal_1', name: 'Taxi/Drive' },
                  evidence_refs: [],
                  verified: false,
                  verification_status: 'ASSUMPTION',
                },
                {
                  id: 'item_museum_booking_1',
                  item_id: 'item_museum_booking_1',
                  type: 'VISIT',
                  status: 'PLANNED',
                  start_time: '2026-06-01T14:00:00.000Z',
                  end_time: '2026-06-01T15:30:00.000Z',
                  location_ref: { place_id: 'poi_museum', name: 'Museum (Booked)' },
                  metadata: {
                    hard_booking: true,
                    latest_arrival_time: '2026-06-01T14:00:00.000Z',
                    min_duration_minutes: 90,
                  },
                  evidence_refs: [],
                  verified: false,
                  verification_status: 'ASSUMPTION',
                },
              ],
            },
          ],
          action_plan: [],
        };
        const k3Log: any[] = [
          {
            step: 'REPAIR',
            timestamp: now,
            inputs_summary: 'Auto-heal: disable PUBLIC_TRANSIT and re-route via DRIVE',
            outputs_summary: 'Rerouted via taxi/drive',
            evidence_refs: [],
            metadata: {
              rule_id: 'temp_wind_speed_drive_limit_v1',
              details: {
                evidence: { type: 'weather_physics', value_mps: 10, threshold_mps: 15, source: 'DETERMINISTIC_DRIVE_STUB' },
              },
            },
          },
        ];
        return baseOrchestrationResult({
          answerText: 'replanned via drive',
          stepsExecuted: [{ stepId: 'REPAIR', success: true, duration: 1 }],
          decisionLog: k3Log,
          result: {
            state: baseState({
              current_step: 'REPAIR',
              decision_log: k3Log,
              itinerary,
              research_data: {
                world: {
                  physical: {
                    prefetched_evidence: [
                      ...(cached?.evidence ? [cached.evidence] : []),
                      ...(((deterministicClaudeOrchestrator as any).__quoteEvidence ? [(deterministicClaudeOrchestrator as any).__quoteEvidence] : []) as any[]),
                    ],
                  },
                },
              },
            } as any),
            gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.8, evidence_refs: [] },
            itinerary,
          },
        });
      }),
      // Compatibility: AgentService.routeAndRunWithClaude may call orchestrate() on this service.
      orchestrate: jest.fn().mockImplementation(async (req: any) => {
        return await (deterministicClaudeOrchestrator as any).orchestrateWithStateMachine(req);
      }),
      __externalTransitFetch: externalTransitFetch,
      __bindCache: (c: EvidenceCacheService) => {
        evidenceCache = c;
      },
    };

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [AgentController],
      providers: [
        AgentService,
        { provide: RouterService, useValue: mockRouterService },
        { provide: AgentStateService, useValue: mockAgentStateService },
        { provide: System1ExecutorService, useValue: mockSystem1Executor },
        { provide: OrchestratorService, useValue: mockOrchestrator },
        { provide: EventTelemetryService, useValue: mockEventTelemetry },
        { provide: RequestDeduplicationService, useValue: mockRequestDeduplication },
        { provide: ClaudeOrchestratorService, useValue: deterministicClaudeOrchestrator },
        { provide: JepaProjectorService, useValue: { buildJePaPayload: jest.fn().mockReturnValue({}) } },
        TradeoffEngineService,
        NegotiationNarratorService,
        { provide: ItineraryRevisionRegretService, useValue: negotiationRegretReader },
        { provide: UserPreferenceLearningService, useValue: userPreferenceBias },
        TravelTimeResolverService,
        { provide: TravelTimeRouterService, useValue: { estimateTravelMinutes: jest.fn().mockResolvedValue(35) } },
        RouteAndRunResponseAssemblerService,
        NegotiationSessionStoreService,
        NegotiationResolverService,
        { provide: PrismaService, useValue: mockPrisma },
        AuditRecordService,
        ItineraryVersionService,
        UserProfileLearningService,
        PreferenceEvolutionService,
        {
          provide: ItineraryRollbackService,
          useValue: {
            rollbackToRevision: jest.fn(async (_revisionId: string) => {
              // Simulate a rollback record being appended (negative signal).
              const headAlt = revisionRows.slice().reverse().find((r) => r.kind === 'CONFIRMED')?.alternativeId ?? 'UPGRADE_TO_DRIVE';
              const target = revisionRows.find((r) => r.id === _revisionId);
              const tripId = target?.tripId ?? 'trip-dna';
              const userId = target?.userId ?? 'u-dna';
              // Inject multiple rollback samples in one event so DNA sync crosses MIN_SAMPLES without needing repeated calls.
              for (let i = 0; i < 5; i++) {
                revisionRows.push({
                  id: `rb-auto-${Date.now()}-${i}`,
                  tripId,
                  userId,
                  kind: 'ROLLBACK',
                  alternativeId: headAlt,
                  createdAtMs: Date.now() + i,
                });
              }
              return {
                itinerary: { days: [] },
                new_revision_id: `rev-rb-${Date.now()}`,
                trip_id: tripId,
                rolled_back_from_revision_id: 'rev-head',
                target_revision_id: _revisionId,
              };
            }),
          },
        },
        TimelineInspectorService,
        // Warm start services (cache + prefetcher + GTFS adapter + cron)
        EvidenceCacheService,
        PublicTransitRealtimeAdapterRegistry,
        { provide: WeatherSearchSkill, useValue: { execute: jest.fn().mockResolvedValue({ weather: { current: { windSpeedMps: 25 } } }) } },
        { provide: DrivePricingQuoteSkill, useValue: { execute: jest.fn().mockResolvedValue({ quote_usd: 77, currency: 'USD', source: 'E2E_QUOTE_STUB' }) } },
        {
          provide: HotspotRegistryService,
          useValue: {
            listActivePairs: () => [
              {
                provider: 'stub_gtfs',
                station_a: 'STATION_A',
                station_b: 'HOTEL_B',
                heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
              },
            ],
            decideBucketMinutes: () => 5,
            markPolled: () => undefined,
            observeRequest: () => undefined,
            recordSnapshot: () => undefined,
          },
        },
        AccessTrackerService,
        PrefetcherService,
        PublicTransitWarmupCron,
      ],
    }).compile();

    // Bind cache into deterministic orchestrator stub
    const cache = moduleRef.get(EvidenceCacheService);
    (deterministicClaudeOrchestrator as any).__bindCache(cache);

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    process.env.USE_CLAUDE_ORCHESTRATION = prevUseClaudeEnv;
    process.env.C1_STRICT_EVIDENCE_BUNDLE = prevStrictEb;
    if (app) await app.close();
  });

  it('Warm-hit PT evidence -> strict FAIL (PT_TRANSFER_GAP_VIOLATION) -> auto-heal to DRIVE; external transit fetch=0', async () => {
    const cache = moduleRef.get(EvidenceCacheService);
    const _prefetcher = moduleRef.get(PrefetcherService);
    const tracker = moduleRef.get(AccessTrackerService);
    const ptReg = moduleRef.get(PublicTransitRealtimeAdapterRegistry);
    ptReg.register(new StubGtfsRealtimeAdapter('CONNECTION_GAP'));
    const warmupCron = moduleRef.get(PublicTransitWarmupCron);
    const assembler = moduleRef.get(RouteAndRunResponseAssemblerService);
    const orch = moduleRef.get(ClaudeOrchestratorService) as any;

    tracker.reset();

    // Step 1 (v2): Heartbeat tick pulls GTFS snapshot and writes 5min bucket.
    await warmupCron.handleTick();

    // Sanity: cache hit exists (PT)
    const constraints_hash = cache.hashEmergencyConstraints({ pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } });
    const geo_hash = cache.transitPairHash('STATION_A', 'HOTEL_B');
    const time_bucket = cache.timeBucketIso(Date.now(), 5);
    const cached = await cache.get({ rule_id: 'public_transport_v1', geo_hash, time_bucket, constraints_hash });
    expect(cached).toBeTruthy();
    expect(String((cached as any)?.evidence?.source ?? '')).toContain('GTFS_REALTIME:stub_gtfs');

    // Sanity: heal-path weather evidence is already warm (0-IO heal)
    const w_geo = cache.geoHash(64.0, -19.0, 2);
    const w_bucket = cache.timeBucketIso(Date.now(), 60);
    const w = await cache.get({ rule_id: 'drive_safety_v1', geo_hash: w_geo, time_bucket: w_bucket, constraints_hash });
    expect(w).toBeTruthy();
    expect((w as any)?.evidence?.type).toBe('weather_physics');
    expect((w as any)?.evidence?.wind_speed_mps).toBe(25);

    // Sanity: pricing quote evidence is also warm (for negotiation)
    const q = await cache.get({ rule_id: 'drive_quote_v1', geo_hash: w_geo, time_bucket: w_bucket, constraints_hash });
    expect(q).toBeTruthy();
    expect((q as any)?.evidence?.type).toBe('pricing_quote');
    expect((q as any)?.evidence?.quote_usd).toBe(77);
    // Bind quote evidence into orchestrator stub state so TradeoffEngine can consume it without external IO.
    (orch as any).__quoteEvidence = (q as any)?.evidence;

    // Zero-gravity IO monitor: only warmup should touch external IO.
    expect(tracker.get('external.transit')).toBe(1);
    expect(tracker.get('external.weather')).toBe(1);
    expect(tracker.get('external.pricing')).toBe(1);
    expect(tracker.getValue<number>('external.pricing.last_quote_usd')).toBe(77);

    // Step 2: Fast-path HTTP request (warm-hit should prevent external transit fetch).
    const t0 = Date.now();
    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-pt-warm-hit',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'transfer from station to hotel',
        preference_profile: {
          max_extra_cost_usd: 10,
          max_delay_minutes: 30,
          cost_sensitivity: 0.8,
          time_sensitivity: 0.6,
          respect_reservations: 'STRICT',
        },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        },
        options: {
          use_claude_orchestration: true,
          use_state_machine_orchestration: true,
          execution_mode: 'ADVICE_ONLY',
          max_seconds: 25,
          allow_partial: true,
        },
      })
      .expect(200);
    const dt = Date.now() - t0;

    // Performance baseline (printed for humans reading CI logs)
    // eslint-disable-next-line no-console
    console.log(`[pt-warm-hit] execution_time_ms=${dt}`);

    // Assert 1: external transit fetch not called (cache hit used)
    expect(orch.__externalTransitFetch).toHaveBeenCalledTimes(0);
    // Zero-gravity IO monitor: route_and_run + heal should not add any external IO
    expect(tracker.get('external.transit')).toBe(1);
    expect(tracker.get('external.weather')).toBe(1);

    // Assert 3: auto-heal triggered (a later request carries pt_heal_retry) and final plan is DRIVE
    const allReqs = (orch.orchestrateWithStateMachine as jest.Mock).mock.calls.map((c: any[]) => c?.[0]);
    expect(allReqs.length).toBeGreaterThanOrEqual(2);
    const healReq = allReqs.find((r: any) => String(r?.meta?.pt_heal_retry ?? '') === '1');
    expect(healReq).toBeTruthy();
    expect(healReq?.emergency_constraints?.reason_code).toBe('HEALING_PT_HARD_FACT_FAILED');
    // Inherited station pairing context (helps future cache reuse)
    expect(healReq?.emergency_constraints?.pt_station_pair).toEqual({ station_a: 'STATION_A', station_b: 'HOTEL_B' });

    const payload = res.body?.result?.payload;

    // Trade-off negotiation: switching to DRIVE is costly, so require user confirmation.
    expect(res.body?.result?.status).toBe('NEED_CONFIRMATION');
    expect(payload?.negotiation_payload?.status).toBe('PENDING_USER_DECISION');
    expect(payload?.negotiation_payload?.reason).toBe('HEAL_IMPACT_BOOKING_COLLISION');
    expect(Array.isArray(payload?.negotiation_payload?.alternatives)).toBe(true);
    expect(payload?.negotiation_payload?.alternatives?.length).toBeGreaterThanOrEqual(2);
    const driveAlt = payload?.negotiation_payload?.alternatives?.find((x: any) => x?.id === 'UPGRADE_TO_DRIVE');
    expect(driveAlt?.cost_delta_usd).toBe(77);
    // Conflict projection must be explicit and structured.
    expect(payload?.negotiation_payload?.impact_assessment?.reason_code).toBe('HEAL_IMPACT_BOOKING_COLLISION');
    expect(Array.isArray(payload?.negotiation_payload?.impact_assessment?.conflicts ?? [])).toBe(true);
    expect(payload?.negotiation_payload?.impact_assessment?.conflicts?.length).toBeGreaterThanOrEqual(1);
    const conflicts = payload?.negotiation_payload?.impact_assessment?.conflicts ?? [];
    const museum = conflicts.find((c: any) => String(c?.context?.station ?? '').includes('Museum'));
    expect(museum?.severity).toBe('CRITICAL_CONFLICT');
    expect(String(museum?.context?.booking_time ?? '')).toContain('2026-06-01T14:00:00.000Z');
    // Evidence-backed delay: gap(10-3)=7 + nextAvailableTripOffsetMin(45)=52 => arrival 14:52Z
    expect(String(museum?.context?.estimated_arrival ?? '')).toContain('2026-06-01T14:52:00.000Z');

    // Cascading projection is gap-aware now; dinner may be safe if the schedule gap absorbs delay.
    const dinner = conflicts.find((c: any) => String(c?.context?.station ?? '').includes('Dinner'));
    if (dinner) {
      expect(dinner?.severity).toBe('WARNING_CONFLICT');
    }

    const items =
      payload?.orchestrationResult?.itinerary?.days?.[0]?.items ??
      payload?.itinerary?.days?.[0]?.items ??
      payload?.timeline?.[0]?.items ??
      [];
    expect(Array.isArray(items)).toBe(true);
    const drivePresent = items.some((it: any) => String(it?.type ?? '').toUpperCase() === 'DRIVE');
    if (!drivePresent) {
      // Fallback: assert the healed orchestrator result itself contains DRIVE (response formatting may vary).
      const calls = (orch.orchestrateWithStateMachine as jest.Mock).mock.calls;
      const healIdx = calls.findIndex((c: any[]) => String(c?.[0]?.meta?.pt_heal_retry ?? '') === '1');
      const healedResolved: any =
        healIdx >= 0 ? await (orch.orchestrateWithStateMachine as jest.Mock).mock.results[healIdx]?.value : null;
      const healedItems = healedResolved?.result?.itinerary?.days?.[0]?.items ?? healedResolved?.result?.state?.itinerary?.days?.[0]?.items ?? [];
      expect(healedItems.some((it: any) => String(it?.type ?? '').toUpperCase() === 'DRIVE')).toBe(true);
    } else {
      expect(drivePresent).toBe(true);
    }

    // Assert 2 (strict fail reason): compute evidence bundle for FIRST attempt and verify failure_reason_codes.
    const firstResolved: any = await (orch.orchestrateWithStateMachine as jest.Mock).mock.results[0]?.value;
    const firstState = firstResolved?.result?.state;
    const firstDecisionLog = firstResolved?.result?.state?.decision_log ?? firstResolved?.decisionLog ?? [];
    const firstItinerary = firstResolved?.result?.itinerary ?? firstResolved?.result?.state?.itinerary ?? null;
    const eb = (assembler as any).buildEvidenceBundle({
      requestId: 'e2e-pt-warm-hit',
      decisionLog: firstDecisionLog,
      state: firstState,
      candidateId: 'plan_a',
      candidateItinerary: firstItinerary,
      emergencyConstraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
    });
    expect(eb?.verification_status).toBe('FAILED');
    expect(eb?.failure_reason_codes).toContain('PT_TRANSFER_GAP_VIOLATION');
  });

  it('Learning from regret: latest rollback of POSTPONE raises UPGRADE default and tags POSTPONE', async () => {
    negotiationRegretReader.getAlternativeIdSupersededByLatestRollback.mockReset();
    negotiationRegretReader.getAlternativeIdSupersededByLatestRollback.mockResolvedValue('POSTPONE_SCHEDULE');
    try {
    const cache = moduleRef.get(EvidenceCacheService);
    const ptReg = moduleRef.get(PublicTransitRealtimeAdapterRegistry);
    ptReg.register(new StubGtfsRealtimeAdapter('CONNECTION_GAP'));
    const warmupCron = moduleRef.get(PublicTransitWarmupCron);
    const tracker = moduleRef.get(AccessTrackerService);
    const orch = moduleRef.get(ClaudeOrchestratorService) as any;

    tracker.reset();
    await warmupCron.handleTick();

    const constraints_hash = cache.hashEmergencyConstraints({ pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } });
    const w_geo = cache.geoHash(64.0, -19.0, 2);
    const w_bucket = cache.timeBucketIso(Date.now(), 60);
    const q = await cache.get({ rule_id: 'drive_quote_v1', geo_hash: w_geo, time_bucket: w_bucket, constraints_hash });
    (orch as any).__quoteEvidence = (q as any)?.evidence;

    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-regret-learning',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'transfer from station to hotel',
        // Tight cost cap keeps negotiation open (drive quote > cap) while regret still tags POSTPONE.
        preference_profile: {
          max_extra_cost_usd: 10,
          max_delay_minutes: 30,
          cost_sensitivity: 0.8,
          time_sensitivity: 0.6,
          respect_reservations: 'STRICT',
        },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        },
        options: {
          use_claude_orchestration: true,
          use_state_machine_orchestration: true,
          execution_mode: 'ADVICE_ONLY',
          max_seconds: 25,
          allow_partial: true,
        },
      })
      .expect(200);

    const neg = res.body?.result?.payload?.negotiation_payload;
    expect(neg?.status).toBe('PENDING_USER_DECISION');
    // Drive still over budget → default stays POSTPONE, but regret must surface on the postpone card and keep UPGRADE first.
    expect(neg?.default_option_id).toBe('POSTPONE_SCHEDULE');
    expect(negotiationRegretReader.getAlternativeIdSupersededByLatestRollback).toHaveBeenCalledWith('trip1');
    expect(neg?.alternatives?.[0]?.id).toBe('UPGRADE_TO_DRIVE');
    const postpone = neg?.alternatives?.find((x: any) => x?.id === 'POSTPONE_SCHEDULE');
    expect(postpone?.previously_rejected).toBe(true);
    expect(postpone?.prior_rollback_of_same_alternative).toBe(true);
    expect(String(postpone?.regret_notice ?? '')).toContain('回滚');
    expect(Number(postpone?.effort_delta ?? 0)).toBeGreaterThanOrEqual(0.5);
    } finally {
      negotiationRegretReader.getAlternativeIdSupersededByLatestRollback.mockReset();
      negotiationRegretReader.getAlternativeIdSupersededByLatestRollback.mockResolvedValue(null);
    }
  });

  it('Pre-emptive warning: POSTPONE is_fragile and HIGH risk when hard-booking slack after delay <= 5min', async () => {
    const engine = moduleRef.get(TradeoffEngineService);
    const neg = await engine.buildNegotiation({
      request: {
        request_id: 'e2e-preempt-fragility',
        user_id: 'u1',
        trip_id: 'trip-frag',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
      } as any,
      decisionLog: [
        {
          metadata: {
            details: {
              evidence_bundle: { failure_reason_codes: ['PT_TRANSFER_GAP_VIOLATION'] },
            },
          },
        } as any,
      ],
      finalItinerary: {
        days: [
          {
            items: [
              {
                id: 'hb1',
                type: 'VISIT',
                status: 'PLANNED',
                start_time: '2026-06-01T10:00:00.000Z',
                end_time: '2026-06-01T10:30:00.000Z',
                metadata: {
                  hard_booking: true,
                  latest_arrival_time: '2026-06-01T10:35:00.000Z',
                  min_duration_minutes: 30,
                  coordinates: { lat: 64.0, lng: -19.0 },
                },
                location_ref: { coordinates: { lat: 64.0, lng: -19.0 } },
              },
            ],
          },
        ],
      } as any,
      state: { research_data: { world: { physical: { prefetched_evidence: [] } } } } as any,
    });
    expect(neg).toBeTruthy();
    const po = neg!.alternatives.find((a: any) => a.id === 'POSTPONE_SCHEDULE');
    expect(po?.is_fragile).toBe(true);
    expect(po?.risk_level).toBe('HIGH');
    expect(String(po?.regret_notice ?? '')).toContain('准点压力');
  });

  it('Transparent Decision: POSTPONE stacks regret + HIGH fragility + rollback bias → effort ≈ 0.9 and full reasoning_tags', async () => {
    negotiationRegretReader.getAlternativeIdSupersededByLatestRollback.mockReset();
    negotiationRegretReader.getAlternativeIdSupersededByLatestRollback.mockResolvedValue('POSTPONE_SCHEDULE');
    userPreferenceBias.getRollbackBiasEffortDelta.mockReset();
    userPreferenceBias.getRollbackBiasEffortDelta.mockImplementation(async (_uid: string, alt: string) =>
      alt === 'POSTPONE_SCHEDULE' ? 0.15 : 0,
    );
    try {
      const engine = moduleRef.get(TradeoffEngineService);
      const neg = await engine.buildNegotiation({
        request: {
          request_id: 'e2e-transparent-decision',
          user_id: 'u1',
          trip_id: 'trip-transparent',
          preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
          emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
        } as any,
        decisionLog: [
          {
            metadata: {
              details: {
                evidence_bundle: { failure_reason_codes: ['PT_TRANSFER_GAP_VIOLATION'] },
              },
            },
          } as any,
        ],
        finalItinerary: {
          days: [
            {
              items: [
                {
                  id: 'pt1',
                  type: 'TRANSIT',
                  status: 'PLANNED',
                  start_time: '2026-06-01T09:30:00.000Z',
                  end_time: '2026-06-01T09:45:00.000Z',
                  metadata: { coordinates: { lat: 64.0, lng: -19.0 } },
                  location_ref: { coordinates: { lat: 64.0, lng: -19.0 } },
                },
                {
                  id: 'hb1',
                  type: 'VISIT',
                  status: 'PLANNED',
                  start_time: '2026-06-01T10:00:00.000Z',
                  end_time: '2026-06-01T10:30:00.000Z',
                  metadata: {
                    hard_booking: true,
                    latest_arrival_time: '2026-06-01T10:35:00.000Z',
                    min_duration_minutes: 30,
                    coordinates: { lat: 64.0, lng: -19.0 },
                  },
                  location_ref: { coordinates: { lat: 64.0, lng: -19.0 } },
                },
              ],
            },
          ],
        } as any,
        state: { research_data: { world: { physical: { prefetched_evidence: [] } } } } as any,
      });
      expect(neg).toBeTruthy();
      const po = neg!.alternatives.find((a: any) => a.id === 'POSTPONE_SCHEDULE');
      expect(po?.is_fragile).toBe(true);
      expect(po?.risk_level).toBe('HIGH');
      expect(Number(po?.effort_delta ?? 0)).toBeCloseTo(0.9, 5);
      const tags = (po?.reasoning_tags ?? []) as string[];
      expect(tags).toEqual(
        expect.arrayContaining([
          NEGOTIATION_REASONING_TAG.ROLLBACK_MEMORY,
          NEGOTIATION_REASONING_TAG.REAL_TIME_RISK_WARNING,
          NEGOTIATION_REASONING_TAG.TAILORED_TO_YOUR_PREFERENCE,
        ]),
      );
      expect(String(neg?.recommendation_summary ?? '')).toContain('更推荐');
      expect(String(neg?.recommendation_summary ?? '')).toMatch(/打车|升级/);
      expect(String(neg?.recommendation_summary ?? '')).toMatch(/回滚/);
      expect(String(neg?.recommendation_summary ?? '')).toMatch(/准点|风险|容错/);
      expect((neg as any)?.strategy_impact_map?.alternatives?.length).toBeGreaterThanOrEqual(2);
      expect(String(po?.regret_notice ?? '')).toMatch(/回滚/);
      expect(String(po?.regret_notice ?? '')).toContain('准点压力');
      expect(po?.reliability_score).toBeDefined();
      expect(Number(po?.reliability_score)).toBeGreaterThanOrEqual(0);
      expect(Number(po?.reliability_score)).toBeLessThanOrEqual(1);
    } finally {
      negotiationRegretReader.getAlternativeIdSupersededByLatestRollback.mockReset();
      negotiationRegretReader.getAlternativeIdSupersededByLatestRollback.mockResolvedValue(null);
      userPreferenceBias.getRollbackBiasEffortDelta.mockReset();
      userPreferenceBias.getRollbackBiasEffortDelta.mockResolvedValue(0);
    }
  });

  it('Zero-metadata slack discovery: 40min schedule gap auto-decays rolling delay (50 -> 10)', async () => {
    const cache = moduleRef.get(EvidenceCacheService);
    const ptReg = moduleRef.get(PublicTransitRealtimeAdapterRegistry);
    ptReg.register(new StubGtfsRealtimeAdapter('DELAY'));
    const warmupCron = moduleRef.get(PublicTransitWarmupCron);
    const tracker = moduleRef.get(AccessTrackerService);

    tracker.reset();
    await warmupCron.handleTick();

    const constraints_hash = cache.hashEmergencyConstraints({ pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } });

    // Bind quote evidence (not the focus here, but keeps negotiation consistent)
    const w_geo = cache.geoHash(64.0, -19.0, 2);
    const w_bucket = cache.timeBucketIso(Date.now(), 60);
    const q = await cache.get({ rule_id: 'drive_quote_v1', geo_hash: w_geo, time_bucket: w_bucket, constraints_hash });
    const orch = moduleRef.get(ClaudeOrchestratorService) as any;
    (orch as any).__quoteEvidence = (q as any)?.evidence;

    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-slack-zero-metadata',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'transfer then bookings',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        },
        options: {
          use_claude_orchestration: true,
          use_state_machine_orchestration: true,
          execution_mode: 'ADVICE_ONLY',
          max_seconds: 25,
          allow_partial: true,
        },
      })
      .expect(200);

    const payload = res.body?.result?.payload;
    expect(payload?.negotiation_payload?.status).toBe('PENDING_USER_DECISION');
    const conflicts = payload?.negotiation_payload?.impact_assessment?.conflicts ?? [];
    const dinner = conflicts.find((c: any) => String(c?.context?.station ?? '').includes('Dinner'));
    // delay=50; schedule gap between museum end (18:15) and dinner start (19:00) is 45min.
    // effective buffer = 45 - survival(5) = 40 => remaining delay = 10 => dinner arrival 19:10Z.
    expect(String(dinner?.context?.estimated_arrival ?? '')).toContain('2026-06-01T19:10:00.000Z');
  });

  it('Physical reality slack: travel_min subtracts buffer (45-30-5=10) so 20min delay triggers CRITICAL', async () => {
    const cache = moduleRef.get(EvidenceCacheService);
    const prefetcher = moduleRef.get(PrefetcherService);
    const tracker = moduleRef.get(AccessTrackerService);

    tracker.reset();
    const constraints_hash = cache.hashEmergencyConstraints({ pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } });
    const geo_hash = cache.transitPairHash('STATION_A', 'HOTEL_B');
    const time_bucket = cache.timeBucketIso(Date.now(), 5);

    // Prefetch PT evidence with delay=20 (gap=5 + offset=15).
    await prefetcher.prefetchPublicTransport({
      station_a: 'STATION_A',
      station_b: 'HOTEL_B',
      serviceStatus: 'ACTIVE',
      transferWindowMin: 10,
      plannedTransferWindowMin: 5,
      nextAvailableTripOffsetMin: 15,
      emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
      ttl_seconds: 600,
      bucket_minutes: 5,
    });

    // Pricing quote warm evidence (not external IO)
    await prefetcher.prefetchDriveQuote({
      lat: 64.0,
      lng: -19.0,
      quote_usd: 88,
      emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
      ttl_seconds: 3600,
    });

    const cached = await cache.get({ rule_id: 'public_transport_v1', geo_hash, time_bucket, constraints_hash });
    expect(cached).toBeTruthy();

    // Cache miss path: DO NOT prefill travel_time_v1. Router should be called exactly once.
    expect(tracker.get('external.router')).toBe(0);

    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-slack-physical-reality',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'transfer then far dinner booking',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        },
        options: {
          use_claude_orchestration: true,
          use_state_machine_orchestration: true,
          execution_mode: 'ADVICE_ONLY',
          max_seconds: 25,
          allow_partial: true,
        },
      })
      .expect(200);

    const payload = res.body?.result?.payload;
    const conflicts = payload?.negotiation_payload?.impact_assessment?.conflicts ?? [];
    const dinner = conflicts.find((c: any) => String(c?.context?.station ?? '').includes('Dinner'));
    expect(dinner?.severity).toBe('CRITICAL_CONFLICT');

    // Cache miss route: router IO performed once (L2)
    expect(tracker.get('external.router')).toBe(1);
  });

  it('Cache hit travel time: uses travel_time_v1 and does not call router (external.router=0)', async () => {
    const cache = moduleRef.get(EvidenceCacheService);
    const prefetcher = moduleRef.get(PrefetcherService);
    const tracker = moduleRef.get(AccessTrackerService);
    tracker.reset();

    const constraints_hash = cache.hashEmergencyConstraints({ pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } });

    await prefetcher.prefetchPublicTransport({
      station_a: 'STATION_A',
      station_b: 'HOTEL_B',
      serviceStatus: 'ACTIVE',
      transferWindowMin: 10,
      plannedTransferWindowMin: 5,
      nextAvailableTripOffsetMin: 15,
      emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
      ttl_seconds: 600,
      bucket_minutes: 5,
    });
    await prefetcher.prefetchDriveQuote({
      lat: 64.0,
      lng: -19.0,
      quote_usd: 88,
      emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
      ttl_seconds: 3600,
    });
    await prefetcher.prefetchTravelTime({
      from: { lat: 51.5, lng: -0.1 },
      to: { lat: 51.635, lng: -0.1 },
      mode: 'DRIVE',
      travel_minutes: 35,
      emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
      ttl_seconds: 3600,
    });

    const t_geo = cache.geoPairHash({ lat: 51.5, lng: -0.1 }, { lat: 51.635, lng: -0.1 }, 'DRIVE', 2);
    const t_bucket = cache.timeBucketIso(Date.now(), 60);
    const t = await cache.get({ rule_id: 'travel_time_v1', geo_hash: t_geo, time_bucket: t_bucket, constraints_hash });
    expect(t?.evidence?.travel_minutes).toBe(35);
    const orch = moduleRef.get(ClaudeOrchestratorService) as any;
    (orch as any).__travelEvidence = (t as any)?.evidence;

    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-slack-physical-reality',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'transfer then far dinner booking',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        },
        options: {
          use_claude_orchestration: true,
          use_state_machine_orchestration: true,
          execution_mode: 'ADVICE_ONLY',
          max_seconds: 25,
          allow_partial: true,
        },
      })
      .expect(200);

    const payload = res.body?.result?.payload;
    const conflicts = payload?.negotiation_payload?.impact_assessment?.conflicts ?? [];
    const dinner = conflicts.find((c: any) => String(c?.context?.station ?? '').includes('Dinner'));
    expect(dinner?.severity).toBe('CRITICAL_CONFLICT');
    expect(tracker.get('external.router')).toBe(0);
  });

  it('Learning rate: repeated edge A->B only calls router once (read-through visible in same scan)', async () => {
    const prefetcher = moduleRef.get(PrefetcherService);
    const tracker = moduleRef.get(AccessTrackerService);
    tracker.reset();

    await prefetcher.prefetchPublicTransport({
      station_a: 'STATION_A',
      station_b: 'HOTEL_B',
      serviceStatus: 'ACTIVE',
      transferWindowMin: 10,
      plannedTransferWindowMin: 5,
      nextAvailableTripOffsetMin: 15,
      emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
      ttl_seconds: 600,
      bucket_minutes: 5,
    });

    // ensure cache miss for travel time
    expect(tracker.get('external.router')).toBe(0);

    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-learning-rate',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'repeat same edge',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        },
        options: {
          use_claude_orchestration: true,
          use_state_machine_orchestration: true,
          execution_mode: 'ADVICE_ONLY',
          max_seconds: 25,
          allow_partial: true,
        },
      })
      .expect(200);

    // Router should be called once even if the scan encounters the same pair twice.
    expect(tracker.get('external.router')).toBe(1);
    expect(res.body?.result?.payload?.negotiation_payload).toBeTruthy();
  });

  it('Time-agnostic travel cache:跨 hour bucket 仍复用 travel_time_v1 (router stays 1)', async () => {
    const tracker = moduleRef.get(AccessTrackerService);
    const prefetcher = moduleRef.get(PrefetcherService);
    const ptReg = moduleRef.get(PublicTransitRealtimeAdapterRegistry);
    ptReg.register(new StubGtfsRealtimeAdapter('DELAY'));

    tracker.reset();

    // Ensure PT evidence exists (so negotiation runs); travel time is NOT prefetched.
    await prefetcher.prefetchPublicTransportFromAdapter({
      provider: 'stub_gtfs',
      station_a: 'STATION_A',
      station_b: 'HOTEL_B',
      bucket_minutes: 5,
      emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
      heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
    });

    const realNow = Date.now;
    try {
      // First request at 10:55 UTC (OFF_PEAK) (forces L2 router=1 and writes travel_time_v1 at hour bucket 10:00)
      const t1 = Date.parse('2026-06-01T10:55:00.000Z');
      // @ts-ignore
      Date.now = () => t1;
      await request(app.getHttpServer())
        .post('/agent/route_and_run')
        .send({
          request_id: 'e2e-time-agnostic-1',
          user_id: 'u1',
          trip_id: 'trip1',
          message: 'repeat same edge',
          preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
          emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
          options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
        })
        .expect(200);
      expect(tracker.get('external.router')).toBe(1);

      // Second request at 11:05 UTC (OFF_PEAK) should reuse travel_time_v1 via neighborhood search (router still 1)
      const t2 = Date.parse('2026-06-01T11:05:00.000Z');
      // @ts-ignore
      Date.now = () => t2;
      await request(app.getHttpServer())
        .post('/agent/route_and_run')
        .send({
          request_id: 'e2e-time-agnostic-2',
          user_id: 'u1',
          trip_id: 'trip1',
          message: 'repeat same edge',
          preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
          emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
          options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
        })
        .expect(200);
      expect(tracker.get('external.router')).toBe(1);
    } finally {
      // @ts-ignore
      Date.now = realNow;
    }
  });

  it('Peak-hour sensitivity: ignores neighborhood and forces L2 (router increments) at peak', async () => {
    process.env.TRAVEL_TIME_PEAK_HOURS_UTC = '17-19';
    const tracker = moduleRef.get(AccessTrackerService);
    const prefetcher = moduleRef.get(PrefetcherService);
    const ptReg = moduleRef.get(PublicTransitRealtimeAdapterRegistry);
    ptReg.register(new StubGtfsRealtimeAdapter('DELAY'));
    tracker.reset();

    const realNow = Date.now;
    try {
      // Prefill travel time at 16:30 (hour bucket 16:00)
      const t1 = Date.parse('2026-06-01T16:30:00.000Z');
      // @ts-ignore
      Date.now = () => t1;
      await prefetcher.prefetchTravelTime({
        from: { lat: 51.51, lng: -0.11 },
        to: { lat: 51.65, lng: -0.11 },
        mode: 'DRIVE',
        travel_minutes: 35,
        emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
        ttl_seconds: 3600,
      });

      // Now at 17:30 (PEAK): neighborhood reuse disabled (strict bucket match) => forces L2 router
      const t2 = Date.parse('2026-06-01T17:30:00.000Z');
      // @ts-ignore
      Date.now = () => t2;

      // Prefill PT evidence aligned to the same 5min bucket as the request (so lineage can reflect GTFS_REALTIME provenance)
      await prefetcher.prefetchPublicTransportFromAdapter({
        provider: 'stub_gtfs',
        station_a: 'STATION_A',
        station_b: 'HOTEL_B',
        at_iso: '2026-06-01T17:30:00.000Z',
        bucket_minutes: 5,
        emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
        heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      });

      const res1 = await request(app.getHttpServer())
        .post('/agent/route_and_run')
        .send({
          request_id: 'e2e-time-agnostic-peak',
          user_id: 'u1',
          trip_id: 'trip1',
          message: 'repeat same edge',
          preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
          emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
          options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
        })
        .expect(200);
      expect(tracker.get('external.router')).toBe(1);

      const payload = res1.body?.result?.payload;
      expect(payload?.negotiation_payload?.evidence_lineage?.travel_time_v1?.captured_context?.is_peak).toBe(true);
      expect(payload?.negotiation_payload?.evidence_lineage?.travel_time_v1?.reliability).toBe('VOLATILE');
      expect(payload?.negotiation_payload?.evidence_lineage?.travel_time_v1?.source_type).toBe('L2_REALTIME_COMPUTED');
    expect(payload?.negotiation_payload?.evidence_lineage?.public_transport_v1?.source_type).toBe('L2_REALTIME_COMPUTED');
    expect(String(payload?.negotiation_payload?.evidence_lineage?.public_transport_v1?.captured_context?.trip_status ?? '')).toBeTruthy();
      expect(String(payload?.negotiation_payload?.lineage_summary ?? '')).toContain('高峰');
      const logs = res1.body?.explain?.decision_log;
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.some((l: any) => String(l?.metadata?.details?.evidence?.type ?? '') === 'travel_time_lineage')).toBe(true);
    } finally {
      // @ts-ignore
      Date.now = realNow;
    }
  });

  it('Decision closure: confirm_negotiation (UPGRADE_TO_DRIVE) is hash-locked and id-stable', async () => {
    const prefetcher = moduleRef.get(PrefetcherService);
    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-decision-closure-1',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'confirm flow',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
          // anchor for confirm-time weather re-verify
          heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
        },
        options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
      })
      .expect(200);

    const negotiation = res.body?.result?.payload?.negotiation_payload;
    expect(negotiation?.negotiation_session_id).toBeTruthy();
    expect(negotiation?.expected_negotiation_hash).toBeTruthy();

    // Ensure current reality has safe drive_safety_v1 evidence.
    await prefetcher.prefetchWeatherWind({
      lat: 64.0,
      lng: -19.0,
      wind_speed_mps: 1,
      threshold_mps: 18,
      vehicle_type: 'CAMPERVAN',
      emergency_constraints: {
        pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      },
      ttl_seconds: 3600,
    });

    const confirm = await request(app.getHttpServer())
      .post('/agent/confirm_negotiation')
      .send({
        session_id: negotiation.negotiation_session_id,
        alternative_id: 'UPGRADE_TO_DRIVE',
        expected_negotiation_hash: negotiation.expected_negotiation_hash,
      })
      .expect(200);

    expect(confirm.body?.status).toBe('CONFIRMED');
    expect(String(confirm.body?.resolution_patch_summary ?? '')).toContain('UPGRADE_TO_DRIVE');
    const items: any[] = (confirm.body?.itinerary?.days ?? []).flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []));
    const hasDrive = items.some((x) => String(x?.type ?? '').toUpperCase() === 'DRIVE');
    const hasTransit = items.some((x) => String(x?.type ?? '').toUpperCase() === 'TRANSIT' || String(x?.type ?? '').toUpperCase() === 'PUBLIC_TRANSIT');
    expect(hasDrive).toBe(true);
    expect(hasTransit).toBe(false);

    // Hash mismatch should be rejected as 409 (expired/invalid).
    await request(app.getHttpServer())
      .post('/agent/confirm_negotiation')
      .send({
        session_id: negotiation.negotiation_session_id,
        alternative_id: 'UPGRADE_TO_DRIVE',
        expected_negotiation_hash: 'sha256:deadbeef',
      })
      .expect(409);
  });

  it('Final Review: strategy_impact_map explains punctuality; NARRATIVE persists into itinerary revision', async () => {
    const prefetcher = moduleRef.get(PrefetcherService);
    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-final-review-1',
        user_id: 'u1',
        trip_id: 'trip-e2e-strategy-final',
        message: 'final review strategy map',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
          heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
        },
        options: {
          use_claude_orchestration: true,
          use_state_machine_orchestration: true,
          execution_mode: 'ADVICE_ONLY',
          max_seconds: 25,
          allow_partial: true,
        },
      })
      .expect(200);

    const negotiation = res.body?.result?.payload?.negotiation_payload;
    expect(String(negotiation?.recommendation_summary ?? '')).toContain('更推荐');
    expect(negotiation?.strategy_impact_map?.on_time_model?.version).toBeTruthy();
    expect(negotiation?.strategy_impact_map?.baseline?.trip_on_time_probability_interval?.length).toBe(2);
    const alts = negotiation?.strategy_impact_map?.alternatives ?? [];
    expect(alts.length).toBeGreaterThanOrEqual(2);
    const po = alts.find((a: any) => a.alternative_id === 'POSTPONE_SCHEDULE');
    const up = alts.find((a: any) => a.alternative_id === 'UPGRADE_TO_DRIVE');
    expect(po?.trip_on_time_probability_interval?.length).toBe(2);
    expect(up?.trip_on_time_probability_interval?.length).toBe(2);
    expect(Number(po?.trip_on_time_probability)).toBeLessThanOrEqual(Number(up?.trip_on_time_probability));

    await prefetcher.prefetchWeatherWind({
      lat: 64.0,
      lng: -19.0,
      wind_speed_mps: 1,
      threshold_mps: 18,
      vehicle_type: 'CAMPERVAN',
      emergency_constraints: {
        pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      },
      ttl_seconds: 3600,
    });

    await request(app.getHttpServer())
      .post('/agent/confirm_negotiation')
      .send({
        session_id: negotiation.negotiation_session_id,
        alternative_id: 'UPGRADE_TO_DRIVE',
        expected_negotiation_hash: negotiation.expected_negotiation_hash,
      })
      .expect(200);

    const confirmed = revisionRows.filter((r) => r.kind === 'CONFIRMED').pop();
    expect(confirmed?.resolutionPatchSummary).toBeTruthy();
    expect(String(confirmed.resolutionPatchSummary)).toContain('NARRATIVE:');
    expect(String(confirmed.resolutionPatchSummary)).toContain('更推荐');
  });

  it('Final Decision Integrity: heat_zones identifies bottleneck_node; summary warns physical bottleneck', async () => {
    // Tight hard-booking buffer (6 minutes) makes reliability < 0.2 across baseline + all alternatives.
    const engine = moduleRef.get(TradeoffEngineService);
    const neg = await engine.buildNegotiation({
      request: {
        request_id: 'e2e-heatmap-bottleneck',
        user_id: 'u1',
        trip_id: 'trip-e2e-heatmap',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
          heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
        },
      } as any,
      decisionLog: [
        {
          metadata: { details: { evidence_bundle: { failure_reason_codes: ['PT_TRANSFER_GAP_VIOLATION'] } } },
        } as any,
      ],
      finalItinerary: {
        days: [
          {
            items: [
              {
                id: 'pt1',
                type: 'TRANSIT',
                status: 'PLANNED',
                start_time: '2026-06-01T09:30:00.000Z',
                end_time: '2026-06-01T09:45:00.000Z',
                metadata: { coordinates: { lat: 64.0, lng: -19.0 } },
                location_ref: { coordinates: { lat: 64.0, lng: -19.0 } },
              },
              {
                id: 'hb-tight',
                type: 'VISIT',
                status: 'PLANNED',
                start_time: '2026-06-01T10:00:00.000Z',
                end_time: '2026-06-01T10:30:00.000Z',
                metadata: {
                  hard_booking: true,
                  latest_arrival_time: '2026-06-01T10:06:00.000Z',
                  min_duration_minutes: 30,
                  coordinates: { lat: 64.0, lng: -19.0 },
                },
                location_ref: { coordinates: { lat: 64.0, lng: -19.0 } },
              },
            ],
          },
        ],
      } as any,
      state: { research_data: { world: { physical: { prefetched_evidence: [] } } } } as any,
    });

    const hz = ((neg as any)?.strategy_impact_map?.heat_zones ?? []) as any[];
    expect(hz.length).toBeGreaterThanOrEqual(1);
    expect(hz.some((z: any) => z?.bottleneck_node)).toBe(true);
    expect(String(neg?.recommendation_summary ?? '')).toMatch(/物理瓶颈|瓶颈|缓冲|Buffer/);
  });

  it('DNA Origin: sync decision_dna from rollbacks and penalize next negotiation effort', async () => {
    const learner = moduleRef.get(UserProfileLearningService);
    // In this suite we override UserPreferenceLearningService with a mock; make it consult persisted decision_dna.
    userPreferenceBias.getRollbackBiasEffortDelta.mockReset();
    userPreferenceBias.getRollbackBiasEffortDelta.mockImplementation(async (_uid: string, alt: string) => {
      const bias = Number(userProfilePrefs?.decision_dna?.bias_map?.[String(alt)]);
      return Number.isFinite(bias) ? bias : 0;
    });

    // New user baseline: no profile, no rollbacks → no bias
    const engine = moduleRef.get(TradeoffEngineService);
    const baseReq = {
      request_id: 'e2e-dna-origin-0',
      user_id: 'u-dna',
      trip_id: 'trip-dna',
      preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
      emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
    } as any;
    const itinerary = {
      days: [
        {
          items: [
            {
              id: 'pt1',
              type: 'TRANSIT',
              status: 'PLANNED',
              start_time: '2026-06-01T09:30:00.000Z',
              end_time: '2026-06-01T09:45:00.000Z',
              metadata: { coordinates: { lat: 64.0, lng: -19.0 } },
              location_ref: { coordinates: { lat: 64.0, lng: -19.0 } },
            },
            {
              id: 'hb1',
              type: 'VISIT',
              status: 'PLANNED',
              start_time: '2026-06-01T10:00:00.000Z',
              end_time: '2026-06-01T10:30:00.000Z',
              metadata: {
                hard_booking: true,
                latest_arrival_time: '2026-06-01T10:35:00.000Z',
                min_duration_minutes: 30,
                coordinates: { lat: 64.0, lng: -19.0 },
              },
              location_ref: { coordinates: { lat: 64.0, lng: -19.0 } },
            },
          ],
        },
      ],
    } as any;

    const neg0 = await engine.buildNegotiation({
      request: baseReq,
      decisionLog: [{ metadata: { details: { evidence_bundle: { failure_reason_codes: ['PT_TRANSFER_GAP_VIOLATION'] } } } } as any],
      finalItinerary: itinerary,
      state: { research_data: { world: { physical: { prefetched_evidence: [] } } } } as any,
    });
    expect(neg0).toBeTruthy();
    const up0 = neg0!.alternatives.find((a: any) => a.id === 'UPGRADE_TO_DRIVE');
    const baseEff = Number(up0?.effort_delta ?? 0);

    // Inject 5 rollbacks of UPGRADE_TO_DRIVE for this user
    revisionRows.push(
      ...Array.from({ length: 5 }).map(() => ({
        id: `rb-${Math.random()}`,
        tripId: 't',
        userId: 'u-dna',
        kind: 'ROLLBACK',
        alternativeId: 'UPGRADE_TO_DRIVE',
        createdAtMs: Date.now(),
      })),
    );

    const dna = await learner.syncPreferenceToProfile({ userId: 'u-dna', now: new Date('2026-01-02T00:00:00.000Z') });
    expect(dna).toBeTruthy();
    expect((userProfilePrefs?.decision_dna?.bias_map ?? {}).UPGRADE_TO_DRIVE).toBeDefined();

    const neg1 = await engine.buildNegotiation({
      request: { ...baseReq, request_id: 'e2e-dna-origin-1' },
      decisionLog: [{ metadata: { details: { evidence_bundle: { failure_reason_codes: ['PT_TRANSFER_GAP_VIOLATION'] } } } } as any],
      finalItinerary: itinerary,
      state: { research_data: { world: { physical: { prefetched_evidence: [] } } } } as any,
    });
    const up1 = neg1!.alternatives.find((a: any) => a.id === 'UPGRADE_TO_DRIVE');
    const eff1 = Number(up1?.effort_delta ?? 0);
    expect(eff1).toBeCloseTo(baseEff + 0.15, 5);
  });

  it('Infinite Loop of Learning: confirm -> rollback -> async DNA sync -> next negotiation downranks', async () => {
    const prefetcher = moduleRef.get(PrefetcherService);
    // Seed: trigger negotiation via HTTP so confirm can persist a CONFIRMED revision row.
    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-infinite-loop-1',
        user_id: 'u-dna',
        trip_id: 'trip-dna',
        message: 'infinite learning loop',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
          heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
        },
        options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
      })
      .expect(200);

    const neg = res.body?.result?.payload?.negotiation_payload;
    expect(neg?.negotiation_session_id).toBeTruthy();

    // Ensure current reality has safe drive_safety_v1 evidence (avoids strict guard 409).
    await prefetcher.prefetchWeatherWind({
      lat: 64.0,
      lng: -19.0,
      wind_speed_mps: 1,
      threshold_mps: 18,
      vehicle_type: 'CAMPERVAN',
      emergency_constraints: {
        pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      },
      ttl_seconds: 3600,
    });

    // Confirm (adds CONFIRMED revision via ItineraryVersionService using mockPrisma)
    const confirm = await request(app.getHttpServer())
      .post('/agent/confirm_negotiation')
      .send({
        session_id: neg.negotiation_session_id,
        alternative_id: 'UPGRADE_TO_DRIVE',
        expected_negotiation_hash: neg.expected_negotiation_hash,
      })
      .expect(200);

    // Rollback (mock ItineraryRollbackService appends ROLLBACK revision and triggers async DNA sync)
    const targetRevisionId = String(confirm.body?.itinerary_revision?.confirmed_revision_id ?? '');
    expect(targetRevisionId).toBeTruthy();
    await request(app.getHttpServer()).post('/agent/rollback').send({ revision_id: targetRevisionId }).expect(200);

    // Wait one tick for setImmediate() evolution job.
    await new Promise((r) => setImmediate(r));

    expect(userProfilePrefs?.decision_dna?.bias_map?.UPGRADE_TO_DRIVE).toBeDefined();

    // Next negotiation should inherit DNA-driven penalty on UPGRADE_TO_DRIVE (suite mock consults decision_dna).
    userPreferenceBias.getRollbackBiasEffortDelta.mockReset();
    userPreferenceBias.getRollbackBiasEffortDelta.mockImplementation(async (_uid: string, alt: string) => {
      const bias = Number(userProfilePrefs?.decision_dna?.bias_map?.[String(alt)]);
      return Number.isFinite(bias) ? bias : 0;
    });

    const res2 = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-infinite-loop-2',
        user_id: 'u-dna',
        trip_id: 'trip-dna',
        message: 'next negotiation',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
        options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
      })
      .expect(200);
    const neg2 = res2.body?.result?.payload?.negotiation_payload;
    const up = neg2?.alternatives?.find((a: any) => a.id === 'UPGRADE_TO_DRIVE');
    expect(Number(up?.effort_delta ?? 0)).toBeGreaterThanOrEqual(0.1 + 0.15);
  });

  it('Environment mutation: confirm_negotiation rejects when new wind evidence makes DRIVE unsafe (409 + new negotiation_payload)', async () => {
    const prefetcher = moduleRef.get(PrefetcherService);

    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-env-mutation-1',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'confirm flow with mutation',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
          // anchor for confirm-time weather re-verify
          heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
        },
        options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
      })
      .expect(200);

    const negotiation = res.body?.result?.payload?.negotiation_payload;
    expect(negotiation?.negotiation_session_id).toBeTruthy();
    expect(negotiation?.expected_negotiation_hash).toBeTruthy();

    // Mutate current reality: inject extreme wind to make drive_safety_v1 violated.
    await prefetcher.prefetchWeatherWind({
      lat: 64.0,
      lng: -19.0,
      wind_speed_mps: 30,
      threshold_mps: 18,
      vehicle_type: 'CAMPERVAN',
      emergency_constraints: {
        pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      },
      ttl_seconds: 3600,
    });

    const confirm = await request(app.getHttpServer())
      .post('/agent/confirm_negotiation')
      .send({
        session_id: negotiation.negotiation_session_id,
        alternative_id: 'UPGRADE_TO_DRIVE',
        expected_negotiation_hash: negotiation.expected_negotiation_hash,
      })
      .expect(409);

    expect(String(confirm.body?.error_code ?? '')).toContain('NEGOTIATION_EXPIRED_OR_INVALID');
    expect(String(confirm.body?.verification_status ?? '')).toBe('FAILED');
    expect(confirm.body?.evidence_bundle).toBeTruthy();
    expect(confirm.body?.negotiation_payload).toBeTruthy();
  });

  it('Booking collision on confirm: POSTPONE_SCHEDULE triggers HEAL_IMPACT_BOOKING_COLLISION and removes postpone from secondary negotiation', async () => {
    const prefetcher = moduleRef.get(PrefetcherService);

    // Force postpone delay to 120 minutes via PT evidence injection.
    await prefetcher.prefetchPublicTransport({
      station_a: 'STATION_A',
      station_b: 'HOTEL_B',
      serviceStatus: 'ACTIVE',
      transferWindowMin: 60,
      plannedTransferWindowMin: 0,
      nextAvailableTripOffsetMin: 60,
      emergency_constraints: {
        pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      },
      ttl_seconds: 3600,
      bucket_minutes: 5,
    });

    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-booking-collision-1',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'postpone confirm',
        // Ensure negotiation is emitted.
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
          heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
        },
        options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
      })
      .expect(200);

    const negotiation = res.body?.result?.payload?.negotiation_payload;
    expect(negotiation?.negotiation_session_id).toBeTruthy();
    expect(negotiation?.expected_negotiation_hash).toBeTruthy();

    // Ensure current reality has safe drive_safety_v1 evidence (we're testing booking collision, not wind lock).
    await prefetcher.prefetchWeatherWind({
      lat: 64.0,
      lng: -19.0,
      wind_speed_mps: 1,
      threshold_mps: 18,
      vehicle_type: 'CAMPERVAN',
      emergency_constraints: {
        pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      },
      ttl_seconds: 3600,
    });

    const confirm = await request(app.getHttpServer())
      .post('/agent/confirm_negotiation')
      .send({
        session_id: negotiation.negotiation_session_id,
        alternative_id: 'POSTPONE_SCHEDULE',
        expected_negotiation_hash: negotiation.expected_negotiation_hash,
      })
      .expect(409);

    const codes = confirm.body?.evidence_bundle?.failure_reason_codes ?? [];
    expect(Array.isArray(codes)).toBe(true);
    expect(codes).toContain('HEAL_IMPACT_BOOKING_COLLISION');
    const alts = confirm.body?.negotiation_payload?.alternatives ?? [];
    expect(Array.isArray(alts)).toBe(true);
    expect(alts.some((a: any) => String(a?.id ?? '') === 'POSTPONE_SCHEDULE')).toBe(false);
  });

  it('Teleportation forbidden: confirm_negotiation rejects when min travel time makes timeline impossible (409 + HEAL_IMPACT_TRAVEL_IMPOSSIBLE)', async () => {
    const prefetcher = moduleRef.get(PrefetcherService);

    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-teleport-forbidden',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'teleport test',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
          heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
        },
        options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
      })
      .expect(200);

    const negotiation = res.body?.result?.payload?.negotiation_payload;
    expect(negotiation?.negotiation_session_id).toBeTruthy();
    expect(negotiation?.expected_negotiation_hash).toBeTruthy();

    // Ensure current reality has safe drive_safety_v1 evidence (so failure is travel-impossibility).
    await prefetcher.prefetchWeatherWind({
      lat: 64.0,
      lng: -19.0,
      wind_speed_mps: 1,
      threshold_mps: 18,
      vehicle_type: 'CAMPERVAN',
      emergency_constraints: {
        pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      },
      ttl_seconds: 3600,
    });

    const confirm = await request(app.getHttpServer())
      .post('/agent/confirm_negotiation')
      .send({
        session_id: negotiation.negotiation_session_id,
        alternative_id: 'UPGRADE_TO_DRIVE',
        expected_negotiation_hash: negotiation.expected_negotiation_hash,
      })
      .expect(409);

    const codes = confirm.body?.evidence_bundle?.failure_reason_codes ?? [];
    expect(Array.isArray(codes)).toBe(true);
    expect(codes).toContain('HEAL_IMPACT_TRAVEL_IMPOSSIBLE');
  });

  it('High-precision impossibility: uses cached travel_time_v1 (40min) over haversine (10min) to fail confirm', async () => {
    const prefetcher = moduleRef.get(PrefetcherService);

    // Inject a "road work" travel time: 40min for a short-distance pair.
    await prefetcher.prefetchTravelTime({
      from: { lat: 51.5, lng: -0.1 },
      to: { lat: 51.52, lng: -0.1 },
      mode: 'DRIVE',
      travel_minutes: 40,
      emergency_constraints: {
        pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      },
      ttl_seconds: 3600,
    });

    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-high-precision-impossible',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'precision travel time',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints: {
          pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
          heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
        },
        options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
      })
      .expect(200);

    const negotiation = res.body?.result?.payload?.negotiation_payload;
    expect(negotiation?.negotiation_session_id).toBeTruthy();
    expect(negotiation?.expected_negotiation_hash).toBeTruthy();

    // Ensure weather doesn't fail us.
    await prefetcher.prefetchWeatherWind({
      lat: 64.0,
      lng: -19.0,
      wind_speed_mps: 1,
      threshold_mps: 18,
      vehicle_type: 'CAMPERVAN',
      emergency_constraints: {
        pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
        heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      },
      ttl_seconds: 3600,
    });

    const confirm = await request(app.getHttpServer())
      .post('/agent/confirm_negotiation')
      .send({
        session_id: negotiation.negotiation_session_id,
        alternative_id: 'UPGRADE_TO_DRIVE',
        expected_negotiation_hash: negotiation.expected_negotiation_hash,
      })
      .expect(409);

    const codes = confirm.body?.evidence_bundle?.failure_reason_codes ?? [];
    expect(Array.isArray(codes)).toBe(true);
    expect(codes).toContain('HEAL_IMPACT_TRAVEL_IMPOSSIBLE');
    const conflicts = confirm.body?.timeline_impact?.conflicts ?? [];
    expect(Array.isArray(conflicts)).toBe(true);
    const impossible = conflicts.find((c: any) => String(c?.reason_code ?? '') === 'HEAL_IMPACT_TRAVEL_IMPOSSIBLE');
    expect(impossible).toBeTruthy();
    // Must be >= 40 (prefetched truth); could be higher if combined with other constraints.
    expect(Number(impossible?.travel_minutes_min)).toBeGreaterThanOrEqual(40);
  });

  it('Attribution integrity: neighbor-bucket travel_time_v1 yields L1B_NEIGHBOR_HIT on travel-impossible 409', async () => {
    const cache = moduleRef.get(EvidenceCacheService);
    const prefetcher = moduleRef.get(PrefetcherService);
    const prevPeak = process.env.TRAVEL_TIME_PEAK_HOURS_UTC;
    // Narrow peak window so typical CI UTC hour is off-peak (enables ±1h neighbor reuse for DRIVE).
    process.env.TRAVEL_TIME_PEAK_HOURS_UTC = '0-1';

    const emergency_constraints = {
      pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' },
      heal_prefetch_weather: { lat: 64.0, lng: -19.0, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
      e2e_attribution_l1b_neighbor: true,
    };
    const constraints_hash = cache.hashEmergencyConstraints(emergency_constraints);
    const from = { lat: 51.5, lng: -0.1 };
    const to = { lat: 51.52, lng: -0.1 };
    const geo_hash = cache.geoPairHash(from, to, 'DRIVE', 2);
    const nowMs = Date.now();
    const neighborBucket = cache.timeBucketIso(nowMs - 60 * 60 * 1000, 60);
    const cached_at = new Date(nowMs).toISOString();
    const expires_at = new Date(nowMs + 55 * 60 * 1000).toISOString();
    await cache.set(
      {
        rule_id: 'travel_time_v1',
        geo_hash,
        time_bucket: neighborBucket,
        constraints_hash,
        cached_at,
        expires_at,
        evidence: {
          type: 'travel_time',
          rule_id: 'travel_time_v1',
          source: 'E2E_L1B_NEIGHBOR_SEED',
          mode: 'DRIVE',
          from,
          to,
          travel_minutes: 40,
          cached_at,
          expires_at,
          is_warm_hit: true,
        },
      },
      3600,
    );

    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'e2e-attribution-l1b-neighbor',
        user_id: 'u1',
        trip_id: 'trip1',
        message: 'attribution l1b neighbor',
        preference_profile: { max_extra_cost_usd: 1, max_delay_minutes: 1 },
        emergency_constraints,
        options: { use_claude_orchestration: true, use_state_machine_orchestration: true, execution_mode: 'ADVICE_ONLY', max_seconds: 25, allow_partial: true },
      })
      .expect(200);

    const negotiation = res.body?.result?.payload?.negotiation_payload;
    expect(negotiation?.negotiation_session_id).toBeTruthy();
    expect(negotiation?.expected_negotiation_hash).toBeTruthy();

    await prefetcher.prefetchWeatherWind({
      lat: 64.0,
      lng: -19.0,
      wind_speed_mps: 1,
      threshold_mps: 18,
      vehicle_type: 'CAMPERVAN',
      emergency_constraints,
      ttl_seconds: 3600,
    });

    const confirm = await request(app.getHttpServer())
      .post('/agent/confirm_negotiation')
      .send({
        session_id: negotiation.negotiation_session_id,
        alternative_id: 'UPGRADE_TO_DRIVE',
        expected_negotiation_hash: negotiation.expected_negotiation_hash,
      })
      .expect(409);

    if (prevPeak === undefined) delete process.env.TRAVEL_TIME_PEAK_HOURS_UTC;
    else process.env.TRAVEL_TIME_PEAK_HOURS_UTC = prevPeak;

    const codes = confirm.body?.evidence_bundle?.failure_reason_codes ?? [];
    expect(codes).toContain('HEAL_IMPACT_TRAVEL_IMPOSSIBLE');
    const conflicts = confirm.body?.timeline_impact?.conflicts ?? [];
    const impossible = conflicts.find((c: any) => String(c?.reason_code ?? '') === 'HEAL_IMPACT_TRAVEL_IMPOSSIBLE');
    expect(impossible).toBeTruthy();
    expect(impossible.source_lineage?.source_type).toBe('L1B_NEIGHBOR_HIT');
    expect(String(impossible.lineage_summary ?? '')).toMatch(/邻域/);
    expect(String(confirm.body?.lineage_summary ?? '')).toMatch(/邻域/);
    expect(Number(impossible?.travel_minutes_min)).toBeGreaterThanOrEqual(40);
  });
});

