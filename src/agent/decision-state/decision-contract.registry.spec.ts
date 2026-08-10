import {
  assertDecisionStateRegistryFrozen,
  FROZEN_DECISION_CLASS_COUNT,
  listAllDecisionContracts,
  validateDecisionContractRegistry,
} from './decision-contract.registry';
import { applyContractAcquisitionToCrePlan } from './apply-contract-acquisition.util';
import { getActivityDecisionContract } from './activity-decision.contracts';
import type { ContextRequirementPlan } from '../context-requirement/context-requirement.types';

describe('Decision Contract Registry', () => {
  it('冻结：恰好 16 类，覆盖 Activity→Plan', () => {
    const classes = listAllDecisionContracts().map((c) => c.decisionClass);
    expect(classes).toHaveLength(FROZEN_DECISION_CLASS_COUNT);
    expect(assertDecisionStateRegistryFrozen().ok).toBe(true);
    expect(classes).toEqual(
      expect.arrayContaining([
        'ACTIVITY.RESERVATION_PREP',
        'LODGING.GAP_QUERY',
        'TRANSPORT.VEHICLE_FIT',
        'ROUTE.DAY_ORDER_OPTIMIZE',
        'DINING.NEAR_POI',
        'RISK.PACE_ASSESS',
        'PLAN.DAY_REPLAN',
      ]),
    );
  });

  it('每个合同通过结构校验', () => {
    const results = validateDecisionContractRegistry();
    const bad = results.filter((r) => !r.ok);
    expect(bad).toEqual([]);
  });

  it('RESERVATION_PREP 合同强制 slimLoad=false 并并入 fetchKeys', () => {
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
    expect(next.acquisition.slimLoad).toBe(false);
    expect(next.acquisition.fetchKeys).toEqual(
      expect.arrayContaining([
        'participants.fitnessProfile',
        'booking.availability',
      ]),
    );
    expect(next.reason).toMatch(/slimLoad=0/);
  });

  it('BOOKING_GUIDANCE 仅目录 → 可保持 slimLoad', () => {
    const contract = getActivityDecisionContract('ACTIVITY.BOOKING_GUIDANCE')!;
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
        fetchKeys: [],
      },
      reason: 'test',
    } as ContextRequirementPlan;
    const next = applyContractAcquisitionToCrePlan(plan, contract);
    expect(next.acquisition.slimLoad).toBe(true);
  });
});
