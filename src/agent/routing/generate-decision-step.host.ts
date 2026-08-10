/**
 * Decision Step 生成宿主。
 */

import type { Logger } from '@nestjs/common';
import type { OrchestrationStep, OrchestratorState, SubAgentType } from '../interfaces/trip-plan.interface';

export interface GenerateDecisionStepHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly decisionDraftGenerator?: {
    generateDecisionStepFromOrchestrationState: (
      state: OrchestratorState,
      orchestrationStep: OrchestrationStep,
      subAgent?: SubAgentType,
    ) => Promise<unknown>;
  };
}
