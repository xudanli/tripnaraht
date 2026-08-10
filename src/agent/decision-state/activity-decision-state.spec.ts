import { buildActivityDecisionShadow } from './activity-decision-shadow.util';
import { classifyActivityDecision } from './classify-activity-decision.util';
import {
  checkInv01AskUserCitesContractKey,
  checkInv02SensorFailureNotSoldOut,
  checkInv03UndeclaredStateCannotBlock,
} from './decision-state.invariants';
import { normalizeBookingChannelFromSensor } from './normalize-booking-channel.util';
import { getActivityDecisionContract } from './activity-decision.contracts';
import { projectActivityDecisionState } from './project-activity-decision-state.util';
import { evaluateActivityDecisionReadiness } from './evaluate-activity-decision-readiness.util';

describe('Activity Decision State Contract Phase1', () => {
  it('分类：需要提前订吗 → BOOKING_GUIDANCE（可不需 Day）', () => {
    const c = classifyActivityDecision('冰川徒步需要提前订吗？');
    expect(c.decisionClass).toBe('ACTIVITY.BOOKING_GUIDANCE');
  });

  it('分类：还有位置吗 → AVAILABILITY_CHECK', () => {
    const c = classifyActivityDecision('第4天冰川徒步还有位置吗？');
    expect(c.decisionClass).toBe('ACTIVITY.AVAILABILITY_CHECK');
  });

  it('分类：安排怎么样 → SUITABILITY_DECISION', () => {
    const c = classifyActivityDecision('第4天安排冰川徒步怎么样？');
    expect(c.decisionClass).toBe('ACTIVITY.SUITABILITY_DECISION');
  });

  it('分类：帮我订 → RESERVATION_PREP', () => {
    const c = classifyActivityDecision('预订第4天的冰川徒步活动');
    expect(c.decisionClass).toBe('ACTIVITY.RESERVATION_PREP');
  });

  it('冰川预订五维：fitness partial + catalog → READY_WITH_WARNING / SHOW_CARD', () => {
    const shadow = buildActivityDecisionShadow({
      message: '预订第4天的冰川徒步活动\n[日程] Day4 · 南岸冰川',
      hints: {
        focusDayIndex: 4,
        focusDayYmd: '2026-02-18',
        teamFitness: { floor: 'MEDIUM', missingCount: 1, fit: 'tight' },
        activitySearchMeta: {
          mode: 'catalog_only',
          probed: 0,
          error: 'Initialization failed with status 404',
        },
        dayConflict: { status: 'NONE' },
      },
      legacy: {
        creOperation: 'ASK_TRIP_QUESTION',
        creNextAction: 'ANSWER',
        wouldAskUser: false,
        blockKeys: ['day_pace'],
      },
    });

    expect(shadow.classified.decisionClass).toBe('ACTIVITY.RESERVATION_PREP');
    expect(shadow.readiness?.readiness).toBe('READY_WITH_WARNING');
    expect(shadow.readiness?.nextAction).toBe('SHOW_CARD');
    expect(shadow.legacyCompare.divergenceCodes).toContain(
      'LEGACY_BLOCKED_ON_IGNORED_KEY',
    );

    const projected = shadow.projection!.keys;
    expect(projected.find((k) => k.key === 'day_anchor')?.presence).toBe('PRESENT');
    expect(projected.find((k) => k.key === 'activity_ref')?.presence).toBe('PRESENT');
    expect(projected.find((k) => k.key === 'team_fitness_floor')?.presence).toBe(
      'PARTIAL',
    );
    expect(
      (projected.find((k) => k.key === 'booking_channel')?.value as { mode: string })
        .mode,
    ).toBe('CATALOG');
  });

  it('AVAILABILITY_CHECK 无 LIVE → EXTERNAL_UNAVAILABLE，不得答有位', () => {
    const contract = getActivityDecisionContract('ACTIVITY.AVAILABILITY_CHECK')!;
    const projection = projectActivityDecisionState(contract, {
      message: '第4天冰川徒步还有位置吗？',
      focusDayIndex: 4,
      activitySearchMeta: { mode: 'catalog_only', probed: 0, error: '404' },
    });
    const ready = evaluateActivityDecisionReadiness(contract, projection);
    expect(ready.readiness).toBe('EXTERNAL_UNAVAILABLE');
    expect(ready.reasonCode).toBe('LIVE_EVIDENCE_REQUIRED');
  });

  it('INV-02：404 ≠ SOLD_OUT', () => {
    const n = normalizeBookingChannelFromSensor({
      ok: false,
      httpStatus: 404,
      errorMessage: 'Initialization failed with status 404',
      catalogHit: true,
    });
    expect(n.businessAvailability).not.toBe('SOLD_OUT');
    expect(n.bookingChannel).toBe('CATALOG');
    expect(checkInv02SensorFailureNotSoldOut().ok).toBe(true);
  });

  it('INV-01：ASK_USER 必须引用合同键', () => {
    const contract = getActivityDecisionContract('ACTIVITY.RESERVATION_PREP')!;
    const projection = projectActivityDecisionState(contract, {
      message: '帮我订活动',
    });
    const readiness = evaluateActivityDecisionReadiness(contract, projection);
    expect(readiness.nextAction).toBe('ASK_USER');
    expect(checkInv01AskUserCitesContractKey(contract, readiness).ok).toBe(true);
  });

  it('INV-03：Shadow readiness 不得因 day_pace 阻断；legacy 触犯记入 divergence', () => {
    const shadow = buildActivityDecisionShadow({
      message: '预订第4天的冰川徒步活动',
      hints: {
        focusDayIndex: 4,
        dayConflict: { status: 'NONE' },
        activitySearchMeta: { mode: 'catalog_only', probed: 0 },
        teamFitness: { floor: 'HIGH', missingCount: 0 },
      },
      legacy: { blockKeys: ['day_pace'], wouldAskUser: true },
    });
    expect(shadow.readiness?.blockingKeys).not.toContain('day_pace');
    expect(
      checkInv03UndeclaredStateCannotBlock(
        shadow.contract,
        shadow.projection,
        shadow.readiness,
        [],
      ).ok,
    ).toBe(true);
    expect(shadow.legacyCompare.divergenceCodes).toEqual(
      expect.arrayContaining([
        'LEGACY_BLOCKED_ON_IGNORED_KEY',
        'LEGACY_ASK_BUT_SHADOW_PROCEED',
      ]),
    );
  });
});
