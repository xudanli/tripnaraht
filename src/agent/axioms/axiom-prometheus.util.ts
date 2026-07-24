import type { AxiomMatchSource } from './axiom-schema';
import type { AxiomMatchResult } from './axiom-matchers';

export type AxiomPrometheusMatchSource = AxiomMatchSource | 'UNKNOWN';

/** Prometheus label value for evidence.match_source on dominant axiom matches. */
export function axiomMatchSourceForMetrics(
  dom: Pick<AxiomMatchResult, 'evidence'> | null | undefined,
): AxiomPrometheusMatchSource {
  const src = dom?.evidence?.match_source;
  if (src === 'INTENT_SIGNAL' || src === 'CLARIFICATION' || src === 'HEURISTIC') return src;
  return 'UNKNOWN';
}

/** Normalize audit / matcher CIDs for low-cardinality Prometheus labels. */
export function normalizeAxiomCidForMetrics(cid?: string | null): string {
  const s = String(cid ?? '').trim();
  if (!s || s === 'unknown.unattributed') return 'NONE';
  return s;
}
