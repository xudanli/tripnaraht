import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { NarrationEvidenceCard } from '../../decision/kernel/interfaces/phase-executor.interface';

type Tier = 1 | 2 | 3;

function filterEvidenceForPublicPayload(evidence: Record<string, unknown>, tier: Tier | undefined): Record<string, unknown> {
  const t = tier ?? 1;
  if (t === 1) {
    const keys = [
      'type',
      'source',
      'value_mps',
      'threshold_mps',
      'baseline',
      'offset_min',
      'twilight_buffer_min',
      'mode',
      'prefer_civil_dusk',
    ];
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      if (evidence[k] !== undefined) out[k] = evidence[k];
    }
    return out;
  }
  return { ...evidence };
}

/** Wind speed above this (m/s) is flagged as possible sensor/model noise for UI / audit. */
const WIND_SPEED_ANOMALY_MPS = 50;

export type DecisionEvidenceCardPayload = {
  kind: 'iron_shield_evidence';
  rule_id: string;
  rule_name?: string;
  severity: 'HARD' | 'SOFT';
  message: string;
  narrator_hint_rendered?: string;
  persuasion_tier?: Tier;
  evidence: Record<string, unknown>;
  flags?: { data_anomaly?: boolean };
};

function isNarrationEvidenceCard(w: unknown): w is NarrationEvidenceCard {
  return typeof w === 'object' && w !== null && (w as NarrationEvidenceCard).kind === 'iron_shield_evidence';
}

/**
 * Flattens `OrchestratorState.narration.warnings` evidence cards into a stable API payload
 * (`result.payload.decision_metadata.evidence_cards`).
 */
export function assembleDecisionEvidenceCards(
  state: OrchestratorState | undefined | null,
): DecisionEvidenceCardPayload[] {
  const raw = state?.narration?.warnings;
  const out: DecisionEvidenceCardPayload[] = [];
  if (Array.isArray(raw)) {
    for (const w of raw) {
      if (!isNarrationEvidenceCard(w)) continue;
      const fullEvidence = { ...(w.evidence ?? {}) } as Record<string, unknown>;
      let data_anomaly = false;
      if (String(fullEvidence.type ?? '') === 'weather_physics') {
        const v = Number(fullEvidence.value_mps);
        if (Number.isFinite(v) && v > WIND_SPEED_ANOMALY_MPS) {
          data_anomaly = true;
        }
      }
      const tier = w.persuasion_tier;
      const evidence = filterEvidenceForPublicPayload(fullEvidence, tier);
      out.push({
        kind: 'iron_shield_evidence',
        rule_id: w.rule_id,
        rule_name: w.rule_name,
        severity: w.severity,
        message: w.message,
        narrator_hint_rendered: w.narrator_hint_rendered,
        ...(tier === 1 || tier === 2 || tier === 3 ? { persuasion_tier: tier } : {}),
        evidence,
        ...(data_anomaly ? { flags: { data_anomaly: true } } : {}),
      });
    }
  }

  // Bridge VERIFY hard snapshots into user-readable evidence cards when narrator warnings are absent.
  // This keeps QA/Front-end aligned with kernel hard facts (e.g. solar_safety_v1 from SUNSET_BREACH).
  const verifyFacts = ((state as any)?.verification?.assertions_triggered ?? []) as any[];
  for (const f of Array.isArray(verifyFacts) ? verifyFacts : []) {
    if (!f || typeof f !== 'object') continue;
    const ruleId = String((f as any).rule_id ?? '').trim();
    if (!ruleId) continue;
    if (out.some((x) => x.rule_id === ruleId)) continue;
    const ev = ((f as any).evidence && typeof (f as any).evidence === 'object'
      ? (f as any).evidence
      : {}) as Record<string, unknown>;
    const evType = String(ev.type ?? '');
    if (ruleId !== 'solar_safety_v1' && evType !== 'solar_safety' && evType !== 'solar_physics') continue;
    const msg = String((ev as any).message ?? 'Sunset visibility safety window violated');
    out.push({
      kind: 'iron_shield_evidence',
      rule_id: ruleId,
      rule_name: typeof (f as any).rule_name === 'string' ? (f as any).rule_name : 'Solar safety constraint',
      severity: (f as any).severity === 'SOFT' ? 'SOFT' : 'HARD',
      message: msg,
      evidence: filterEvidenceForPublicPayload(ev, 1),
      persuasion_tier: 1,
    });
  }

  return out;
}
