import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import {
  buildPlanGateSubmitEligibility,
  mapProgressToPipelineSteps,
  projectPlanGateUi,
  validateConfirmedItemsForCommit,
} from './plan-gate-verification.projection.util';
import type { PlanGatePendingConfirmationDto } from '../dto/plan-gate.dto';

const basePlanState = (): PlanState => ({
  plan_id: 'plan_1',
  plan_version: 4,
  constraints: { time: { days: 5 }, budget: { total: 20000, currency: 'CNY' }, fitness: {} },
  itinerary: {
    tripId: 'trip_1',
    routeDirectionId: 'r1',
    segments: [
      {
        segmentId: 'd1',
        dayIndex: 0,
        distanceKm: 120,
        ascentM: 0,
        slopePct: 0,
        metadata: { day: 1, theme: '黄金圈' },
      },
    ],
  },
  mobility: { transferSegments: [] },
  budget: { overrun: { overrunAmount: 620, overrunDrivers: [] } },
  pace: {
    fatigueScore: {
      paceScore: 82,
      fatigueDrivers: [
        { type: 'long_walk', severity: 85, description: 'Day 3 连续户外活动 7 小时' },
      ],
      suggestedRestPoints: [],
    },
  },
  gate: {
    status: 'NEED_CONFIRM',
    reasons: ['Day 3 老人组负荷偏高'],
    missingEvidence: [],
    guardianResults: {
      abu: { verdict: 'ALLOW', evidence: [] },
      drdre: { verdict: 'ADJUST', evidence: ['Day 3 节奏偏紧'] },
      neptune: { verdict: 'ALLOW', evidence: [] },
    },
    requiredUserConfirmations: ['是否接受 Day 3 节奏安排？'],
  },
  evidence_refs: [],
  decision_log_refs: [],
  status: 'DRAFT',
  metadata: {},
});

describe('plan-gate-verification.projection.util', () => {
  describe('projectPlanGateUi', () => {
    it('projects three verification dimensions and pending confirmations', () => {
      const planState = basePlanState();
      const ui = projectPlanGateUi({
        planState,
        uiOutput: {
          confirmations: ['是否接受 Day 3 节奏安排？'],
          consolidatedDecision: {
            status: 'NEED_CONFIRM',
            summary: 'Day 3 连续活动 7 小时',
            nextSteps: [],
          },
        },
      });

      expect(ui.verification.draftLabel).toBe('A4');
      expect(ui.verification.dimensions).toHaveLength(3);
      expect(ui.verification.dimensions.map((d) => d.key)).toEqual([
        'safetyFeasibility',
        'paceLoad',
        'experienceCompleteness',
      ]);
      expect(ui.verification.overallStatus).toBe('need_confirm');
      expect(ui.verification.pendingConfirmations?.length).toBeGreaterThan(0);
      expect(ui.submitEligibility.mode).toBe('pending_confirmations');
      expect(ui.submitEligibility.canSubmitToTimeline).toBe(false);
    });

    it('marks blocked when gate is REJECT', () => {
      const planState = basePlanState();
      planState.gate.status = 'REJECT';
      const ui = projectPlanGateUi({ planState, uiOutput: {} });
      expect(ui.verification.overallStatus).toBe('blocked');
      expect(ui.submitEligibility.blockers.length).toBeGreaterThan(0);
    });
  });

  describe('validateConfirmedItemsForCommit', () => {
    const pending: PlanGatePendingConfirmationDto[] = [
      { id: 'signoff_0', title: '节奏', description: '确认 Day 3', kind: 'sign_off', severity: 'need_confirm' },
    ];

    it('requires confirmedItems when pending exist', () => {
      const err = validateConfirmedItemsForCommit({ pendingConfirmations: pending });
      expect(err?.code).toBe('MISSING_CONFIRMED_ITEMS');
    });

    it('passes when all pending items accepted', () => {
      const err = validateConfirmedItemsForCommit({
        pendingConfirmations: pending,
        confirmedItems: [{ confirmationId: 'signoff_0', accepted: true }],
      });
      expect(err).toBeNull();
    });
  });

  describe('mapProgressToPipelineSteps', () => {
    it('maps progress to five pipeline steps', () => {
      const steps = mapProgressToPipelineSteps(45);
      expect(steps).toHaveLength(5);
      expect(steps.filter((s) => s.status === 'completed').length).toBeGreaterThan(0);
      expect(steps.some((s) => s.status === 'running')).toBe(true);
    });

    it('marks all completed at 100%', () => {
      const steps = mapProgressToPipelineSteps(100);
      expect(steps.every((s) => s.status === 'completed')).toBe(true);
    });
  });

  describe('buildPlanGateSubmitEligibility', () => {
    it('allows submit when pass and no pending', () => {
      const eligibility = buildPlanGateSubmitEligibility({
        overallStatus: 'pass',
        pendingConfirmations: [],
        hardBlocked: false,
      });
      expect(eligibility.canSubmitToTimeline).toBe(true);
      expect(eligibility.mode).toBe('ready');
    });
  });
});
