import { ConflictException } from '@nestjs/common';

export function assertTepRepairOptionFresh(input: {
  basePlanVersionId?: string;
  currentEffectivePlanVersionId?: string;
  optionId: string;
}): void {
  const current = input.currentEffectivePlanVersionId?.trim();
  const base = input.basePlanVersionId?.trim();

  if (!base || !current || base === current) {
    return;
  }

  throw new ConflictException({
    code: 'STALE_REPAIR_OPTION',
    message: 'Recovery option preview is based on a superseded plan version; refresh adjustment queue',
    optionId: input.optionId,
    basePlanVersionId: base,
    currentPlanVersionId: current,
  });
}
