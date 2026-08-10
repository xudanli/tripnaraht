/**
 * Decision State Layer — 状态空间攻击测（接管验证阶段）。
 * A undeclared missing | B required missing | C sensor failure
 * D multi-gap | E intent transition | F cross-domain
 */

import { buildDecisionStateShadow } from './build-decision-state-shadow.util';
import { resolveDecisionTakeover } from './activity-decision-takeover.util';
import { normalizeBookingChannelFromSensor } from './normalize-booking-channel.util';
import {
  assertDecisionStateRegistryFrozen,
  FROZEN_DECISION_CLASS_COUNT,
  listAllDecisionContracts,
} from './decision-contract.registry';
import {
  assertAskUserAuditAllowsEgress,
  buildAskUserAudit,
} from './ask-user-audit.util';
import { formatReadinessAskQuestions } from './activity-decision-takeover.util';

describe('MDS 状态空间攻击测', () => {
  it('Registry 冻结在 16 类', () => {
    expect(listAllDecisionContracts()).toHaveLength(FROZEN_DECISION_CLASS_COUNT);
    expect(assertDecisionStateRegistryFrozen().ok).toBe(true);
  });

  describe('A. 未声明字段缺失 → 不得 ASK（INV-03）', () => {
    it('Day1 会不会太赶：fatigue/pace/budget 缺失仍 ANSWER', () => {
      const shadow = buildDecisionStateShadow({
        message: 'Day1 会不会太赶？\n[日程] Day1',
        diningRiskHints: {
          focusDayIndex: 1,
          tripId: 'trip-1',
          dayActivityCount: 0,
        },
        legacy: {
          wouldAskUser: true,
          blockKeys: ['fatigue', 'pacePreference', 'budget', 'fitness'],
        },
      });
      expect(shadow.classified.decisionClass).toBe('RISK.PACE_ASSESS');
      expect(shadow.readiness?.nextAction).toBe('ANSWER');
      expect(shadow.readiness?.askUserKeys).toHaveLength(0);
      expect(resolveDecisionTakeover(shadow).kind).toBe('OBSERVE_ONLY_CONTINUE');
      expect(shadow.legacyCompare.divergenceCodes).toContain(
        'LEGACY_BLOCKED_ON_IGNORED_KEY',
      );
    });
  });

  describe('B. 必须字段缺失 → 只问声明键（INV-01）', () => {
    it('第4天还有位置吗？无 activity_ref → ASK activity_ref（不升维）', () => {
      const shadow = buildDecisionStateShadow({
        message: '第4天还有位置吗？',
        activityHints: { focusDayIndex: 4 },
      });
      expect(shadow.classified.decisionClass).toBe('ACTIVITY.AVAILABILITY_CHECK');
      expect(shadow.readiness?.nextAction).toBe('ASK_USER');
      expect(shadow.readiness?.askUserKeys).toEqual(['activity_ref']);
      expect(shadow.readiness?.askUserKeys).not.toEqual(
        expect.arrayContaining(['team_fitness_floor', 'day_pace' as never]),
      );
      const ask = shadow.readiness!.askUserKeys[0];
      const audit = buildAskUserAudit({
        contract: shadow.contract!,
        projection: shadow.projection,
        readiness: shadow.readiness!,
        questionZh: formatReadinessAskQuestions([ask])[0],
      });
      expect(assertAskUserAuditAllowsEgress(audit)).toBe(true);
      expect(audit.declared_by).toMatch(/availability/i);
    });

    it('帮我预订冰川徒步无日 → 只 ASK day_anchor', () => {
      const shadow = buildDecisionStateShadow({
        message: '帮我预订冰川徒步',
      });
      expect(shadow.classified.decisionClass).toBe('ACTIVITY.RESERVATION_PREP');
      expect(shadow.readiness?.nextAction).toBe('ASK_USER');
      expect(shadow.readiness?.askUserKeys).toEqual(['day_anchor']);
    });
  });

  describe('C. Sensor 故障 → 非业务售罄（INV-02）', () => {
    it.each([
      { ok: false, httpStatus: 404, errorMessage: 'Initialization failed with status 404' },
      { ok: false, errorMessage: 'timeout' },
      { ok: false, errorMessage: 'ECONNREFUSED' },
      { ok: false, errorMessage: 'Server not found', catalogHit: true },
    ])('tech fail %# → not SOLD_OUT', (fact) => {
      const n = normalizeBookingChannelFromSensor({
        ...fact,
        catalogHit: fact.catalogHit ?? false,
      });
      expect(n.businessAvailability).not.toBe('SOLD_OUT');
      expect(n.businessAvailability).not.toBe('CLOSED');
      expect(['CATALOG', 'UNKNOWN', 'UNAVAILABLE']).toContain(n.bookingChannel);
    });
  });

  describe('D. 多 Gap → 唯一 Next Action', () => {
    it('activity+fitness partial+catalog+conflict unknown → 单一 next', () => {
      const shadow = buildDecisionStateShadow({
        message: '预订第4天的冰川徒步活动',
        activityHints: {
          focusDayIndex: 4,
          teamFitness: { floor: 'MEDIUM', missingCount: 2, fit: 'tight' },
          activitySearchMeta: {
            mode: 'catalog_only',
            probed: 0,
            error: '404',
          },
          dayConflict: { status: 'UNKNOWN' },
        },
      });
      expect(shadow.readiness?.nextAction).toBeTruthy();
      const takeover = resolveDecisionTakeover(shadow);
      expect(['OBSERVE_ONLY_CONTINUE', 'ASK_FROM_READINESS', 'BLOCK_FROM_READINESS']).toContain(
        takeover.kind,
      );
      // 唯一动作：不得同时 ASK 多个键
      if (shadow.readiness?.nextAction === 'ASK_USER') {
        expect(shadow.readiness.askUserKeys.length).toBe(1);
      }
    });
  });

  describe('E. Intent 临界切换（冰川链）', () => {
    const chain: Array<{ msg: string; expectClass: string | RegExp }> = [
      { msg: '冰川徒步需要提前订吗？', expectClass: 'ACTIVITY.BOOKING_GUIDANCE' },
      { msg: '第4天冰川徒步还有位置吗？', expectClass: 'ACTIVITY.AVAILABILITY_CHECK' },
      { msg: '第4天安排冰川徒步怎么样？', expectClass: 'ACTIVITY.SUITABILITY_DECISION' },
      {
        msg: '帮我预订第4天的冰川徒步',
        expectClass: 'ACTIVITY.RESERVATION_PREP',
      },
      { msg: '确认下单支付冰川徒步', expectClass: 'ACTIVITY.RESERVE' },
    ];

    it('Decision Class 逐步升级且不塌到 PLAN/GLOBAL', () => {
      for (const step of chain) {
        const shadow = buildDecisionStateShadow({
          message: step.msg,
          activityHints: { focusDayIndex: 4 },
          transportHints: { tripId: 'trip-1' },
        });
        expect(shadow.classified.decisionClass).toMatch(step.expectClass);
        expect(String(shadow.classified.decisionClass)).not.toMatch(/^PLAN\./);
        expect(String(shadow.classified.decisionClass)).toMatch(/^ACTIVITY\./);
      }
    });
  });

  describe('F. 跨域短切换', () => {
    it('ACTIVITY → LODGING → RISK → PLAN，合同互不污染', () => {
      const steps = [
        {
          msg: '第4天冰川徒步怎么样？',
          class: 'ACTIVITY.SUITABILITY_DECISION',
          ignoredMustInclude: 'day_pace',
        },
        {
          msg: '哪一天没住宿',
          class: 'LODGING.GAP_QUERY',
          ignoredMustInclude: 'team_fitness_floor',
        },
        {
          msg: '第4天会不会太赶？',
          class: 'RISK.PACE_ASSESS',
          ignoredMustInclude: 'fatigue',
        },
        {
          msg: '重新规划一下第四天',
          class: 'PLAN.DAY_REPLAN',
          ignoredMustInclude: 'memberCapability',
        },
      ] as const;

      for (const s of steps) {
        const shadow = buildDecisionStateShadow({
          message: s.msg,
          activityHints: { focusDayIndex: 4 },
          lodgingHints: { tripId: 'trip-1' },
          diningRiskHints: { tripId: 'trip-1', focusDayIndex: 4 },
          transportHints: { tripId: 'trip-1', focusDayIndex: 4 },
        });
        expect(shadow.classified.decisionClass).toBe(s.class);
        expect(shadow.contract?.ignoredWorldKeys.join(' ')).toMatch(
          new RegExp(s.ignoredMustInclude, 'i'),
        );
        // INV-03：blockingKeys 只能是本合同声明键
        const declared = new Set(shadow.contract?.keys.map((k) => k.key) ?? []);
        for (const bk of shadow.readiness?.blockingKeys ?? []) {
          expect(declared.has(bk)).toBe(true);
        }
      }
    });
  });
});
