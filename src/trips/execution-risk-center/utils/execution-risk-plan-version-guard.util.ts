import { ConflictException } from '@nestjs/common';

export function assertPlanVersionNotStale(input: {
  expectedPlanVersionId?: string;
  planDiffBeforePlanVersionId: string;
  currentEffectivePlanVersionId?: string;
}): void {
  const current =
    input.currentEffectivePlanVersionId?.trim() ||
    input.planDiffBeforePlanVersionId;

  if (
    input.expectedPlanVersionId &&
    input.expectedPlanVersionId !== current
  ) {
    throw new ConflictException({
      code: 'PLAN_VERSION_CONFLICT',
      message: 'Effective plan version changed since apply preview',
      expectedPlanVersionId: input.expectedPlanVersionId,
      currentPlanVersionId: current,
    });
  }

  const previewBase = input.planDiffBeforePlanVersionId;
  const isSyntheticBase = previewBase.endsWith('_current');
  if (
    input.currentEffectivePlanVersionId &&
    !isSyntheticBase &&
    previewBase !== input.currentEffectivePlanVersionId
  ) {
    throw new ConflictException({
      code: 'PLAN_VERSION_CONFLICT',
      message: 'Plan diff base version no longer matches effective plan',
      planDiffBeforePlanVersionId: previewBase,
      currentPlanVersionId: input.currentEffectivePlanVersionId,
    });
  }
}
