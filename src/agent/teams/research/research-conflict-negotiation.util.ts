import type { ResearchContextMergeManifest } from './research-context.types';
import type { TeamMergeSummary } from './research-team-merge-summary.util';
import type {
  EbpNarrativeStance,
  ResearchConflictKind,
  ResearchConflictMemoryReplayMeta,
  ResearchConflictNegotiationItem,
  ResearchConflictNegotiationReport,
} from './research-conflict-negotiation.types';
import { RESEARCH_CONFLICT_NEGOTIATION_VERSION } from './research-conflict-negotiation.types';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';
import {
  COMPLIANCE_EXPERIENCE_AXIS_EXPERIENCE_LEAN_THRESHOLD,
  MEMORY_REPLAY_DECISION_SOURCE,
} from '../../memory/experience-replay/memory-replay.constants';
import type { AccumulatedResearchFinancialReport } from './research-team-budget-ledger.util';
import {
  buildUserEmotionalAccountSnapshot,
  calculateMentalOffsetHints,
} from '../../memory/emotional-resonance/tolerance-calculator.util';

function hasCompliancePeerKeyWriteContention(items: ResearchConflictNegotiationItem[]): boolean {
  const keyWrite = items.find((i) => i.kind === 'KEY_WRITE_CONTENTION');
  const sources = (keyWrite?.detail?.sources as string[] | undefined) ?? [];
  return sources.includes('ComplianceResearchMember');
}

/**
 * 在无法律级「同键 Compliance 写入争议」时，将纯启发式 COMPLIANCE_FIRST 降为 BALANCED，并打 MEMORY_REPLAY 溯源。
 */
export function applyMemoryReplayPrimaryStanceSoftening(
  raw: EbpNarrativeStance,
  items: ResearchConflictNegotiationItem[],
  userCognitiveProfile: UserCognitiveProfile | undefined,
): { stance: EbpNarrativeStance; memory_replay?: ResearchConflictMemoryReplayMeta } {
  if (!userCognitiveProfile || raw !== 'COMPLIANCE_FIRST') {
    return { stance: raw };
  }
  if (userCognitiveProfile.compliance_experience_axis > COMPLIANCE_EXPERIENCE_AXIS_EXPERIENCE_LEAN_THRESHOLD) {
    return { stance: raw };
  }
  if (userCognitiveProfile.negative_feedback_proxy >= 0.5) {
    return { stance: raw };
  }
  if (hasCompliancePeerKeyWriteContention(items)) {
    return { stance: raw };
  }
  return {
    stance: 'BALANCED',
    memory_replay: {
      decision_source: MEMORY_REPLAY_DECISION_SOURCE,
      softened_primary_stance: true,
      raw_primary_stance: raw,
      final_primary_stance: 'BALANCED',
    },
  };
}

/** 参与「意见冲突」协商的 Peer Member（不含基础设施/缝合源）。 */
const PEER_MEMBER_SOURCES = new Set<string>([
  'DestinationResearchMember',
  'HotelResearchMember',
  'FlightResearchMember',
  'TransportResearchMember',
  'ComplianceResearchMember',
]);

function isPeerMemberSource(source: string): boolean {
  return PEER_MEMBER_SOURCES.has(source);
}

function sourceToEbpLane(source: string): 'safety' | 'commerce' | 'experience' | 'logistics' | 'other' {
  switch (source) {
    case 'ComplianceResearchMember':
      return 'safety';
    case 'HotelResearchMember':
    case 'FlightResearchMember':
      return 'commerce';
    case 'DestinationResearchMember':
      return 'experience';
    case 'TransportResearchMember':
      return 'logistics';
    default:
      return 'other';
  }
}

function scopeHasWrites(summary: TeamMergeSummary | undefined, scope: string): boolean {
  const keys = summary?.scope_mutations[scope]?.updated_keys;
  return Array.isArray(keys) && keys.length > 0;
}

