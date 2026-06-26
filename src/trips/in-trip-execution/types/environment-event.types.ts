/** M8 Environment Radar — 类型定义 */

export type EnvironmentEventType = 'weather' | 'traffic' | 'attraction' | 'other';

export type EnvironmentSeverity = 'green' | 'yellow' | 'red';

export type EnvironmentEventStatus = 'open' | 'voting' | 'resolved' | 'dismissed';

export interface EnvironmentAffectedItem {
  itemType: 'activity' | 'transport' | 'accommodation' | 'dining';
  itemId: string;
  itemName: string;
  originalTime?: string;
  refundable: boolean;
  refundPolicy?: string;
}

export interface EnvironmentAlternativePlan {
  planId: string;
  name: string;
  description: string;
  timeAdjustment: string;
  costDifference: number;
  experienceEquivalence: number;
  bookingRequired: boolean;
  bookingDeadline?: string;
  silentVoteOptionId?: string;
}

export interface EnvironmentCascadeImpact {
  affectedDay: number;
  affectedItem: string;
  impactType: 'time' | 'cost' | 'availability';
  impactDescription: string;
}

export interface EnvironmentEventResolution {
  selectedPlanId?: string;
  voteResults?: Record<string, { ballots: number; weightedScore: number }>;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface EnvironmentEventSummary {
  id: string;
  tripId: string;
  type: EnvironmentEventType;
  severity: EnvironmentSeverity;
  description: string;
  status: EnvironmentEventStatus;
  detectedAt: string;
  affectedItemCount: number;
  alternativePlanCount: number;
  silentVoteId?: string;
}

export interface EnvironmentEventDetail extends EnvironmentEventSummary {
  affectedItems: EnvironmentAffectedItem[];
  alternativePlans: EnvironmentAlternativePlan[];
  cascadeImpact: EnvironmentCascadeImpact[];
  resolution?: EnvironmentEventResolution;
  resolvedAt?: string;
}

export interface DayVulnerabilityScore {
  tripId: string;
  dayNumber: number;
  date: string;
  stabilityScore: number;
  severity: EnvironmentSeverity;
  factors: Array<{ code: string; message: string; weight: number }>;
  computedAt: string;
}

export interface EnvironmentVoteInput {
  planId: string;
  preferenceStrength: number;
  comment?: string;
}

export interface EnvironmentResolveInput {
  planId?: string;
}
