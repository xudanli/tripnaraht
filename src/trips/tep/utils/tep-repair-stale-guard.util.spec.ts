import { ConflictException } from '@nestjs/common';
import { assertTepRepairOptionFresh } from './tep-repair-stale-guard.util';

describe('assertTepRepairOptionFresh', () => {
  it('allows when base matches current effective', () => {
    expect(() =>
      assertTepRepairOptionFresh({
        basePlanVersionId: 'plan_v6',
        currentEffectivePlanVersionId: 'plan_v6',
        optionId: 'REPAIR-1',
      }),
    ).not.toThrow();
  });

  it('allows when base is omitted', () => {
    expect(() =>
      assertTepRepairOptionFresh({
        currentEffectivePlanVersionId: 'plan_v6',
        optionId: 'REPAIR-1',
      }),
    ).not.toThrow();
  });

  it('rejects stale base plan version', () => {
    expect(() =>
      assertTepRepairOptionFresh({
        basePlanVersionId: 'plan_v5',
        currentEffectivePlanVersionId: 'plan_v6',
        optionId: 'REPAIR-1',
      }),
    ).toThrow(ConflictException);

    try {
      assertTepRepairOptionFresh({
        basePlanVersionId: 'plan_v5',
        currentEffectivePlanVersionId: 'plan_v6',
        optionId: 'REPAIR-1',
      });
    } catch (err) {
      expect((err as ConflictException).getResponse()).toMatchObject({
        code: 'STALE_REPAIR_OPTION',
        basePlanVersionId: 'plan_v5',
        currentPlanVersionId: 'plan_v6',
      });
    }
  });
});
