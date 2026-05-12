import type { ExecutionSimulationReport } from '../execution-simulation/execution-simulation.types';
import type { TripDraftState } from '../state/trip-draft-state.types';
import type { TripDraftResponseDto } from '../../dto/trip-draft.dto';
import type { DecisionTrace } from '../decision-trace/decision-trace.types';

/** 统一 Draft Runtime 管线产物（API 可映射为 OpenAPI 展开字段）。 */
export interface DraftPipelineResult {
  response: TripDraftResponseDto;
  tripDraftState: TripDraftState;
  simulation?: ExecutionSimulationReport;
  draftId: string;
  decisionTrace?: DecisionTrace;
}