function derivePrimaryStance(flags: ResearchConflictKind[], items: ResearchConflictNegotiationItem[]): EbpNarrativeStance {
  if (!flags.length) return 'BALANCED';

  const keyWrite = items.find((i) => i.kind === 'KEY_WRITE_CONTENTION');
  const keySources = (keyWrite?.detail?.sources as string[] | undefined) ?? [];

  if (
    flags.some((f) => f === 'CROSS_DOMAIN_COMPLIANCE_COMMERCE' || f === 'CROSS_DOMAIN_COMPLIANCE_EXPERIENCE') ||
    keySources.includes('ComplianceResearchMember')
  ) {
    return 'COMPLIANCE_FIRST';
  }

  if (flags.includes('SUTURE_COEXISTENCE') && flags.length === 1) {
    return 'STITCH_TRANSPARENCY';
  }

  if (
    flags.includes('CROSS_DOMAIN_EXPERIENCE_COMMERCE') ||
    (flags.includes('KEY_WRITE_CONTENTION') &&
      keySources.length > 0 &&
      !keySources.includes('ComplianceResearchMember'))
  ) {
    const lanes = new Set(keySources.map(sourceToEbpLane));
    const commerceVsExperience =
      lanes.has('commerce') &&
      lanes.has('experience') &&
      !lanes.has('safety') &&
      !keySources.includes('ComplianceResearchMember');
    if (flags.includes('CROSS_DOMAIN_EXPERIENCE_COMMERCE') || commerceVsExperience) {
      return 'COMMERCE_OVER_EXPERIENCE';
    }
  }

  if (flags.includes('SUTURE_COEXISTENCE')) {
    return 'STITCH_TRANSPARENCY';
  }

  return 'BALANCED';
}

/**
 * 基于 `ResearchContextMergeManifest[]` 与 `TeamMergeSummary` 构建冲突协商报告。
 * 不读取具体 POI/坐标；后续可追加「逻辑冲突」探测器（时间窗、预算等）。
 */
