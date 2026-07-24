import type { Logger } from '@nestjs/common';
import type { AgentContext } from '../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { HallucinationDetectionResult } from '../../interfaces/hallucination-detection.interface';
import type { HallucinationPhaseOutcome } from './hallucination-phase.executor';

export interface RunHallucinationPhaseParams {
  request: RouteAndRunRequestDto;
  context: AgentContext;
  state: OrchestratorState;
}

export type { HallucinationPhaseOutcome };

export interface HallucinationPhaseHost {
  readonly logger: Logger;

  readonly hallucinationDetection?: {
    detectHallucinations(
      output: unknown,
      context?: AgentContext,
    ): Promise<HallucinationDetectionResult>;
  };
}
