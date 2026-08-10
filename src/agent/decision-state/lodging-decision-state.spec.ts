import { buildDecisionStateShadow } from './build-decision-state-shadow.util';
import { classifyLodgingDecision } from './classify-lodging-decision.util';
import { resolveDecisionTakeover } from './activity-decision-takeover.util';
import type { TripLodgingCoverageFactSlice } from '../harness/trip-lodging-coverage-fact.util';

const sampleCoverage = (): TripLodgingCoverageFactSlice => ({
  tripId: 'trip-1',
  dayCount: 4,
  nightsExpected: 3,
  nightsCovered: 2,
  nights: [
    {
      dayNumber: 1,
      ymd: '2026-02-15',
      overnightExpected: true,
      hasLodging: true,
      lodgingNameZh: '雷克雅未克酒店',
    },
    {
      dayNumber: 2,
      ymd: '2026-02-16',
      overnightExpected: true,
      hasLodging: false,
    },
    {
      dayNumber: 3,
      ymd: '2026-02-17',
      overnightExpected: true,
      hasLodging: true,
      lodgingNameZh: '维克',
    },
    {
      dayNumber: 4,
      ymd: '2026-02-18',
      overnightExpected: false,
      hasLodging: false,
    },
  ],
  missingDayNumbers: [2],
  coveredDayNumbers: [1, 3],
});

describe('Lodging Decision State Contract', () => {
  it('分类：哪一天没住宿 → GAP_QUERY', () => {
    expect(classifyLodgingDecision('哪一天没住宿').decisionClass).toBe(
      'LODGING.GAP_QUERY',
    );
  });

  it('有 trip + coverage → READY / ANSWER；忽略 day_pace', () => {
    const shadow = buildDecisionStateShadow({
      message: '哪一天没住宿',
      lodgingHints: {
        tripId: 'trip-1',
        lodgingCoverage: sampleCoverage(),
      },
      legacy: { wouldAskUser: true, blockKeys: ['day_pace'] },
    });
    expect(shadow.classified.decisionClass).toBe('LODGING.GAP_QUERY');
    expect(shadow.readiness?.readiness).toBe('READY');
    expect(shadow.readiness?.nextAction).toBe('ANSWER');
    expect(shadow.legacyCompare.divergenceCodes).toContain(
      'LEGACY_BLOCKED_ON_IGNORED_KEY',
    );
    const takeover = resolveDecisionTakeover(shadow);
    expect(takeover.kind).toBe('OBSERVE_ONLY_CONTINUE');
  });

  it('有 trip 无 coverage → FETCH（继续主链加载，不 ASK pace）', () => {
    const shadow = buildDecisionStateShadow({
      message: '哪一天没住宿',
      lodgingHints: { tripId: 'trip-1' },
    });
    expect(shadow.readiness?.nextAction).toBe('FETCH');
    expect(resolveDecisionTakeover(shadow).kind).toBe('OBSERVE_ONLY_CONTINUE');
  });

  it('无 trip → ASK trip_binding', () => {
    const shadow = buildDecisionStateShadow({
      message: '哪一天没住宿',
    });
    expect(shadow.readiness?.nextAction).toBe('ASK_USER');
    expect(shadow.readiness?.askUserKeys).toContain('trip_binding');
    expect(resolveDecisionTakeover(shadow).kind).toBe('ASK_FROM_READINESS');
  });

  it('与 Activity 互斥：订冰川不进 Lodging', () => {
    const shadow = buildDecisionStateShadow({
      message: '预订第4天的冰川徒步活动',
      activityHints: { focusDayIndex: 4 },
      lodgingHints: { tripId: 'trip-1' },
    });
    expect(String(shadow.classified.decisionClass)).toMatch(/^ACTIVITY\./);
  });
});
