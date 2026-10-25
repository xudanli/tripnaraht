import { TravelMemoryRuntimeService } from '../runtime/travel-memory-runtime.service';
import { encodeTravelerMemoryPredicate } from './traveler-memory-predicate.util';
import { validateWriteTravelerMemoryRequest } from './validate-traveler-memory-object.util';
import { writeTravelerMemoryObject } from './write-traveler-memory.util';
import { travelerMemoryObjectToEffectiveItem } from './traveler-memory-to-effective.util';
import { resolveEffectiveTravelerContext } from '../effective-context/resolve-effective-traveler-context.util';
import type { AgentMemoryContext } from '../../agent/memory/interfaces/agent-memory-context.interface';
import type { AssembledTravelContextV1 } from '../context-assembly/assembled-context.types';

describe('Traveler Memory Contract M4', () => {
  it('validates required contract fields', () => {
    const issues = validateWriteTravelerMemoryRequest({
      subject_id: '',
      domain: 'FOOD',
      semantic_type: 'CONSTRAINT',
      key: '',
      value: undefined,
      source: [],
    } as any);
    expect(issues.map((i) => i.field).sort()).toEqual(
      expect.arrayContaining(['subject_id', 'key', 'value', 'source']),
    );
  });

  it('rejects Sleep with NORMAL sensitivity', () => {
    const issues = validateWriteTravelerMemoryRequest({
      subject_id: 'u1',
      domain: 'SLEEP',
      semantic_type: 'HABIT',
      key: 'light_sleeper',
      value: true,
      source: ['EXPLICIT'],
      sensitivity: 'NORMAL',
    });
    expect(issues.some((i) => i.field === 'sensitivity')).toBe(true);
  });

  it('encodes predicate traveler.food.constraint.pork', () => {
    expect(
      encodeTravelerMemoryPredicate({
        domain: 'FOOD',
        semantic_type: 'CONSTRAINT',
        key: 'pork',
      }),
    ).toBe('traveler.food.constraint.pork');
  });

  it('writeTravelerMemory EXPLICIT → STABLE object on ledger', () => {
    const runtime = new TravelMemoryRuntimeService();
    const result = runtime.writeTravelerMemory({
      subject_id: 'traveler_1',
      domain: 'FOOD',
      semantic_type: 'CONSTRAINT',
      key: 'pork',
      value: 'AVOID',
      source: ['EXPLICIT'],
      explicitConfirm: true,
      evidence_refs: [{ type: 'USER_EXPLICIT', id: 'remember_no_pork' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.object.domain).toBe('FOOD');
    expect(result.object.semantic_type).toBe('CONSTRAINT');
    expect(result.object.status).toBe('STABLE');
    expect(result.object.sensitivity).toBe('NORMAL');
    expect(result.object.visibility).toBe('USER_VISIBLE');

    const listed = runtime.listTravelerMemories('traveler_1');
    expect(listed.some((m) => m.key === 'pork')).toBe(true);
    expect(runtime.getProfile('traveler_1').travelerMemories?.length).toBeGreaterThan(
      0,
    );
  });

  it('BEHAVIORAL write stays OBSERVED (not profile-eligible)', () => {
    const runtime = new TravelMemoryRuntimeService();
    const result = writeTravelerMemoryObject(runtime, {
      subject_id: 'traveler_1',
      domain: 'EXPERIENCE',
      semantic_type: 'AVOIDANCE',
      key: 'museum',
      value: true,
      source: ['BEHAVIORAL'],
      confidence: 0.6,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 产品态：行为推断先 OBSERVED，需 Promotion 才进 Profile
    expect(result.object.status).toBe('OBSERVED');
    expect(runtime.getProfile('traveler_1').travelerMemories ?? []).toHaveLength(0);
  });

  it('projects Contract FOOD into EffectiveTravelerContext', () => {
    const memory = {
      snapshotId: 's',
      snapshotVersion: 1,
      requestId: 'r',
      userId: 'traveler_1',
      tripId: 'trip_1',
      userProfile: null,
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

    const pork = {
      schemaId: 'tripnara.traveler_memory_object@v1' as const,
      version: 1 as const,
      memory_id: 'mem_pork',
      subject_id: 'traveler_1',
      domain: 'FOOD' as const,
      semantic_type: 'CONSTRAINT' as const,
      key: 'dietary_restrictions',
      value: ['no_pork'],
      scope: 'GLOBAL_USER' as const,
      confidence: 0.95,
      status: 'STABLE' as const,
      source: ['EXPLICIT' as const],
      evidence_refs: [{ type: 'USER_EXPLICIT' as const, id: 'x' }],
      evidence_count: 1,
      sensitivity: 'SENSITIVE' as const,
      visibility: 'USER_VISIBLE' as const,
      override_policy: 'L1_ONLY' as const,
      created_at: new Date().toISOString(),
      last_observed_at: new Date().toISOString(),
      last_confirmed_at: new Date().toISOString(),
    };

    const assembled = {
      memory: {
        structured: { travelerMemories: [pork] },
        tripMemory: null,
      },
    } as AssembledTravelContextV1;

    const etc = resolveEffectiveTravelerContext({
      memory,
      assembledTravelContext: assembled,
    });
    expect(etc.effective.dietaryConstraints?.value).toEqual(['no_pork']);
    expect(etc.effective.dietaryConstraints?.sourceRefs[0]).toMatch(
      /^traveler_memory:/,
    );
    expect(etc.byDomain.FOOD?.length).toBeGreaterThan(0);
  });

  it('maps object to effective item with L2 for TRIP scope', () => {
    const item = travelerMemoryObjectToEffectiveItem({
      schemaId: 'tripnara.traveler_memory_object@v1',
      version: 1,
      memory_id: 'm1',
      subject_id: 'u1',
      domain: 'PACE',
      semantic_type: 'PREFERENCE',
      key: 'pace',
      value: 'FAST',
      scope: 'TRIP',
      confidence: 0.9,
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
    });
    expect(item?.layer).toBe('L2_TRIP_OVERRIDE');
  });
});
