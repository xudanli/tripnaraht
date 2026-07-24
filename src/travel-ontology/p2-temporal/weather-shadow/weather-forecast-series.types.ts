/**
 * Offline weather forecast series for P2 Accuracy Harness
 */

import type { TemporalRiskLevel } from '../contracts';

export type WeatherForecastPoint = {
  at: string;
  predictedLevel: TemporalRiskLevel;
  /** Issued-at of this forecast member (for lead-time) */
  forecastIssuedAt: string;
};

export type WeatherActualPoint = {
  at: string;
  actualLevel: TemporalRiskLevel;
};

/** One offline case: historical forecast + actual + optional P1 replay anchors */
export type WeatherOfflineAccuracyCase = {
  caseId: string;
  tripId: string;
  regionId: string;
  subjectId: string;
  /** Exposed / high-roof plan scopes for affectedScopes */
  affectedScopes: string[];
  /** When prediction is issued (as-of) */
  asOf: string;
  horizonEndAt: string;
  forecastSeries: WeatherForecastPoint[];
  actualSeries: WeatherActualPoint[];
  /** Optional anchors from P1 weather replay (onset / deteriorated / lastActionBy) */
  p1ReplayAnchors?: {
    onsetAt?: string;
    deterioratedAt?: string;
    lastActionBy?: string;
    peakLevel?: TemporalRiskLevel;
    replayFingerprint?: string;
  };
  /** Expected classification for harness self-check */
  expect?: {
    wouldAffectPlan: boolean;
    peakAtLeast: TemporalRiskLevel;
  };
};
