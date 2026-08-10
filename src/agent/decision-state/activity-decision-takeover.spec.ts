import { buildActivityDecisionShadow } from './activity-decision-shadow.util';
import {
  resolveActivityDecisionTakeover,
  isActivityDecisionTakeoverEnabled,
} from './activity-decision-takeover.util';
import { applyContractAcquisitionToCrePlan } from './apply-contract-acquisition.util';
import { getActivityDecisionContract } from './activity-decision.contracts';
import type { ContextRequirementPlan } from '../context-requirement/context-requirement.types';

describe('Activity Decision Takeover Phase2/3', () => {
  const prev = process.env.DECISION_STATE_ACTIVITY_TAKEOVER;

  afterEach(() => {
    if (prev === undefined) delete process.env.DECISION_STATE_ACTIVITY_TAKEOVER;
    else process.env.DECISION_STATE_ACTIVITY_TAKEOVER = prev;
  });

  it('默认开启 takeover', () => {
    delete process.env.DECISION_STATE_ACTIVITY_TAKEOVER;
    expect(isActivityDecisionTakeoverEnabled()).toBe(true);
  });

  it('预订第4天冰川徒步 → OBSERVE_ONLY_CONTINUE（抑制 CRE/ROR ASK）', () => {
    process.env.DECISION_STATE_ACTIVITY_TAKEOVER = '1';
    const shadow = buildActivityDecisionShadow({
      message: '预订第4天的冰川徒步活动',
      hints: {
        focusDayIndex: 4,
        teamFitness: { floor: 'MEDIUM', missingCount: 1, fit: 'tight' },
        activitySearchMeta: { mode: 'catalog_only', probed: 0, error: '404' },
        dayConflict: { status: 'NONE' },
      },
      legacy: { wouldAskUser: true, blockKeys: ['day_pace'] },
    });
    const takeover = resolveActivityDecisionTakeover(shadow);
    expect(takeover.kind).toBe('OBSERVE_ONLY_CONTINUE');
    if (takeover.kind === 'OBSERVE_ONLY_CONTINUE') {
      expect(takeover.suppressCreAsk).toBe(true);
      expect(takeover.suppressRorAsk).toBe(true);
      expect(takeover.readiness.nextAction).toBe('SHOW_CARD');
    }
  });

  it('有活动无日锚点 → ASK_FROM_READINESS（唯一追问 day_anchor）', () => {
    process.env.DECISION_STATE_ACTIVITY_TAKEOVER = '1';
    const shadow = buildActivityDecisionShadow({
      message: '帮我预订冰川徒步',
    });
    expect(shadow.classified.decisionClass).toBe('ACTIVITY.RESERVATION_PREP');
    expect(shadow.readiness?.nextAction).toBe('ASK_USER');
    expect(shadow.readiness?.askUserKeys).toContain('day_anchor');
    const takeover = resolveActivityDecisionTakeover(shadow);
    expect(takeover.kind).toBe('ASK_FROM_READINESS');
    if (takeover.kind === 'ASK_FROM_READINESS') {
      expect(takeover.askKeys).toContain('day_anchor');
    }
  });

  it('开关关闭 → INACTIVE', () => {
    process.env.DECISION_STATE_ACTIVITY_TAKEOVER = '0';
    const shadow = buildActivityDecisionShadow({
      message: '预订第4天的冰川徒步活动',
      hints: { focusDayIndex: 4, dayConflict: { status: 'NONE' } },
    });
    expect(resolveActivityDecisionTakeover(shadow).kind).toBe('INACTIVE');
  });

  it('Phase3：合同 acquisition 并入 fetchKeys', () => {
    const contract = getActivityDecisionContract('ACTIVITY.RESERVATION_PREP')!;
    const plan = {
      operation: 'ASK_TRIP_QUESTION',
      confidence: 1,
      executionLevel: 'LIGHT',
      target: {},
      requirements: [],
      blockingGaps: [],
      userQuestions: [],
      nextAction: 'ANSWER',
      acquisition: {
        slimLoad: true,
        skipQueryExpansion: true,
        skipRisksRag: true,
        fetchKeys: ['trip.destination'],
      },
      reason: 'test',
    } as ContextRequirementPlan;
    const next = applyContractAcquisitionToCrePlan(plan, contract);
    expect(next.acquisition.fetchKeys).toEqual(
      expect.arrayContaining([
        'trip.destination',
        'participants.fitnessProfile',
        'booking.availability',
      ]),
    );
  });
});
