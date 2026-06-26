import { Injectable } from '@nestjs/common';
import type { ContingencyHandlerResult } from '../contingency-handler.types';

/**
 * ADVISOR_PLAN_B：Gate1 顾问发布/触发 Plan B 后登记 SLO（业务写入由 Gate1PlanBService 完成）。
 */
@Injectable()
export class ContingencyAdvisorPlanBHandler {
  async handle(
    _tripId: string,
    _reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<ContingencyHandlerResult> {
    const triggered = metadata?.triggered === true;
    const adopted = metadata?.adopted === true;
    if (!triggered) {
      return { outcome: 'SKIPPED', payload: metadata, humanAssisted: true };
    }
    return {
      outcome: adopted ? 'SUCCESS' : 'PARTIAL',
      payload: metadata,
      humanAssisted: true,
    };
  }
}
