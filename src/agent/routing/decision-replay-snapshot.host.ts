/**
 * DecisionReplay 自动快照宿主。
 */

import type { ConfigService } from '@nestjs/config';
import type { Logger } from '@nestjs/common';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export interface DecisionReplaySnapshotHost {
  readonly logger: Pick<Logger, 'warn'>;
  readonly configService?: ConfigService;
  readonly decisionReplay?: {
    createSnapshot(
      state: OrchestratorState,
      trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT',
    ): void;
  };
}
