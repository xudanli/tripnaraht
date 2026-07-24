import {
  buildMinuteBufferRepairOptions,
  buildShiftDepartureRepairOption,
  isPresetMinuteBufferViable,
  isShiftDepartureRepairViable,
  shouldOfferMinuteTimingRepairs,
} from '../../trip-constraint-solver/utils/travel-timing-repair.util';
import { normalizeRepairOptionTradeoffs } from '../normalizers/tradeoff.normalizer';
import {
  classifyCreateDecisionOutcome,
  isDecisionPendingAttention,
  isDecisionResolvedForOverview,
} from '../frontend/decision-center-execution-state-machine.util';
import { refreshRoadClassTransportMessage } from '../../trip-constraint-solver/utils/segment-distance-threshold.util';
import { buildPlanningConflictsCacheKey } from '../../trip-constraint-solver/utils/planning-conflicts-cache-key.util';
import { bumpConstraintsVersion } from '../../trip-constraint-solver/utils/constraints-metadata.util';

describe('semantic trust regression (2026-06-30)', () => {
  describe('2. time-gap repair gates', () => {
    const base = {
      toItemId: 'item-b',
      issueKind: 'inter_day_travel' as const,
      priority: 'must_handle' as const,
    };

    it('shortfall 90min + moderate travel → minute buffers viable', () => {
      expect(
        shouldOfferMinuteTimingRepairs({ ...base, shortfallMinutes: 90, travelMinutes: 200 }),
      ).toBe(true);
      expect(isPresetMinuteBufferViable({ shortfallMinutes: 90, travelMinutes: 200 })).toBe(true);
      expect(buildMinuteBufferRepairOptions({
        issueId: 'i1',
        toItemId: 'item-b',
        shortfallMinutes: 90,
        anchors: { travelMinutes: 200 },
      }).length).toBeGreaterThan(0);
    });

    it('shortfall 121min → no preset minute buffers', () => {
      expect(isPresetMinuteBufferViable({ shortfallMinutes: 121, travelMinutes: 200 })).toBe(false);
      expect(
        buildMinuteBufferRepairOptions({
          issueId: 'i1',
          toItemId: 'item-b',
          shortfallMinutes: 121,
          anchors: { travelMinutes: 200 },
        }),
      ).toEqual([]);
    });

    it('travel 7.5h → shift still viable', () => {
      expect(isShiftDepartureRepairViable({ travelMinutes: 450 })).toBe(true);
      expect(
        shouldOfferMinuteTimingRepairs({ ...base, shortfallMinutes: 90, travelMinutes: 450 }),
      ).toBe(true);
    });

    it('travel 8.1h → no minute-level repairs', () => {
      expect(isShiftDepartureRepairViable({ travelMinutes: 486 })).toBe(false);
      expect(
        shouldOfferMinuteTimingRepairs({ ...base, shortfallMinutes: 90, travelMinutes: 486 }),
      ).toBe(false);
      expect(
        buildMinuteBufferRepairOptions({
          issueId: 'i1',
          toItemId: 'item-b',
          shortfallMinutes: 597,
          anchors: { travelMinutes: 1920 },
        }),
      ).toEqual([]);
    });

    it('does not offer add_buffer_minutes scaled to problem shortfall 597', () => {
      const opts = buildMinuteBufferRepairOptions({
        issueId: 'i1',
        toItemId: 'item-b',
        shortfallMinutes: 597,
        anchors: { travelMinutes: 90 },
      });
      expect(opts.some((o) => o.label?.includes('597'))).toBe(false);
      expect(opts.some((o) => (o.payload?.bufferMinutes as number) >= 500)).toBe(false);
    });
  });

  describe('1. tradeoff must not use problem shortfall as option value', () => {
    it('omits numeric value when only problem shortfall is known', () => {
      const tradeoffs = normalizeRepairOptionTradeoffs(
        {
          id: 'buffer-add-30',
          title: '加 30 分钟缓冲',
          description: '缓解衔接',
          impact: 'medium',
        },
        {
          id: 'issue-1',
          priority: 'must_handle',
          category: 'schedule',
          title: 't',
          message: 'm',
          affectedDays: [2],
          severity: 'high',
          anchors: { shortfallMinutes: 597 },
        },
      );
      const fatigue = tradeoffs.find((t) => t.dimension === 'FATIGUE');
      expect(fatigue?.direction).toBe('IMPROVE');
      expect(fatigue?.value).toBeUndefined();
      expect(fatigue?.explanation).not.toMatch(/597/);
    });

    it('uses payload shiftMinutes/bufferMinutes instead of problem shortfall', () => {
      const buffers = buildMinuteBufferRepairOptions({
        issueId: 'i1',
        toItemId: 'item-b',
        shortfallMinutes: 90,
        anchors: { travelMinutes: 200 },
      });
      const shift = buildShiftDepartureRepairOption({
        issueId: 'i1',
        toItemId: 'item-b',
        shortfallMinutes: 90,
        bufferMinutes: 15,
      });
      const issueCtx = {
        id: 'issue-1',
        priority: 'must_handle' as const,
        category: 'schedule',
        title: 't',
        message: 'm',
        affectedDays: [2],
        severity: 'high' as const,
        anchors: { shortfallMinutes: 597 },
      };

      const t30 = normalizeRepairOptionTradeoffs(
        {
          id: buffers[0].id,
          title: buffers[0].label,
          description: buffers[0].description,
          impact: 'medium',
          actionType: buffers[0].actionType,
          payload: buffers[0].payload,
        },
        issueCtx,
      );
      const t60 = normalizeRepairOptionTradeoffs(
        {
          id: buffers[1].id,
          title: buffers[1].label,
          description: buffers[1].description,
          impact: 'medium',
          actionType: buffers[1].actionType,
          payload: buffers[1].payload,
        },
        issueCtx,
      );
      const tShift = normalizeRepairOptionTradeoffs(
        {
          id: shift.id,
          title: shift.label,
          description: shift.description,
          impact: 'medium',
          actionType: shift.actionType,
          payload: shift.payload,
        },
        issueCtx,
      );

      expect(t30.find((t) => t.dimension === 'TIME' && t.direction === 'WORSEN')?.value).toBe(30);
      expect(t60.find((t) => t.dimension === 'TIME' && t.direction === 'WORSEN')?.value).toBe(60);
      expect(tShift.find((t) => t.dimension === 'TIME' && t.direction === 'WORSEN')?.value).toBe(105);
      expect([t30, t60, tShift].every((ts) => !ts.some((t) => t.value === 597))).toBe(true);
    });
  });

  describe('3. user segment distance overrides country default in messages', () => {
    it('refreshRoadClassTransportMessage uses 380 not 250', () => {
      const stale =
        '第5天 · A → B（约 462 km）· 超长距离行驶(>250km)，强烈建议分段或中途住宿';
      const refreshed = refreshRoadClassTransportMessage(stale, 462, {
        maxSegmentDistanceKm: 380,
        warnSegmentDistanceKm: 228,
        winterWarnSegmentDistanceKm: 120,
      });
      expect(refreshed).toContain('>380km');
      expect(refreshed).not.toContain('>250km');
    });
  });

  describe('4. planning-conflicts cache key bumps with constraintsVersion', () => {
    it('differs across constraint patch', () => {
      const before = buildPlanningConflictsCacheKey({
        updatedAt: new Date(),
        metadata: { revision: 12, constraintsVersion: 5, constraints: { maxSegmentDistanceKm: 250 } },
      });
      const after = buildPlanningConflictsCacheKey({
        updatedAt: new Date(),
        metadata: bumpConstraintsVersion({
          revision: 12,
          constraintsVersion: 5,
          constraints: { maxSegmentDistanceKm: 380 },
        }),
      });
      expect(before).not.toBe(after);
    });
  });

  describe('5. overview / UI classification for non-success terminal states', () => {
    const base = {
      decision: {
        id: 'dec_1',
        tripId: 't1',
        problemId: 'dp1',
        selectedOptionId: 'opt1',
        rejectedOptionIds: [],
        decidedBy: [],
        authoritySnapshot: {
          decisionDomain: 'ROUTE' as const,
          proposer: 'SYSTEM' as const,
          requiredApprover: 'SYSTEM' as const,
          executionMode: 'AUTO' as const,
          overridable: false,
        },
        reasons: [],
        decidedAt: new Date().toISOString(),
        tripVersionBefore: 'v1',
        status: 'EXECUTED' as const,
        validationStatus: 'CONFIRMED' as const,
      },
    };

    it('IDEMPOTENT_REPLAY is not green success', () => {
      const r = classifyCreateDecisionOutcome({
        ...base,
        executionStatus: 'IDEMPOTENT_REPLAY',
        idempotentReplay: true,
        effectiveDecisionId: 'dec_first',
      });
      expect(r.shouldShowSuccessToast).toBe(false);
      expect(r.variant).toBe('neutral_replay');
    });

    it('ROLLED_BACK is not green success', () => {
      const r = classifyCreateDecisionOutcome({
        ...base,
        decision: { ...base.decision, status: 'ROLLED_BACK' },
        executionStatus: 'ROLLED_BACK',
      });
      expect(r.shouldShowSuccessToast).toBe(false);
      expect(r.variant).toBe('error_rolled_back');
    });

    it('PARTIALLY_APPLIED with needsRepair stays pending attention', () => {
      expect(isDecisionPendingAttention('PARTIALLY_APPLIED')).toBe(true);
      expect(isDecisionResolvedForOverview('PARTIALLY_APPLIED')).toBe(false);
      const r = classifyCreateDecisionOutcome({
        ...base,
        decision: { ...base.decision, status: 'PARTIALLY_APPLIED' },
        executionStatus: 'PARTIALLY_APPLIED',
        needsRepair: true,
      });
      expect(r.shouldShowSuccessToast).toBe(false);
    });

    it('RESOLVED is not pending attention', () => {
      expect(isDecisionPendingAttention('RESOLVED')).toBe(false);
      expect(isDecisionResolvedForOverview('RESOLVED')).toBe(true);
    });
  });
});
