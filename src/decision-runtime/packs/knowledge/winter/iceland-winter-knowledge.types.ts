/**
 * Winter / season knowledge slices for Iceland Self-Drive Situation.
 * Structured facts only — unknown stays UNKNOWN; never invent hours or plow ETA.
 */

import type { SourceReference } from '../iceland-knowledge.types';
import type { CrossDomainAggregateStatus } from '../road-weather/iceland-road-weather.types';

export type AttractionWinterAccessStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'PENDING_CONFIRMATION'
  | 'UNKNOWN';

export type AttractionWinterEnforcement = 'HARD' | 'SOFT';

export interface AttractionWinterAccessInput {
  poiId: string;
  status: AttractionWinterAccessStatus;
  enforcement?: AttractionWinterEnforcement;
  reasons?: string[];
  validFrom?: string;
  validTo?: string;
}

export interface AttractionWinterAccessAssessment {
  poiId: string;
  status: AttractionWinterAccessStatus;
  enforcement?: AttractionWinterEnforcement;
  reasons: string[];
  gate: CrossDomainAggregateStatus;
  recommendedActions: string[];
  evidence: SourceReference[];
}

export type ActivitySessionStatus =
  | 'SCHEDULED'
  | 'WEATHER_HOLD'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface ActivityWinterRiskInput {
  experienceCode: string;
  weatherDependency?: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  /** Closed enum cancel codes from product catalog — not free text. */
  cancelReasonCodes?: string[];
  sessionStatus?: ActivitySessionStatus;
}

export interface ActivityWinterRiskAssessment {
  experienceCode: string;
  weatherDependency?: ActivityWinterRiskInput['weatherDependency'];
  cancelReasonCodes: string[];
  sessionStatus: ActivitySessionStatus;
  gate: CrossDomainAggregateStatus;
  reasons: string[];
  recommendedActions: string[];
  evidence: SourceReference[];
}

export type PlowServiceBand = 'DAILY' | 'REDUCED' | 'NOT_PLOWED' | 'UNKNOWN';

export interface SnowPlowDelayInput {
  roadSegmentId?: string;
  /** Vegagerðin plow rule code when known (e.g. 7X, EKKI_MOKAD). */
  plowRuleCode?: string;
  plowServiceBand?: PlowServiceBand;
  /** Inclusive delay range minutes — never a fake single point. */
  plowDelayRangeMin?: [number, number];
}

export interface SnowPlowDelayAssessment {
  roadSegmentId?: string;
  plowRuleCode?: string;
  plowServiceBand: PlowServiceBand;
  plowDelayRangeMin?: [number, number];
  gate: CrossDomainAggregateStatus;
  reasons: string[];
  recommendedActions: string[];
  evidence: SourceReference[];
}

export type LodgingOpeningMode =
  | 'KNOWN'
  | 'UNKNOWN'
  | 'SEASONAL_REDUCED';

export interface LodgingHoursInput {
  openingMode: LodgingOpeningMode;
  /** Minutes from local midnight when sourced / policy default for load math. */
  latestArrivalLocalMin?: number;
  hoursUnknown?: boolean;
}

export interface LodgingHoursAssessment {
  openingMode: LodgingOpeningMode;
  latestArrivalLocalMin?: number;
  hoursUnknown: boolean;
  gate: CrossDomainAggregateStatus;
  reasons: string[];
  recommendedActions: string[];
  evidence: SourceReference[];
}

export interface IcelandWinterKnowledgeInput {
  attractionAccess?: AttractionWinterAccessInput;
  activityRisk?: ActivityWinterRiskInput;
  snowPlow?: SnowPlowDelayInput;
  lodging?: LodgingHoursInput;
}

export interface IcelandWinterKnowledgeAssessments {
  attractionAccess?: AttractionWinterAccessAssessment;
  activityRisk?: ActivityWinterRiskAssessment;
  snowPlow?: SnowPlowDelayAssessment;
  lodging?: LodgingHoursAssessment;
}
