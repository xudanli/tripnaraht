import { Test } from '@nestjs/testing';
import { PlanBudgetDetectOverrunSkill } from './plan-budget-detect-overrun.skill';
import type { PlanState } from '../shared/plan-state.types';

describe('PlanBudgetDetectOverrunSkill', () => {
  let skill: PlanBudgetDetectOverrunSkill;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PlanBudgetDetectOverrunSkill],
    }).compile();
    skill = module.get(PlanBudgetDetectOverrunSkill);
  });

  it('returns null when within budget', async () => {
    const planState = {
      plan_id: 'p1',
      constraints: { budget: { total: 10000 }, time: { days: 3 }, fitness: {} },
      budget: {
        breakdown: {
          categories: [
            { category: 'transportation', min: 1000, max: 2000, estimated: 1500, assumptions: [] },
            { category: 'food', min: 500, max: 800, estimated: 600, assumptions: [] },
          ],
        },
      },
    } as PlanState;

    const result = await skill.execute({ planState });
    expect(result.overrun).toBeNull();
  });

  it('detects overrun and top drivers', async () => {
    const planState = {
      plan_id: 'p1',
      constraints: { budget: { total: 5000 }, time: { days: 3 }, fitness: {} },
      mobility: { transferSegments: [{ id: 's1' }, { id: 's2' }] },
      budget: {
        breakdown: {
          categories: [
            { category: 'transportation', min: 2000, max: 4000, estimated: 3500, assumptions: [] },
            { category: 'accommodation', min: 1500, max: 2500, estimated: 2200, assumptions: [] },
          ],
        },
      },
    } as PlanState;

    const result = await skill.execute({ planState });
    expect(result.overrun?.overrunAmount).toBe(700);
    expect(result.overrun?.overrunDrivers.length).toBeGreaterThan(0);
  });
});
