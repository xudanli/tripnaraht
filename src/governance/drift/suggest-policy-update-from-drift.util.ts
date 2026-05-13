import type { SuggestedPolicyAdjustment } from '../activation/governance-activation.types';
import type { GovernanceDriftSignal } from './governance-drift.types';

/**
 * Policy evolution hook — **suggestions only**; never applied here.
 */
export function suggestPolicyUpdateFromDrift(signals: readonly GovernanceDriftSignal[]): SuggestedPolicyAdjustment[] {
  const out: SuggestedPolicyAdjustment[] = [];
  for (const s of signals) {
    if (s.confidence < 0.45) continue;
    if (s.type === 'recurring_block') {
      out.push({
        id: 'drift_tighten_corridor_policy_bundle',
        humanReadable:
          'Repeated block/resolution cycle on the same execution surface — consider tightening corridor / vehicle policy bundle and validation gates before next NORMAL closure.',
        evidenceEventIds: [...s.evidenceEventIds],
      });
    } else if (s.type === 'world_regression') {
      out.push({
        id: 'drift_increase_world_monitoring_cadence',
        humanReadable:
          'World-tier stress re-emerged while runtime was NORMAL — consider increasing monitoring cadence or pre-RESTRICTED thresholds for this trip profile.',
        evidenceEventIds: [...s.evidenceEventIds],
      });
    } else if (s.type === 'policy_insufficient') {
      out.push({
        id: 'drift_policy_bundle_review',
        humanReadable:
          'Recovery churn suggests policy bundle may be insufficient for observed friction — schedule advisory policy review (no auto-mutation).',
        evidenceEventIds: [...s.evidenceEventIds],
      });
    }
  }
  return dedupeById(out);
}

function dedupeById(rows: SuggestedPolicyAdjustment[]): SuggestedPolicyAdjustment[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
