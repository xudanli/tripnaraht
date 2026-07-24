/**
 * 体验底线 / regret bound — trip.metadata.experienceRegretBound
 */

import { TRIP_EXPERIENCE_UNDERSTANDING_METADATA_KEY } from '../../experience-fulfillment/utils/experience-outcome.util';
import type { TravelUnderstandingCard } from '../../experience-fulfillment/types/experience-intent.types';

export const TRIP_EXPERIENCE_REGRET_BOUND_METADATA_KEY = 'experienceRegretBound' as const;

export type ExperienceRegretBoundStore = {
  revision: 1;
  confirmedUpperBound: number;
  confirmedAt: string;
  confirmedBy: string;
  statements?: Array<{ text: string; presetId?: string }>;
  confirmationMode?: 'organizer_only';
};

export type ExperienceRegretConfirmInput = {
  confirmedUpperBound: number;
  statements?: Array<{ text: string; presetId?: string }>;
  confirmationMode?: 'organizer_only';
};

export function readExperienceRegretBound(
  metadata: unknown,
): ExperienceRegretBoundStore | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as Record<string, unknown>)[TRIP_EXPERIENCE_REGRET_BOUND_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return undefined;
  const store = raw as ExperienceRegretBoundStore;
  if (typeof store.confirmedUpperBound !== 'number') return undefined;
  return store;
}

export function readExperienceUnderstanding(
  metadata: unknown,
): TravelUnderstandingCard | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as Record<string, unknown>)[TRIP_EXPERIENCE_UNDERSTANDING_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as TravelUnderstandingCard;
}

/** 启发式 plan regret 估计（M1）；高于 confirmedUpperBound 仅 warning */
export function estimatePlanRegret(metadata: unknown): number {
  const understanding = readExperienceUnderstanding(metadata);
  if (!understanding) return 0;

  const neg = understanding.experienceIntent?.negativePreferences ?? [];
  let score = 0.18;
  for (const p of neg) {
    if (p.type === 'HIGH_CROWD' && p.weight > 0.4) score += 0.12;
    if (p.type === 'WEATHER_EXPOSURE' && p.weight > 0.4) score += 0.08;
    if (p.type === 'LONG_DRIVE' && p.weight > 0.5) score += 0.06;
  }
  return Math.min(0.55, Math.round(score * 100) / 100);
}

export function isPreDeparturePhase(trip: {
  status?: string | null;
  startDate: Date;
}): boolean {
  const status = String(trip.status ?? 'PLANNING').toUpperCase();
  if (status === 'TRAVELING' || status === 'IN_PROGRESS' || status === 'COMPLETED') {
    return false;
  }
  return Date.now() < trip.startDate.getTime();
}

export function shouldRequireRegretConfirmation(metadata: unknown, trip: {
  status?: string | null;
  startDate: Date;
}): boolean {
  if (!isPreDeparturePhase(trip)) return false;
  return Boolean(readExperienceUnderstanding(metadata));
}

export function isRegretBoundConfirmed(metadata: unknown): boolean {
  return Boolean(readExperienceRegretBound(metadata)?.confirmedUpperBound != null);
}
