/**
 * Travel compile phase（启用时）宿主。
 */

import type { ConfigService } from '@nestjs/config';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export interface TravelCompilePhaseIfEnabledHost {
  readonly travelCompiler?: unknown;
  readonly travelGraphStore?: unknown;
  readonly configService?: ConfigService;
  readonly routeAndRunTaskProgress?: {
    reportCtreCompilationProgress(view: unknown): Promise<unknown> | void;
  };
  touchAsyncTaskProgress(step: string): void;
  maybeSnapshot(
    state: OrchestratorState,
    trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT',
  ): void;
}
