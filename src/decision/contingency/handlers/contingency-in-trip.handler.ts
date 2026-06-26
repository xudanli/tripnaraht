import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { LoopTriggerService } from '../../../loops/services/loop-trigger.service';
import type { InTripLoopTriggerInput } from '../../../loops/services/loop-trigger.types';
import type { ContingencyHandlerResult } from '../contingency-handler.types';

@Injectable()
export class ContingencyInTripHandler {
  constructor(
    @Inject(forwardRef(() => LoopTriggerService))
    private readonly loopTrigger: LoopTriggerService,
  ) {}

  async handle(
    tripId: string,
    _reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<ContingencyHandlerResult> {
    const input = metadata as unknown as InTripLoopTriggerInput | undefined;
    if (!input?.userId) {
      throw new Error('IN_TRIP_RECOVERY requires userId in metadata');
    }

    const result = await this.loopTrigger.executeInTripRecovery({
      ...input,
      tripId: input.tripId ?? tripId,
    });

    if (result.action === 'skipped') {
      return { outcome: 'SKIPPED', payload: result };
    }

    const requiresApproval = result.result.requiresApproval === true;
    const failed = result.result.status === 'FAILED';
    const outcome = failed ? 'FAILED' : requiresApproval ? 'PARTIAL' : 'SUCCESS';

    return {
      outcome,
      payload: result,
      humanAssisted: requiresApproval,
    };
  }
}
