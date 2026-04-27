import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type {
  EvidenceCardUIProps,
  EvidencePersuasionTier,
  EvidenceTierLayout,
  EvidenceCardTheme,
} from '@/shared/interfaces/evidence-ui.interface';
import type { DecisionEvidenceCardPayload } from './evidence-payload-assembler.util';
import { assembleDecisionEvidenceCards } from './evidence-payload-assembler.util';
import { resolveWallHitDistanceMsForConstraints } from './wall-hit-distance.util';

export interface EvidenceUIAssemblerContext {
  wallHitDistanceMs?: number;
  precedentN?: number;
  precedentAcceptPct?: number;
}

export function tierToLayout(tier: EvidencePersuasionTier): EvidenceTierLayout {
  if (tier === 1) return 'minimalist';
  if (tier === 2) return 'analytical';
  return 'authoritative';
}

export function inferEvidenceTheme(evidence: Record<string, unknown>): EvidenceCardTheme {
  const t = String(evidence.type ?? '');
  if (t === 'weather_physics') return 'weather';
  if (t === 'solar_physics') return 'solar';
  return 'road';
}

function finiteNum(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function formatValueDisplay(evidence: Record<string, unknown>): string {
  const type = String(evidence.type ?? '');
  if (type === 'weather_physics') {
    const v = finiteNum(evidence.value_mps);
    if (v !== undefined) return `${v.toFixed(1)} m/s`;
  }
  if (type === 'solar_physics') {
    const baseline = evidence.baseline != null ? String(evidence.baseline) : '';
    const off = finiteNum(evidence.offset_min);
    if (baseline && off !== undefined) return `Sunset ${baseline} + ${off}m`;
    if (baseline) return `Sunset ${baseline}`;
    if (off !== undefined) return `Post-sunset offset +${off}m`;
  }
  return '—';
}

function formatBenchmark(evidence: Record<string, unknown>): string | undefined {
  const type = String(evidence.type ?? '');
  if (type === 'weather_physics') {
    const th = finiteNum(evidence.threshold_mps);
    if (th !== undefined) return `Threshold: ${th.toFixed(1)} m/s`;
  }
  if (type === 'solar_physics') {
    const buf = finiteNum(evidence.twilight_buffer_min);
    if (buf !== undefined) return `Twilight buffer: ${buf} min`;
  }
  return undefined;
}

function sourceLabelFromEvidence(evidence: Record<string, unknown>): string | undefined {
  const s = evidence.source;
  if (s === undefined || s === null) return undefined;
  const raw = String(s).trim();
  return raw.length ? raw : undefined;
}

function wallHitHoursFromMs(ms: number | undefined): number | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return undefined;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/**
 * Single-card conversion: API `DecisionEvidenceCardPayload` + optional run context → UI props.
 */
export function assembleEvidenceCardUIProps(
  card: DecisionEvidenceCardPayload,
  ctx: EvidenceUIAssemblerContext = {},
): EvidenceCardUIProps {
  const tier: EvidencePersuasionTier =
    card.persuasion_tier === 1 || card.persuasion_tier === 2 || card.persuasion_tier === 3
      ? card.persuasion_tier
      : 1;
  const ev = card.evidence ?? {};
  const theme = inferEvidenceTheme(ev);
  const title = (card.narrator_hint_rendered ?? card.message ?? '').trim() || 'Evidence';
  const valueDisplay = formatValueDisplay(ev);
  const benchmark = formatBenchmark(ev);
  const sourceLabel = sourceLabelFromEvidence(ev);

  const hours = wallHitHoursFromMs(ctx.wallHitDistanceMs);
  const impact =
    tier >= 2 && hours !== undefined
      ? { hours, label: 'Estimated delay' }
      : undefined;

  const n = finiteNum(ctx.precedentN);
  const pct = finiteNum(ctx.precedentAcceptPct);
  const socialProof =
    tier >= 3 && n !== undefined && n > 0 && pct !== undefined && pct > 0
      ? { count: Math.round(n), percentage: Math.round(pct) }
      : undefined;

  const policyReference =
    tier >= 3 ? { ruleId: card.rule_id, ...(card.rule_name ? { ruleName: card.rule_name } : {}) } : undefined;

  return {
    kind: 'iron_shield_evidence',
    tier,
    layout: tierToLayout(tier),
    theme,
    title,
    valueDisplay,
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(benchmark ? { benchmark } : {}),
    ...(impact ? { impact } : {}),
    ...(socialProof ? { socialProof } : {}),
    ...(policyReference ? { policyReference } : {}),
    ...(card.flags?.data_anomaly ? { flags: { data_anomaly: true } } : {}),
  };
}

export function extractEvidenceUIAssemblerContext(state: OrchestratorState | null | undefined): EvidenceUIAssemblerContext {
  if (!state) return {};
  const md = state.metadata ?? ({} as Record<string, unknown>);
  const wallHitDistanceMs = resolveWallHitDistanceMsForConstraints({
    orchestratorState: state as unknown as Record<string, unknown>,
    decisionLog: state.decision_log,
  });
  const precedentN = finiteNum(md.precedent_n ?? md.precedentN);
  const precedentAcceptPct = finiteNum(md.precedent_accept_pct ?? md.precedentAcceptPct ?? 90);
  return {
    ...(typeof wallHitDistanceMs === 'number' ? { wallHitDistanceMs } : {}),
    ...(precedentN !== undefined ? { precedentN } : {}),
    ...(precedentAcceptPct !== undefined ? { precedentAcceptPct } : {}),
  };
}

export function assembleEvidenceCardUIPropsFromState(
  state: OrchestratorState | null | undefined,
): EvidenceCardUIProps[] {
  const cards = assembleDecisionEvidenceCards(state);
  const ctx = extractEvidenceUIAssemblerContext(state);
  return cards.map((c) => assembleEvidenceCardUIProps(c, ctx));
}

/**
 * Named entry point for “EvidenceBundle → UIProps” (alias for integrators / Storybook docs).
 */
export const EvidencePayloadAssembler = {
  toEvidenceCardUIProps: assembleEvidenceCardUIProps,
  extractUIContext: extractEvidenceUIAssemblerContext,
  toEvidenceCardUIPropsListFromState: assembleEvidenceCardUIPropsFromState,
} as const;
