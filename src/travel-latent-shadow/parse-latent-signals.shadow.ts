/**
 * Heuristic placeholder parser — stand-in for a future high-dim encoder.
 * Not a trained model; labeled HEURISTIC_PLACEHOLDER.
 */

import { createHash } from 'crypto';
import type {
  ExplicitBaselineSnippet,
  LatentShadowHypothesis,
  LatentShadowReport,
} from './latent-shadow.types';
import { LATENT_SHADOW_AUTHORITY, LATENT_SHADOW_SCHEMA } from './latent-shadow.types';
import { isLatentImplicitParseShadowEnabled } from './latent-shadow.kill-switch';
import { divergeLatentFromExplicitBaseline } from './diverge-from-explicit-baseline';

export type LatentParseSignalInput = {
  tripId: string;
  /** Opaque signal bag (e.g. TripWorldState.signals). */
  signals?: Record<string, unknown>;
  /** Optional fact-like refs already in the explicit world. */
  factRefs?: Array<{ factId?: string; predicate?: string; subjectId?: string }>;
  explicitBaseline?: ExplicitBaselineSnippet;
  nowIso?: string;
};

function hypId(parts: string): string {
  return `lat_${createHash('sha256').update(parts).digest('hex').slice(0, 12)}`;
}

function buildHypotheses(input: LatentParseSignalInput): LatentShadowHypothesis[] {
  const out: LatentShadowHypothesis[] = [];
  const signals = input.signals ?? {};
  const refs = input.factRefs ?? [];

  const warning =
    signals.weatherProhibitsOutdoor === true ||
    signals.weatherProhibitsOutdoor === 'ACTIVITY_PROHIBITED' ||
    signals.stormBlocksOutdoor === true ||
    signals.stormBlocksOutdoor === 'ACTIVITY_PROHIBITED';

  if (warning) {
    out.push({
      hypothesisId: hypId(`${input.tripId}|weather_risk_cluster`),
      kind: 'RISK_PATTERN_HINT',
      summary:
        'Heuristic: outdoor-prohibit signal co-occurs with trip activity exposure (placeholder latent cluster).',
      confidence: 0.35,
      supportRefs: ['signal:weatherProhibitsOutdoor'],
      method: 'HEURISTIC_PLACEHOLDER',
    });
  }

  const predicates = refs
    .map((f) => f.predicate)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);
  const uniquePred = [...new Set(predicates)];
  if (uniquePred.length >= 2) {
    out.push({
      hypothesisId: hypId(`${input.tripId}|cooc|${uniquePred.slice(0, 3).join(',')}`),
      kind: 'CO_OCCURRENCE_CLUSTER',
      summary: `Heuristic: predicate co-occurrence among ${uniquePred.slice(0, 3).join(', ')}`,
      confidence: Math.min(0.5, 0.15 * uniquePred.length),
      supportRefs: refs
        .map((f) => f.factId)
        .filter((id): id is string => typeof id === 'string')
        .slice(0, 8),
      method: 'HEURISTIC_PLACEHOLDER',
    });
  }

  return out;
}

/**
 * Run Shadow latent parse. Default OFF → enabled=false empty report (no throw).
 */
export function runLatentImplicitParseShadow(
  input: LatentParseSignalInput,
): LatentShadowReport {
  const capturedAt = input.nowIso ?? new Date().toISOString();
  if (!isLatentImplicitParseShadowEnabled()) {
    return {
      schema: LATENT_SHADOW_SCHEMA,
      authority: LATENT_SHADOW_AUTHORITY,
      mustNotWritePlan: true,
      enabled: false,
      disabledReason: 'LATENT_IMPLICIT_PARSE_SHADOW not enabled (or kill switch engaged)',
      tripId: input.tripId,
      capturedAt,
      hypotheses: [],
    };
  }

  const hypotheses = buildHypotheses(input);
  const divergence = divergeLatentFromExplicitBaseline({
    hypotheses,
    explicitBaseline: input.explicitBaseline,
  });

  return {
    schema: LATENT_SHADOW_SCHEMA,
    authority: LATENT_SHADOW_AUTHORITY,
    mustNotWritePlan: true,
    enabled: true,
    tripId: input.tripId,
    capturedAt,
    hypotheses,
    explicitBaseline: input.explicitBaseline,
    divergence,
  };
}
