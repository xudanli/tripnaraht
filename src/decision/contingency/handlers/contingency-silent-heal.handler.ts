import { Injectable } from '@nestjs/common';
import type { ContingencyHandlerResult } from '../contingency-handler.types';

/**
 * SILENT_HEAL 路径：ActionExecution 完成静默修复后登记 SLO（handler 不重复执行修复）。
 */
@Injectable()
export class ContingencySilentHealHandler {
  async handle(
    _tripId: string,
    _reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<ContingencyHandlerResult> {
    const success = metadata?.success === true;
    return {
      outcome: success ? 'SUCCESS' : 'FAILED',
      payload: metadata,
      humanAssisted: false,
    };
  }
}
