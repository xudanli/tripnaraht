import type { WeatherEvidencePipelineResult } from '../interfaces/weather-decision-evidence.interface';
import type { FactFreshnessMeta } from '../../../world-facts/world-fact-freshness.util';
import type {
  OpsOperationalPolicyConfigV1,
  OpsOperationalGovernanceSnapshot,
  OpsWeatherGovernanceResolution,
  OpsWorldFactGovernanceResolution,
  OpsGovernanceAction,
} from './operational-policy.types';

function resolveWeather(
  policy: OpsOperationalPolicyConfigV1,
  pipeline: WeatherEvidencePipelineResult | undefined,
): OpsWeatherGovernanceResolution | undefined {
  if (!pipeline) return undefined;

  if (pipeline.hasHardViolation) {
    return {
      branch: 'weather',
      action: policy.weather.onHardViolation,
      reasonCodes: ['OPS_WEATHER_HARD'],
      detail: pipeline.explainableFailure?.reason,
    };
  }
  if (pipeline.hasSoftViolation) {
    return {
      branch: 'weather',
      action: policy.weather.onSoftViolation,
      reasonCodes: ['OPS_WEATHER_SOFT'],
    };
  }
  return {
    branch: 'weather',
    action: 'ALLOW',
    reasonCodes: [],
  };
}

/** Single fact read — threshold ladder for age + expiry (P-OPS-3 world-fact semantics). */
export function evaluateWorldFactFreshnessGovernance(
  policy: OpsOperationalPolicyConfigV1,
  freshness: FactFreshnessMeta,
): OpsWorldFactGovernanceResolution {
  if (freshness.isExpiredByValidTo) {
    return {
      branch: 'world_fact',
      action: policy.worldFact.onExpiredValidTo,
      reasonCodes: ['OPS_WORLD_FACT_EXPIRED_VALID_TO'],
      ageSeconds: freshness.ageMs / 1000,
      expiredByValidTo: true,
    };
  }

  const ageSec = freshness.ageMs / 1000;
  const deg = policy.worldFact.degradedAboveAgeSeconds;
  const warn = policy.worldFact.warnAboveAgeSeconds;

  let action: OpsGovernanceAction = 'ALLOW';
  const codes: string[] = [];

  if (typeof deg === 'number' && ageSec >= deg) {
    action = 'DEGRADED_EXECUTION_SEMANTICS';
    codes.push('OPS_WORLD_FACT_AGE_DEGRADED');
  } else if (typeof warn === 'number' && ageSec >= warn) {
    action = 'WARN_ONLY';
    codes.push('OPS_WORLD_FACT_AGE_WARN');
  }

  return {
    branch: 'world_fact',
    action,
    reasonCodes: codes.length ? codes : ['OPS_WORLD_FACT_FRESH'],
    ageSeconds: ageSec,
    expiredByValidTo: false,
  };
}

export function evaluateGeneratePlanGovernance(params: {
  policy: OpsOperationalPolicyConfigV1;
  weatherPipeline: WeatherEvidencePipelineResult | undefined;
}): OpsOperationalGovernanceSnapshot {
  const evaluatedAt = new Date().toISOString();
  const weather = resolveWeather(params.policy, params.weatherPipeline);
  return {
    policyVersion: params.policy.version,
    evaluatedAt,
    ...(weather ? { weather } : {}),
  };
}
