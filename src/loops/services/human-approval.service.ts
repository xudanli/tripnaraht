import { Injectable } from '@nestjs/common';
import type { LoopRunStatus, TripRuntimeState } from '../types/loop-definition.types';

@Injectable()
export class HumanApprovalService {
  requiresApprovalForRepair(actionType?: string): boolean {
    const autoSafe = new Set([
      'refresh_evidence',
      'mark_not_applicable',
      'add_to_later',
      'adjust_metadata',
    ]);
    if (!actionType) return true;
    return !autoSafe.has(actionType);
  }

  mapStatusToRuntimeState(status: LoopRunStatus): TripRuntimeState {
    switch (status) {
      case 'RUNNING':
        return 'VALIDATING';
      case 'WAITING_FOR_HUMAN':
        return 'WAITING_FOR_HUMAN';
      case 'COMPLETED':
        return 'MONITORING';
      case 'FAILED':
        return 'FAILED';
      case 'PAUSED':
        return 'PAUSED';
      default:
        return 'IDLE';
    }
  }
}
