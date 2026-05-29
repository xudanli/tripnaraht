import { Test } from '@nestjs/testing';
import { PlanConstraintsDetectConflictsSkill } from './plan-constraints-detect-conflicts.skill';
import type { PlanState } from '../shared/plan-state.types';

function basePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    plan_id: 'plan-1',
    plan_version: 1,
    constraints: {
      time: { days: 3 },
      budget: { total: 10000, currency: 'CNY' },
      fitness: {},
    },
    itinerary: {} as PlanState['itinerary'],
    mobility: { transferSegments: [] },
    budget: {},
    pace: {},
    gate: { status: 'open', reasons: [], confirmationPoints: [] },
    evidence_refs: [],
    decision_log_refs: [],
    ...overrides,
  } as PlanState;
}

describe('PlanConstraintsDetectConflictsSkill', () => {
  let skill: PlanConstraintsDetectConflictsSkill;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PlanConstraintsDetectConflictsSkill],
    }).compile();
    skill = module.get(PlanConstraintsDetectConflictsSkill);
  });

  it('detects budget overrun conflict', async () => {
    const planState = basePlanState({
      budget: {
        overrun: { overrunAmount: 2500, overrunDrivers: [] },
      },
    });

    const result = await skill.execute({ planState });
    expect(result.conflicts.conflicts.some((c) => c.type === 'budget')).toBe(true);
  });

  it('detects infeasible transfer segments', async () => {
    const planState = basePlanState({
      mobility: {
        transferSegments: [
          {
            id: 'seg-1',
            from: { city: 'A' },
            to: { city: 'B' },
            feasibility: 'infeasible',
            riskFlags: [],
          },
        ],
      },
    });

    const result = await skill.execute({ planState });
    expect(result.conflicts.conflicts.some((c) => c.type === 'feasibility')).toBe(true);
  });
});
