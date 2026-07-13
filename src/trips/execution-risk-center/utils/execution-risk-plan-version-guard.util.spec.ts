import { ConflictException } from '@nestjs/common';
import { assertPlanVersionNotStale } from './execution-risk-plan-version-guard.util';

describe('execution-risk-plan-version-guard.util', () => {
  it('MAT-006: rejects confirm when expected plan version is stale', () => {
    expect(() =>
      assertPlanVersionNotStale({
        expectedPlanVersionId: 'pv_v10',
        planDiffBeforePlanVersionId: 'pv_v10',
        currentEffectivePlanVersionId: 'pv_v11',
      }),
    ).toThrow(ConflictException);

    try {
      assertPlanVersionNotStale({
        expectedPlanVersionId: 'pv_v10',
        planDiffBeforePlanVersionId: 'pv_v10',
        currentEffectivePlanVersionId: 'pv_v11',
      });
    } catch (e) {
      expect((e as ConflictException).getResponse()).toMatchObject({
        code: 'PLAN_VERSION_CONFLICT',
      });
    }
  });

  it('allows confirm when expected version matches effective plan', () => {
    expect(() =>
      assertPlanVersionNotStale({
        expectedPlanVersionId: 'pv_v11',
        planDiffBeforePlanVersionId: 'pv_v11',
        currentEffectivePlanVersionId: 'pv_v11',
      }),
    ).not.toThrow();
  });
});
