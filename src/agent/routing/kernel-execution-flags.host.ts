/**
 * Kernel 开关 / 灰度 / createInitial opts 宿主。
 */

import type { ConfigService } from '@nestjs/config';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { HarnessTraceFinalStatus } from '../../harness/tracing/harness-trace.types';

export interface KernelExecutionFlagsHost {
  readonly configService?: ConfigService;
  readonly decisionKernel?: {
    finalizeHarnessTraceIfRecorded: (
      decisionState: DecisionState,
      finalStatus: HarnessTraceFinalStatus,
    ) => void;
  };
}
