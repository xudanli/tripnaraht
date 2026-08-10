/**
 * Travel compile phase（启用时）（从 ClaudeOrchestrator 迁出）。
 */

import type { TravelCompilePhaseIfEnabledHost } from './travel-compile-phase-if-enabled.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { runTravelCompilePhase } from '../orchestration/travel-compile/travel-compile-phase.util';

export async function runTravelCompilePhaseIfEnabled(
  host: TravelCompilePhaseIfEnabledHost,
  state: OrchestratorState,
  request: RouteAndRunRequestDto,
): Promise<void> {
  host.touchAsyncTaskProgress('TRAVEL_COMPILE');
  await runTravelCompilePhase({
    state,
    request,
    compiler: host.travelCompiler as any,
    graphStore: host.travelGraphStore as any,
    configService: host.configService as any,
    onProgress: (view) => {
      void host.routeAndRunTaskProgress?.reportCtreCompilationProgress(view);
    },
  });
  host.maybeSnapshot(state, 'AUTO');
}
