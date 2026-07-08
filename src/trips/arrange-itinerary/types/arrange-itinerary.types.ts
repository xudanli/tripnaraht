import type { ScheduleTimelineResponseDto } from '../../dto/schedule-timeline.dto';
import type { AttractionExploreCandidatesView } from '../../attraction-explore/types/attraction-explore.types';
import type {
  PlanProposal,
  PlanProposalApplyResult,
  PlanProposalMutationResponse,
  OrchestrationStateView,
} from './plan-proposal.types';

export type {
  PlanProposal,
  PlanProposalApplyResult,
  PlanProposalMutationResponse,
  OrchestrationStateView,
};

export interface ArrangeItineraryMutationResult {
  tripId: string;
  itineraryItem: Record<string, unknown>;
  scheduleTimeline: Pick<ScheduleTimelineResponseDto, 'tripId' | 'days'>;
  candidates?: AttractionExploreCandidatesView;
}

export interface ArrangeItineraryOverviewView {
  tripId: string;
  dayCount: number;
  nights: number;
  totalDriveMinutes: number | null;
  totalDistanceKm: number | null;
  activityCount: number;
  routeSpanKm: number | null;
  unplacedCandidateCount: number;
  pacingLabel: string | null;
  transportLabel: string | null;
  departureLabel: string | null;
}

export interface AttractionExploreAiActionResult {
  action: string;
  answer: string;
  suggestedActions?: Array<{
    action: string;
    label: string;
    previewId?: string;
    candidateId?: string;
    placeId?: number;
    priority?: string;
  }>;
  preview?: {
    scheduleRevision?: number;
    changedItemIds?: string[];
  };
}

export type ArrangeItineraryCommandResult =
  | ArrangeItineraryMutationResult
  | PlanProposalMutationResponse
  | AttractionExploreAiActionResult;
