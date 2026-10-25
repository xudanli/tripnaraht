import {
  buildStandingPreferenceTravelerWrites,
  buildPreferenceLearningTravelerWrites,
  buildDnaTraitTravelerWrites,
} from './dirty-write-to-traveler-memory.util';
import { resolveTravelerMemoryWriteGateMode } from './resolve-write-gate-mode.util';
import { bridgeWritesToTravelerMemory } from './bridge-dirty-writes.util';
import { TravelMemoryRuntimeService } from '../runtime/travel-memory-runtime.service';
import { UserStandingPreferenceService } from '../../agent/services/user-standing-preference.service';

describe('M6 dirty write gate', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('resolves write gate modes', () => {
    expect(resolveTravelerMemoryWriteGateMode({})).toBe('off');
    expect(
      resolveTravelerMemoryWriteGateMode({
        TRAVELER_MEMORY_WRITE_GATE: 'shadow',
      }),
    ).toBe('shadow');
    expect(
      resolveTravelerMemoryWriteGateMode({
        TRAVELER_MEMORY_WRITE_GATE: 'active',
      }),
    ).toBe('active');
  });

  it('maps standing hotel/dining to Domain×Semantic drafts', () => {
    const drafts = buildStandingPreferenceTravelerWrites({
      userId: 'u1',
      bullets: ['记住：不吃猪肉'],
      structured: {
        hotel_style: '安静精品',
        dining_preferences: '不吃猪肉',
      },
      strongExplicit: true,
    });
    expect(drafts.some((d) => d.domain === 'STAY' && d.key === 'hotel_style')).toBe(
      true,
    );
    expect(drafts.some((d) => d.domain === 'FOOD')).toBe(true);
    expect(drafts.every((d) => d.explicitConfirm === true)).toBe(true);
  });

  it('maps preference learning pace to BEHAVIORAL candidate draft', () => {
    const drafts = buildPreferenceLearningTravelerWrites({
      userId: 'u1',
      pace: 'relaxed',
      action: 'plan_confirmed',
    });
    expect(drafts[0]).toEqual(
      expect.objectContaining({
        domain: 'PACE',
        value: 'SLOW',
        source: ['BEHAVIORAL'],
      }),
    );
    expect(drafts[0].explicitConfirm).toBeUndefined();
  });

  it('bridges drafts into ledger without GLOBAL_USER profile table', () => {
    process.env.TRAVELER_MEMORY_WRITE_GATE = 'active';
    const runtime = new TravelMemoryRuntimeService();
    const drafts = buildStandingPreferenceTravelerWrites({
      userId: 'u1',
      bullets: [],
      structured: { hotel_style: 'quiet' },
      strongExplicit: true,
    });
    const audit = bridgeWritesToTravelerMemory(
      runtime,
      'active',
      'standing',
      drafts,
      false,
    );
    expect(audit.written).toBe(1);
    expect(audit.legacyProfileWrite).toBe(false);
    const listed = runtime.listTravelerMemories('u1');
    expect(listed.some((m) => m.key === 'hotel_style')).toBe(true);
  });

  it('StandingPreference active skips UserProfile upsert', async () => {
    process.env.TRAVELER_MEMORY_WRITE_GATE = 'active';
    process.env.TRIPNARA_USER_PREFERENCE_LLM_EXTRACT = '0';
    const TEST_UUID = 'b950dbf2-7583-4b43-b0c6-ddd947719c54';
    const prisma = {
      userProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const runtime = new TravelMemoryRuntimeService();
    const svc = new UserStandingPreferenceService(
      prisma as any,
      undefined,
      runtime,
    );

    const ok = await svc.mergeFromRouteAndRunIfEligible({
      request_id: 'r1',
      user_id: TEST_UUID,
      message: '记住以后选酒店都要安静精品，不要连锁大饭店',
      options: {},
    } as any);

    expect(ok).toBe(true);
    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
    expect(
      runtime.listTravelerMemories(TEST_UUID).some((m) =>
        String(m.value).includes('安静') || m.key.includes('standing'),
      ),
    ).toBe(true);
  });

  it('dna trait drafts include spending cost_sensitivity', () => {
    const drafts = buildDnaTraitTravelerWrites({
      userId: 'u1',
      costSensitivity: 'HIGH',
      reason: 'rollback',
    });
    expect(drafts[0]).toEqual(
      expect.objectContaining({
        domain: 'SPENDING',
        key: 'cost_sensitivity',
        value: 'HIGH',
        source: ['EPISODIC'],
      }),
    );
  });
});
