import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';

/**
 * Destination 域大包：POI / opening / DEM / hazard / world model / prediction（与 Monolith needsDestinationBundle 对齐）。
 */
export type ResearchMemberDestinationBundleInput = {
  requestId: string;
  routeDirectionId?: string;
  userId?: string;
  dso: DecisionState;
  tripPlanRequest: NonNullable<PhaseExecutorContext['tripPlanRequest']>;
  researchData: Record<string, unknown>;
  evidenceRefs: string[];
  itinerary?: PhaseExecutorContext['itinerary'];
  recentMessages?: string[];
};
