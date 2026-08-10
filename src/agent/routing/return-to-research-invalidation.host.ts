/**
 * RETURN_TO_RESEARCH 定向失效宿主。
 */

import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

export interface ReturnToResearchInvalidationHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly decisionKernel?: {
    updateState: (state: DecisionState, patch: any) => DecisionState;
  };
  readonly researchPriorSnapshot?: {
    load: (request: RouteAndRunRequestDto) => Promise<Record<string, unknown> | null | undefined>;
  };
}
