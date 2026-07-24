import type { JourneyMapEvidenceVerdict } from './journey-map.dto';

export interface CreateJourneyMapDecisionItemDto {
  activityId?: string;
  title: string;
  description?: string;
  severity?: 'high' | 'medium' | 'low';
  source?: 'journey_map_inspector';
  verdict?: JourneyMapEvidenceVerdict;
  riskLabels?: string[];
  constraintsVersion?: number;
}

export interface JourneyMapDecisionItemDto {
  id: string;
  tripId: string;
  activityId?: string;
  title: string;
  description?: string;
  severity: 'high' | 'medium' | 'low';
  status: 'open' | 'resolved';
  source: string;
  verdict?: JourneyMapEvidenceVerdict;
  riskLabels?: string[];
  createdAt: string;
  createdBy: string;
}

export interface CreateJourneyMapDecisionItemResponseDto {
  item: JourneyMapDecisionItemDto;
  constraintsVersion: number;
}
