import type { PlanningRuleResult } from '../contracts/tep-self-drive.types';
import {
  buildNoNightDetailFromSdr202Rule,
  formatNoNightDriveDetail,
  parseDaylightEvidenceRefs,
  parseSdr202RuleMetadata,
  reprojectSdr202ForDraftBuffer,
} from './sdr-202-rule-metadata.util';

describe('sdr-202-rule-metadata.util', () => {
  const rule: PlanningRuleResult = {
    ruleId: 'SDR-202',
    outcome: 'SUGGEST_REPAIR',
    severity: 'HIGH',
    affectedRefs: ['drive_leg_1_1', 'day_1'],
    explanation:
      '驾驶段预计 23:40 结束，超出安全截止 23:57（日落 23:27 + 30 分钟，+43min）',
    evidenceRefs: [
      {
        provider: 'TEP',
        sourceType: 'INTERNAL',
        observedAt: '2026-07-15T00:00:00.000Z',
        predicate: 'daylight.sunset:23:27',
      },
      {
        provider: 'TEP',
        sourceType: 'INTERNAL',
        observedAt: '2026-07-15T00:00:00.000Z',
        predicate: 'daylight.geo:64.15,-21.94',
      },
    ],
  };

  it('parses daylight evidence predicates', () => {
    expect(parseDaylightEvidenceRefs(rule.evidenceRefs)).toEqual({
      sunsetLocal: '23:27',
      lat: 64.15,
      lng: -21.94,
    });
  });

  it('parses finish/cutoff/sunset from SDR-202 explanation', () => {
    expect(parseSdr202RuleMetadata(rule)).toMatchObject({
      dayIndex: 1,
      legId: 'drive_leg_1_1',
      finishLocal: '23:40',
      cutoffLocal: '23:57',
      sunsetLocal: '23:27',
      maxMinutesAfterSunset: 30,
      overMinutes: 43,
    });
  });

  it('tolerates missing affectedRefs and evidenceRefs', () => {
    expect(
      parseSdr202RuleMetadata({
        ruleId: 'SDR-202',
        outcome: 'UNKNOWN',
        severity: 'MEDIUM',
        explanation: '第 2 日日照数据不可用，已降级',
      } as PlanningRuleResult),
    ).toMatchObject({
      dayIndex: undefined,
      degradationReason: undefined,
    });
  });

  it('reprojects draft buffer for cross-midnight arrive', () => {
    const meta = reprojectSdr202ForDraftBuffer(
      {
        dayIndex: 1,
        finishLocal: '00:53',
        sunsetLocal: '23:04',
        cutoffLocal: '23:34',
        maxMinutesAfterSunset: 30,
        overMinutes: 79,
      },
      45,
    );
    expect(meta.cutoffLocal).toBe('23:49');
    expect(meta.overMinutes).toBe(64);
    expect(
      formatNoNightDriveDetail({
        arriveLocal: '00:53',
        sunsetLocal: '23:04',
        cutoffLocal: '23:49',
        maxMinutesAfterSunset: 45,
        overMinutes: 64,
      }),
    ).toBe('预计 00:53 结束，超出安全截止 23:49（日落 23:04 + 45 分钟，+64min）');
  });

  it('builds no-night activity detail from SDR-202 rule', () => {
    const built = buildNoNightDetailFromSdr202Rule({
      rule,
      plan: {
        date: '2026-07-15',
        dayIndex: 1,
        origin: { ref: 'anchor_rey', label: '雷克雅未克', lat: 64.1466, lng: -21.9426 },
        destination: { ref: 'anchor_vik', label: '维克', lat: 63.4186, lng: -19.0059 },
        legs: [
          {
            legId: 'drive_leg_1_1',
            fromRef: 'iti_rey',
            toRef: 'iti_vik',
            baseNavigationMinutes: 160,
            roadRefs: [],
            importance: 'MANDATORY',
            flexibility: 'MOVABLE',
          },
        ],
        activities: [],
        buffers: [],
      },
      itemLabelsById: new Map([
        ['iti_rey', '雷克雅未克'],
        ['iti_vik', '维克'],
      ]),
    });

    expect(built?.label).toBe('雷克雅未克 → 维克');
    expect(built?.detail).toContain('23:40');
    expect(built?.detail).toContain('日落 23:27');
  });
});