export function buildResearchConflictNegotiationReport(input: {
  mergeLog: readonly ResearchContextMergeManifest[] | undefined;
  teamMergeSummary: TeamMergeSummary | undefined;
  userCognitiveProfile?: UserCognitiveProfile;
  globalFinancialReport?: AccumulatedResearchFinancialReport;
  researchTripTotalBudget?: number;
  /** 6.3：来自 `research_data.__research_realtime_reroll_count`（预算仲裁等成功重跑次数） */
  realtimeRerollCount?: number;
}): ResearchConflictNegotiationReport {
  const mergeLog = input.mergeLog ?? [];
  const teamMergeSummary = input.teamMergeSummary;

  const items: ResearchConflictNegotiationItem[] = [];

  // 1) 同一键多 Peer 写入
  const keyToSources = new Map<string, Set<string>>();
  for (const m of mergeLog) {
    if (!isPeerMemberSource(m.source)) continue;
    for (const key of m.keysTouched) {
      if (!key || key.startsWith('__')) continue;
      let set = keyToSources.get(key);
      if (!set) {
        set = new Set();
        keyToSources.set(key, set);
      }
      set.add(m.source);
    }
  }
  for (const [key, sources] of keyToSources) {
    if (sources.size < 2) continue;
    const list = [...sources].sort();
    items.push({
      kind: 'KEY_WRITE_CONTENTION',
      summary: `多名 Member 对 research_data 键「${key}」均有写入：${list.join(' vs ')}`,
      detail: { key, sources: list },
    });
  }

  // 2) 跨域启发式（基于 scope_mutations，与 merge-summary 一致）
  if (teamMergeSummary) {
    const sm = teamMergeSummary;
    const hasCompliance = scopeHasWrites(sm, 'compliance');
    const hasCommerce = scopeHasWrites(sm, 'hotel') || scopeHasWrites(sm, 'flight');
    const hasDestination = scopeHasWrites(sm, 'destination');

    if (hasCompliance && hasCommerce) {
      items.push({
        kind: 'CROSS_DOMAIN_COMPLIANCE_COMMERCE',
        summary: '同一轮研究中 Compliance 与 酒店/航班 域均发生更新，存在安全/合规与商业取舍叙事空间',
        detail: { domains: ['compliance', 'commerce'] },
      });
    }
    if (hasCompliance && hasDestination) {
      items.push({
        kind: 'CROSS_DOMAIN_COMPLIANCE_EXPERIENCE',
        summary: '同一轮研究中 Compliance 与 目的地/体验域均发生更新，存在安全叙事与体验叙事张力',
        detail: { domains: ['compliance', 'experience'] },
      });
    }
    if (!hasCompliance && hasCommerce && hasDestination) {
      items.push({
        kind: 'CROSS_DOMAIN_EXPERIENCE_COMMERCE',
        summary: '目的地体验与酒店/航班商业域同时强更新，无同轮 Compliance 信号，适合 trade-off 叙述',
        detail: { domains: ['experience', 'commerce'] },
      });
    }

    const hasMemberPatch = mergeLog.some(
      (m) => m.attribution !== 'FALLBACK_SUTURE' && isPeerMemberSource(m.source) && m.keysTouched.length > 0,
    );
    if (sm.fallback_suture_count > 0 && hasMemberPatch) {
      items.push({
        kind: 'SUTURE_COEXISTENCE',
        summary: '同一轮存在实时 Member 数据与 prior 缝合（FALLBACK_SUTURE）并存，应透明化新鲜度与来源',
        detail: {
          fallback_suture_count: sm.fallback_suture_count,
        },
      });
    }
  }

  const conflict_flags = [...new Set(items.map((i) => i.kind))].sort() as ResearchConflictKind[];
  const has_conflicts = conflict_flags.length > 0;
  const rawPrimary = derivePrimaryStance(conflict_flags, items);
  const softened = applyMemoryReplayPrimaryStanceSoftening(rawPrimary, items, input.userCognitiveProfile);

  const rr = Math.max(0, Math.floor(input.realtimeRerollCount ?? 0));

  const mental_offset_hints = calculateMentalOffsetHints(
    input.userCognitiveProfile,
    input.globalFinancialReport,
    input.researchTripTotalBudget,
    rr,
  );
  const user_emotional_account = buildUserEmotionalAccountSnapshot(
    input.userCognitiveProfile,
    input.globalFinancialReport,
    input.researchTripTotalBudget,
    rr,
  );
  const hasSixZeroSlice =
    input.userCognitiveProfile !== undefined || input.globalFinancialReport !== undefined || rr > 0;

  const stitchNarrativeContext =
    softened.stance === 'STITCH_TRANSPARENCY' && conflict_flags.includes('SUTURE_COEXISTENCE');
  const stitch_tactic = !stitchNarrativeContext
    ? undefined
    : mental_offset_hints.suture_aggressive_allowed
      ? ('AGGRESSIVE_COMPENSATION' as const)
      : ('TRANSPARENT_SEGMENTED' as const);

  return {
    version: RESEARCH_CONFLICT_NEGOTIATION_VERSION,
    has_conflicts,
    conflict_flags,
    primary_narrative_stance: softened.stance,
    items,
    ...(softened.memory_replay ? { memory_replay: softened.memory_replay } : {}),
    ...(stitch_tactic ? { stitch_tactic } : {}),
    ...(hasSixZeroSlice
      ? {
          tolerance_bonus: mental_offset_hints.tolerance_bonus,
          mental_offset_hints,
          user_emotional_account,
        }
      : {}),
  };
}

export function isResearchConflictNegotiationReport(v: unknown): v is ResearchConflictNegotiationReport {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === RESEARCH_CONFLICT_NEGOTIATION_VERSION &&
    typeof o.has_conflicts === 'boolean' &&
    Array.isArray(o.conflict_flags) &&
    typeof o.primary_narrative_stance === 'string' &&
    Array.isArray(o.items)
  );
}
