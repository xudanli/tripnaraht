import { TravelMemoryRuntimeService } from '../runtime/travel-memory-runtime.service';
import { TripOverrideService } from './trip-override.service';
import { buildTravelerHabitSummary } from './trip-override.util';
import { resolveEffectiveTravelerContext } from '../effective-context/resolve-effective-traveler-context.util';
import type { AgentMemoryContext } from '../../agent/memory/interfaces/agent-memory-context.interface';
import type { AssembledTravelContextV1 } from '../context-assembly/assembled-context.types';

describe('Trip Override M5', () => {
  function setup() {
    const runtime = new TravelMemoryRuntimeService();
    const service = new TripOverrideService(runtime);
    return { runtime, service };
  }

  it('builds habit summary from L1 visible memories', () => {
    const summary = buildTravelerHabitSummary('u1', [
      {
        schemaId: 'tripnara.traveler_memory_object@v1',
        version: 1,
        memory_id: 'm1',
        subject_id: 'u1',
        domain: 'FOOD',
        semantic_type: 'CONSTRAINT',
        key: 'pork',
        value: 'AVOID',
        scope: 'GLOBAL_USER',
        confidence: 1,
        status: 'STABLE',
        source: ['EXPLICIT'],
        evidence_refs: [],
        evidence_count: 0,
        sensitivity: 'NORMAL',
        visibility: 'USER_VISIBLE',
        override_policy: 'L2_WINS',
        created_at: '',
        last_observed_at: '',
        last_confirmed_at: null,
      },
    ]);
    expect(summary.cards[0].domain).toBe('FOOD');
    expect(summary.appliedSummary).toMatch(/pork|AVOID|饮食/);
  });

  it('translates SCENIC/MODERATE enums to Chinese and dedupes OS aliases', () => {
    const summary = buildTravelerHabitSummary('u1', [
      {
        schemaId: 'tripnara.traveler_memory_object@v1',
        version: 1,
        memory_id: 'm-pace',
        subject_id: 'u1',
        domain: 'PACE',
        semantic_type: 'PREFERENCE',
        key: 'pace',
        value: 'MODERATE',
        scope: 'GLOBAL_USER',
        confidence: 1,
        status: 'CONFIRMED',
        source: ['EXPLICIT'],
        evidence_refs: [],
        evidence_count: 0,
        sensitivity: 'NORMAL',
        visibility: 'USER_VISIBLE',
        override_policy: 'L2_WINS',
        created_at: '',
        last_observed_at: '',
        last_confirmed_at: null,
      },
      {
        schemaId: 'tripnara.traveler_memory_object@v1',
        version: 1,
        memory_id: 'm-ph',
        subject_id: 'u1',
        domain: 'EXPERIENCE',
        semantic_type: 'PREFERENCE',
        key: 'travel_philosophy',
        value: 'SCENIC',
        scope: 'GLOBAL_USER',
        confidence: 1,
        status: 'CONFIRMED',
        source: ['EXPLICIT'],
        evidence_refs: [],
        evidence_count: 0,
        sensitivity: 'NORMAL',
        visibility: 'USER_VISIBLE',
        override_policy: 'L2_WINS',
        created_at: '',
        last_observed_at: '',
        last_confirmed_at: null,
      },
      {
        schemaId: 'tripnara.traveler_memory_object@v1',
        version: 1,
        memory_id: 'm-pace-zh',
        subject_id: 'u1',
        domain: 'PACE',
        semantic_type: 'PREFERENCE',
        key: '行程节奏',
        value: '节奏适中',
        scope: 'GLOBAL_USER',
        confidence: 1,
        status: 'CONFIRMED',
        source: ['EXPLICIT'],
        evidence_refs: [],
        evidence_count: 0,
        sensitivity: 'NORMAL',
        visibility: 'USER_VISIBLE',
        override_policy: 'L2_WINS',
        created_at: '',
        last_observed_at: '',
        last_confirmed_at: null,
      },
    ]);
    expect(summary.appliedSummary).toContain('行程节奏：节奏适中');
    expect(summary.appliedSummary).toContain('旅行风格：偏风景与自然体验');
    expect(summary.appliedSummary).not.toContain('SCENIC');
    expect(summary.appliedSummary).not.toContain('MODERATE');
    expect(summary.memoryCount).toBe(2);
  });

  it('inherit habit does not write GLOBAL_USER domain prefs', async () => {
    const { runtime, service } = setup();
    runtime.writeTravelerMemory({
      subject_id: 'u1',
      domain: 'PACE',
      semantic_type: 'PREFERENCE',
      key: 'pace',
      value: 'SLOW',
      source: ['EXPLICIT'],
      explicitConfirm: true,
    });

    const beforeL1 = runtime.listTravelerMemories('u1');
    const result = await service.applyHabitInherit({
      userId: 'u1',
      tripId: 'trip_1',
    });

    expect(result.mode).toBe('HABIT_INHERIT');
    expect(result.l1Untouched).toBe(true);
    expect(result.habitSummary?.memoryCount).toBeGreaterThan(0);
    expect(service.getTripMemoryMode('trip_1')).toBe('HABIT_INHERIT');

    const afterL1 = runtime.listTravelerMemories('u1');
    expect(afterL1.map((m) => m.memory_id).sort()).toEqual(
      beforeL1.map((m) => m.memory_id).sort(),
    );
    // trip subject 有 mode marker，但用户 L1 条数不变
    const tripObjs = service.listTripOverrides('trip_1');
    expect(tripObjs.every((o) => o.scope === 'TRIP')).toBe(true);
    expect(tripObjs.every((o) => o.subject_id === 'trip_1')).toBe(true);
  });

  it('这次不一样 writes TRIP overrides and L2 wins in ETC', async () => {
    const { runtime, service } = setup();
    runtime.writeTravelerMemory({
      subject_id: 'u1',
      domain: 'PACE',
      semantic_type: 'PREFERENCE',
      key: 'pace',
      value: 'SLOW',
      source: ['EXPLICIT'],
      explicitConfirm: true,
    });

    const applied = await service.applyTripDifferent({
      userId: 'u1',
      tripId: 'trip_2',
      overrides: [
        {
          domain: 'PACE',
          semantic_type: 'PREFERENCE',
          key: 'pace',
          value: 'FAST',
        },
        {
          domain: 'STAY',
          semantic_type: 'TRADEOFF',
          key: 'location_vs_quality',
          value: 'BUDGET_FIRST',
        },
      ],
    });

    expect(applied.mode).toBe('TRIP_DIFFERENT');
    expect(applied.l1Untouched).toBe(true);
    expect(applied.overrides).toHaveLength(2);
    expect(applied.overrides.every((o) => o.scope === 'TRIP')).toBe(true);

    // L1 仍是 SLOW
    const l1 = runtime.listTravelerMemories('u1').find((m) => m.key === 'pace');
    expect(l1?.value).toBe('SLOW');
    expect(l1?.scope).toBe('GLOBAL_USER');

    const tripView = runtime.buildContext({
      task: 'plan',
      userId: 'u1',
      tripId: 'trip_2',
    });

    const memory = {
      snapshotId: 's',
      snapshotVersion: 1,
      requestId: 'r',
      userId: 'u1',
      tripId: 'trip_2',
      userProfile: {
        userId: 'u1',
        pacePreference: 'SLOW',
        confidence: 0.9,
        source: 'explicit',
        updatedAt: new Date(),
      },
      userBasics: null,
      travelPreference: null,
      routePartyProfile: null,
      recentDecisions: [],
      decisionLedger: null,
      ledgerRecomputePlan: null,
      recentWorldDecisions: [],
      activeTripState: null,
      recoveryHistory: [],
      failurePatterns: [],
      recentTripFeedbacks: [],
      domainInfluenceDigest: null,
      wishConstraintDigest: null,
      privateWishDigest: null,
      decisionProfilingDigest: null,
      negotiationDigest: null,
      loadedAt: new Date().toISOString(),
      observability: { layers: [] },
    } as AgentMemoryContext;

    const etc = resolveEffectiveTravelerContext({
      memory,
      assembledTravelContext: {
        memory: {
          structured: tripView.structured,
          tripMemory: tripView.tripMemory,
        },
      } as AssembledTravelContextV1,
    });

    expect(etc.effective.pace?.value).toBe('FAST');
    expect(etc.effective.pace?.layer).toBe('L2_TRIP_OVERRIDE');
    expect(etc.tripOverridesApplied).toContain('pace');
  });

  it('clear overrides returns to habit-only trip state', async () => {
    const { service } = setup();
    await service.applyTripDifferent({
      userId: 'u1',
      tripId: 'trip_3',
      overrides: [
        {
          domain: 'PACE',
          semantic_type: 'PREFERENCE',
          key: 'pace',
          value: 'FAST',
        },
      ],
    });
    const cleared = service.clearTripOverrides('trip_3', {
      includeModeMarker: true,
    });
    expect(cleared).toBeGreaterThan(0);
    expect(service.getTripMemoryMode('trip_3')).toBeNull();
  });
});
