import { BadRequestException } from '@nestjs/common';
import { isEffectivePlanWriteChainEnabled } from '../../../decision-runtime/execution/effective-plan-write-chain.config';

export function assertExecutionAdvisoryDirectApplyAllowed(caller = 'ExecutionAdvisoryApplyService'): void {
  if (!isEffectivePlanWriteChainEnabled()) return;
  throw new BadRequestException({
    code: 'WRITE_CHAIN_BLOCKED',
    message: `计划变更需通过决策空间 apply（${caller} 直写已关闭）`,
  });
}
