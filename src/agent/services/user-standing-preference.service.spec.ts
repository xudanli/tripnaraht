import { LlmProvider } from '../../llm/dto/llm-request.dto';
import {
  looksLikeStandingUserPreferenceUtterance,
  isValidUuidForUserProfile,
  UserStandingPreferenceService,
  TRIPNARA_STRUCTURED_PREFERENCES,
  TRIPNARA_USER_SUMMARY_BULLETS,
} from './user-standing-preference.service';

const TEST_UUID = 'b950dbf2-7583-4b43-b0c6-ddd947719c54';

describe('looksLikeStandingUserPreferenceUtterance', () => {
  it('matches hotel style standing preference', () => {
    expect(
      looksLikeStandingUserPreferenceUtterance(
        '以后选酒店都要极简暗黑风，不要连锁大饭店',
      ),
    ).toBe(true);
  });

  it('rejects short generic chat', () => {
    expect(looksLikeStandingUserPreferenceUtterance('你好')).toBe(false);
  });

  it('rejects marker without enough length when no domain', () => {
    expect(looksLikeStandingUserPreferenceUtterance('以后早点')).toBe(false);
  });
});

describe('isValidUuidForUserProfile', () => {
  it('rejects anonymous', () => {
    expect(isValidUuidForUserProfile('anonymous')).toBe(false);
  });

  it('accepts uuid', () => {
    expect(isValidUuidForUserProfile('b950dbf2-7583-4b43-b0c6-ddd947719c54')).toBe(true);
  });
});

describe('UserStandingPreferenceService.mergeFromRouteAndRunIfEligible', () => {
  let prisma: {
    userProfile: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let llm: { getDefaultProvider: jest.Mock; callLlmWithSchema: jest.Mock };
  let svc: UserStandingPreferenceService;

  beforeEach(() => {
    prisma = {
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ preferences: {} }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    llm = {
      getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK),
      callLlmWithSchema: jest.fn(),
    };
    svc = new UserStandingPreferenceService(prisma as any, llm as any);
    delete process.env.TRIPNARA_USER_PREFERENCE_LLM_EXTRACT;
  });

  function baseReq(message: string) {
    return {
      request_id: 'req-standing-1',
      user_id: TEST_UUID,
      message,
      options: {},
    } as any;
  }

  it('persists bullets and structured hints from LLM when confident', async () => {
    llm.callLlmWithSchema.mockResolvedValue(
      JSON.stringify({
        has_standing_preference: true,
        confidence: 0.9,
        summary_bullets: ['偏好：住极简风格酒店'],
        structured_hints: { hotel_style: '极简' },
      }),
    );
    const ok = await svc.mergeFromRouteAndRunIfEligible(baseReq('我喜欢住得简单点，别太浮夸'));
    expect(ok).toBe(true);
    expect(llm.callLlmWithSchema).toHaveBeenCalled();
    expect(prisma.userProfile.upsert).toHaveBeenCalled();
    const callArg = prisma.userProfile.upsert.mock.calls[0][0];
    const prefs = callArg.update.preferences as Record<string, unknown>;
    expect(prefs[TRIPNARA_USER_SUMMARY_BULLETS]).toContain('偏好：住极简风格酒店');
    expect((prefs[TRIPNARA_STRUCTURED_PREFERENCES] as any).hotel_style).toBe('极简');
  });

  it('skips LLM when TRIPNARA_USER_PREFERENCE_LLM_EXTRACT=0 and uses heuristic', async () => {
    process.env.TRIPNARA_USER_PREFERENCE_LLM_EXTRACT = '0';
    const svcLocal = new UserStandingPreferenceService(prisma as any, llm as any);
    llm.callLlmWithSchema.mockClear();
    const ok = await svcLocal.mergeFromRouteAndRunIfEligible(
      baseReq('以后选酒店都要极简暗黑风，不要连锁大饭店'),
    );
    expect(ok).toBe(true);
    expect(llm.callLlmWithSchema).not.toHaveBeenCalled();
  });

  it('returns false when LLM rejects and message does not match heuristic', async () => {
    llm.callLlmWithSchema.mockResolvedValue(
      JSON.stringify({
        has_standing_preference: false,
        confidence: 0.1,
        summary_bullets: [],
      }),
    );
    const ok = await svc.mergeFromRouteAndRunIfEligible(baseReq('今天天气怎么样'));
    expect(ok).toBe(false);
    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
  });

  it('falls back to heuristic when LLM returns unusable JSON', async () => {
    llm.callLlmWithSchema.mockResolvedValue('not json {{{');
    const ok = await svc.mergeFromRouteAndRunIfEligible(baseReq('以后住酒店尽量不要连锁大饭店'));
    expect(ok).toBe(true);
    expect(prisma.userProfile.upsert).toHaveBeenCalled();
  });

  it('returns false for dry_run', async () => {
    llm.callLlmWithSchema.mockResolvedValue(
      JSON.stringify({
        has_standing_preference: true,
        confidence: 1,
        summary_bullets: ['x'],
      }),
    );
    const ok = await svc.mergeFromRouteAndRunIfEligible({
      ...baseReq('以后住民宿'),
      options: { dry_run: true },
    });
    expect(ok).toBe(false);
    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
  });

  it('heuristic path works without LlmService', async () => {
    const svcNoLlm = new UserStandingPreferenceService(prisma as any);
    const ok = await svcNoLlm.mergeFromRouteAndRunIfEligible(
      baseReq('以后选酒店都要极简暗黑风，不要连锁大饭店'),
    );
    expect(ok).toBe(true);
    expect(prisma.userProfile.upsert).toHaveBeenCalled();
  });
});
