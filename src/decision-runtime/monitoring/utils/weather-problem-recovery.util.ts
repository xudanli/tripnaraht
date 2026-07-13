/**
 * P1 — Weather problem recovery after consecutive calm Vedur observations.
 */

import type { Rfc001DecisionProblemStoreService } from '../../../trips/guardian-decision-core/persistence/rfc001-decision-problem.store';
import type { VedurWeatherEvidenceStoreService } from '../../../trips/guardian-decision-core/evidence/vedur-weather-evidence.store';
import type { WeatherRiskTier } from '../../../trips/guardian-decision-core/evidence/weather-observation-change.util';
import type { WeatherSourceProvider } from '../config/iceland-weather-source-authority.config';
import { resolveVedurRecoveryCalmPolls } from '../config/iceland-vedur-monitoring.config';
import { canSourceRecoverWeatherProblem } from './weather-source-authority.util';

export interface WeatherProblemRecoveryInput {
  tripId: string;
  dayIndex: number;
  riskTier: WeatherRiskTier;
  ingestOutcome: 'SILENT' | 'ASSERTION_EMITTED' | 'UNAVAILABLE' | 'NO_LOCATION';
  sourceProvider?: WeatherSourceProvider;
  problemStore: Rfc001DecisionProblemStoreService;
  vedurStore: VedurWeatherEvidenceStoreService;
  jobRunId?: string;
  fingerprint?: string;
}

export async function maybeRecoverWeatherProblemAfterCalmPoll(
  input: WeatherProblemRecoveryInput,
): Promise<{ recovered: boolean; problemId?: string; calmStreak: number }> {
  if (input.ingestOutcome === 'UNAVAILABLE' || input.ingestOutcome === 'NO_LOCATION') {
    return { recovered: false, calmStreak: 0 };
  }

  if (!canSourceRecoverWeatherProblem(input.sourceProvider)) {
    return { recovered: false, calmStreak: 0 };
  }

  const calmStreak = await input.vedurStore.trackCalmRecoveryStreak(
    input.tripId,
    input.dayIndex,
    input.riskTier,
    { jobRunId: input.jobRunId, fingerprint: input.fingerprint },
  );

  const threshold = resolveVedurRecoveryCalmPolls();
  if (input.riskTier !== 'CALM' || calmStreak < threshold) {
    return { recovered: false, calmStreak };
  }

  const resolved = await input.problemStore.resolveOpenWeatherActivityByDay(
    input.tripId,
    input.dayIndex,
  );
  return {
    recovered: Boolean(resolved),
    problemId: resolved?.problemId,
    calmStreak,
  };
}
