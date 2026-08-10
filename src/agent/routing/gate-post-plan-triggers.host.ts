/**
 * Gate 通过后、PLAN 前自动触发问卷 / 偏好轮次宿主。
 */

import type { Logger } from '@nestjs/common';
import type { DecisionProfilingOrchestrationHint } from '../../trips/decision-profiling/types/decision-profiling-orchestration.types';
import type { ProcessFairnessOrchestrationHint } from '../../trips/process-fairness/types/process-fairness-orchestration.types';

export interface GatePostPlanTriggersHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly decisionProfilingOrchestrator?: {
    tryAutoPromptQuiz: (input: {
      tripId: string;
      userId: string;
      message: string;
    }) => Promise<DecisionProfilingOrchestrationHint>;
  };
  readonly preferenceRoundOrchestrator?: {
    tryAutoStartForRequest: (input: {
      tripId: string;
      userId: string;
      message: string;
    }) => Promise<ProcessFairnessOrchestrationHint>;
  };
}
