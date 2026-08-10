/**
 * 将 research_data 中的社区体验证据（小红书等）投影进 Narration tips。
 */

import type { NarrationLike } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import {
  formatXhsExperienceTipZh,
  XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH,
  type XhsExperienceNarratorInput,
} from '../../../mcp/format-xhs-experience-narrator.util';

function asBundle(raw: unknown): XhsExperienceNarratorInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const sampleSize = Number(o.sampleSize ?? 0);
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) return null;
  const stance = o.stance;
  if (!stance || typeof stance !== 'object') return null;
  const s = stance as Record<string, unknown>;
  return {
    query: typeof o.query === 'string' ? o.query : '',
    sampleSize,
    stance: {
      worth: Number(s.worth ?? 0) || 0,
      skip: Number(s.skip ?? 0) || 0,
      conditional: Number(s.conditional ?? 0) || 0,
      unclear: Number(s.unclear ?? 0) || 0,
    },
    themes: Array.isArray(o.themes)
      ? (o.themes as Array<{ label?: string; count?: number }>)
          .filter((t) => typeof t?.label === 'string')
          .map((t) => ({
            label: String(t.label),
            count: Number(t.count ?? 0) || 0,
            quoteIds: [],
          }))
      : [],
    risksMentioned: Array.isArray(o.risksMentioned)
      ? o.risksMentioned.filter((x): x is string => typeof x === 'string')
      : [],
    disclaimerZh:
      typeof o.disclaimerZh === 'string' && o.disclaimerZh.trim()
        ? o.disclaimerZh.trim()
        : XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH,
    ...(typeof o.destinationHint === 'string'
      ? { destinationHint: o.destinationHint }
      : {}),
  };
}

function collectBundles(rd: Record<string, unknown> | undefined): XhsExperienceNarratorInput[] {
  if (!rd) return [];
  const out: XhsExperienceNarratorInput[] = [];
  const ev = rd.communityExperienceEvidence;
  if (ev && typeof ev === 'object') {
    const bundles = (ev as { bundles?: unknown }).bundles;
    if (Array.isArray(bundles)) {
      for (const b of bundles) {
        const mapped = asBundle(b);
        if (mapped) out.push(mapped);
      }
    }
  }
  const harness = rd.observationHarness;
  if (harness && typeof harness === 'object') {
    const audit = (harness as { audit?: unknown }).audit;
    if (Array.isArray(audit)) {
      for (const row of audit) {
        const exec = (row as { execution?: { communityExperience?: unknown } })?.execution;
        const mapped = asBundle(exec?.communityExperience);
        if (mapped) out.push(mapped);
      }
    }
  }
  return out;
}

export function mergeCommunityExperienceIntoNarration(
  narration: NarrationLike,
  state: OrchestratorState,
): NarrationLike {
  const rd = state.research_data as Record<string, unknown> | undefined;
  const bundles = collectBundles(rd);
  if (bundles.length === 0) return narration;

  const tips = [...(narration.tips ?? [])];
  const primary = bundles[0]!;
  const tipLine = formatXhsExperienceTipZh(primary);
  if (!tips.some((t) => t.includes('社区体验') || t.includes('小红书抽样'))) {
    tips.unshift(tipLine.slice(0, 500));
  }

  const prevHints = narration.research_ui_hints ?? [];
  const hintKey = 'community:XHS_EXPERIENCE';
  const hasHint = prevHints.some(
    (h) => h.scope === 'community' && String(h.freshness) === 'XHS_EXPERIENCE',
  );
  const research_ui_hints = hasHint
    ? prevHints
    : [
        ...prevHints,
        {
          scope: 'community',
          freshness: 'XHS_EXPERIENCE',
          message_zh: primary.disclaimerZh || XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH,
          attribution: 'XHS:COMMUNITY_EVIDENCE',
        },
      ];

  return {
    ...narration,
    tips,
    research_ui_hints,
    voice_tone_modifier: narration.voice_tone_modifier ?? 'reassuring_transparency',
  };
}

/** 供测试 / 审计：是否已写入社区 tip */
export function hasCommunityExperienceTip(narration: NarrationLike): boolean {
  return (narration.tips ?? []).some((t) => t.includes('社区体验'));
}
