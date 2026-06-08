import type { MatchSquareRecruitmentPost } from '@prisma/client';
import type { MatchableProfile } from '../../odyssey-intake/engine/companion-matching.engine';
import type {
  CaptainPersonaSnapshot,
  RecruitmentPlanningStyle,
  TeamPuzzleSlotView,
  TeamPuzzleView,
  ViewerPuzzleMatchView,
} from '../types/match-square.types';
import type { SocialBackgroundProfile } from './social-background-matching.engine';
import {
  computeTeamPuzzleDeficits,
  formatSuggestedRoleLabel,
  scoreViewerAgainstDeficit,
  type TeamPuzzleDeficitSpec,
} from './team-puzzle-deficit.engine';
import {
  mergeFilledSlotsIntoTeamPuzzle,
  readTeamPuzzleFilledSlots,
} from './team-puzzle-assignment.engine';
import { buildPuzzleSlotId, buildVibePuzzleSlotId } from '../types/team-puzzle-assignment.types';
import {
  readVibePayloadFromSnapshot,
  vibeSlotsToPuzzleDeficits,
} from './vibe-llm-parse.engine';

const ROLE_PATTERNS: Array<{ pattern: RegExp; label: string; viewerKeys: string[] }> = [
  { pattern: /摄影|拍照|相机|出片/, label: '会开车的摄影师', viewerKeys: ['photo', 'drive'] },
  { pattern: /开车|驾驶|司机|驾照|车主|轮换/, label: '会开车的队友', viewerKeys: ['drive'] },
  { pattern: /消费|AA|预算|拼房/, label: '消费观相近的同房队友', viewerKeys: ['budget'] },
  { pattern: /女生|姐妹|女性/, label: '同房女生队友', viewerKeys: ['social'] },
  { pattern: /男生|兄弟|男性/, label: '同房男生队友', viewerKeys: ['social'] },
  { pattern: /历史|人文|讲解/, label: '对人文历史有兴趣的队友', viewerKeys: ['culture'] },
  { pattern: /松弛|不赶路|慢节奏/, label: '深度松弛派队友', viewerKeys: ['pace'] },
];

const VIEWER_MATCH_THRESHOLD = 72;

function parseCaptainSnapshot(post: MatchSquareRecruitmentPost): CaptainPersonaSnapshot | null {
  const raw = post.captainPersonaSnapshot;
  if (!raw || typeof raw !== 'object') return null;
  return raw as unknown as CaptainPersonaSnapshot;
}

function extractPreferenceRoleLabels(
  preferenceNotes: string | null,
  captainMessage: string | null,
): string[] {
  const text = `${preferenceNotes ?? ''} ${captainMessage ?? ''}`;
  const labels: string[] = [];
  for (const rule of ROLE_PATTERNS) {
    if (rule.pattern.test(text) && !labels.includes(rule.label)) {
      labels.push(rule.label);
    }
  }
  return labels;
}

function mergePreferenceIntoDeficits(
  deficits: TeamPuzzleDeficitSpec[],
  preferenceLabels: string[],
): TeamPuzzleDeficitSpec[] {
  if (preferenceLabels.length === 0) return deficits;

  const merged = deficits.map((spec, index) => {
    const pref = preferenceLabels[index] ?? preferenceLabels[preferenceLabels.length - 1];
    if (!pref || spec.deficitDimension === 'energy_balance') {
      return spec;
    }
    return {
      ...spec,
      deficitDimension: 'preference' as const,
      shortLabel: pref,
      aiRationale: `队长偏好：${pref}，与团队拼图缺位对齐`,
    };
  });

  if (preferenceLabels[0] && merged.length > 0) {
    const last = merged.length - 1;
    merged[last] = {
      ...merged[last],
      deficitDimension: 'preference',
      shortLabel: preferenceLabels[0],
      aiRationale: `队长明确需要：${preferenceLabels[0]}`,
      targetMbtiTypes: [],
    };
  }

  return merged;
}

function viewerCapabilityKeys(viewer: MatchableProfile): Set<string> {
  const keys = new Set<string>();
  const tags = (viewer as MatchableProfile & { tripIntentTags?: string[] }).tripIntentTags ?? [];

  if (tags.includes('photo_hunter')) keys.add('photo');
  if (tags.includes('budget_mode')) keys.add('budget');
  if (tags.includes('slow_pace')) keys.add('pace');
  if (tags.includes('social_on')) keys.add('social');

  if (viewer.rawScores.financial_flexibility >= 0) keys.add('budget');
  if (viewer.dimensionPercents.P >= 60) keys.add('pace');
  keys.add('drive');
  return keys;
}

function preferenceRoleMatchesViewer(roleLabel: string, viewer: MatchableProfile): boolean {
  const rule = ROLE_PATTERNS.find((r) => r.label === roleLabel);
  if (!rule) return false;
  const keys = viewerCapabilityKeys(viewer);
  return rule.viewerKeys.some((k) => keys.has(k));
}

function buildViewerPuzzleMatch(
  slots: TeamPuzzleSlotView[],
): ViewerPuzzleMatchView | null {
  const matched = slots
    .filter((s) => s.kind === 'open' && s.highlightForViewer)
    .sort((a, b) => (b.viewerMatchScore ?? 0) - (a.viewerMatchScore ?? 0));

  const best = matched[0];
  if (!best) return null;

  return {
    isSoulPiece: true,
    headline: '你正是本队缺少的灵魂拼图',
    matchedSlotIndex: best.slotIndex ?? 0,
    matchedRoleLabel: best.roleLabel,
    aiRationale: best.aiRationale ?? null,
  };
}

export function buildTeamPuzzle(
  post: MatchSquareRecruitmentPost,
  viewer: MatchableProfile | null,
  options?: {
    captainSocial?: SocialBackgroundProfile | null;
    captainDisplayName?: string | null;
  },
): TeamPuzzleView {
  const memberSlotCount = Math.max(0, post.slotsNeeded);
  const snapshot = parseCaptainSnapshot(post);

  const slots: TeamPuzzleSlotView[] = [
    {
      kind: 'filled',
      slotIndex: 0,
      slotId: buildPuzzleSlotId(0),
      roleLabel: '队长',
      occupantUserId: post.captainUserId,
      occupantLabel:
        options?.captainDisplayName?.trim() || post.captainCardTitle,
      highlightForViewer: false,
    },
  ];

  if (memberSlotCount <= 0) {
    return { progressLabel: '车队拼图进度', slots, algorithm: 'team_deficit_pomdp_v1' };
  }

  const preferenceLabels = extractPreferenceRoleLabels(post.preferenceNotes, post.captainMessage);
  const vibePayload = readVibePayloadFromSnapshot(snapshot);

  let deficits: TeamPuzzleDeficitSpec[] = [];
  if (vibePayload?.slot_definitions?.length) {
    deficits = vibeSlotsToPuzzleDeficits(vibePayload, memberSlotCount);
  } else if (snapshot) {
    deficits = computeTeamPuzzleDeficits(snapshot, {
      travelMode: post.travelMode,
      vehicleInfo: post.vehicleInfo,
      preferenceNotes: post.preferenceNotes,
      captainMessage: post.captainMessage,
      captainSocial: options?.captainSocial ?? null,
      teamworkStyle: (post.planningStyle as RecruitmentPlanningStyle | null) ?? null,
    }, memberSlotCount);
    deficits = mergePreferenceIntoDeficits(deficits, preferenceLabels);
  } else {
    deficits = preferenceLabels.slice(0, memberSlotCount).map((label) => ({
      deficitDimension: 'preference' as const,
      shortLabel: label,
      aiRationale: '根据队长招募偏好生成',
      targetMbtiTypes: [],
    }));
    while (deficits.length < memberSlotCount) {
      deficits.push({
        deficitDimension: 'preference',
        shortLabel: `旅伴拼图位 ${deficits.length + 1}`,
        aiRationale: '虚位以待',
        targetMbtiTypes: [],
      });
    }
  }

  for (let i = 0; i < memberSlotCount; i++) {
    const spec = deficits[i] ?? {
      deficitDimension: 'preference' as const,
      shortLabel: `旅伴拼图位 ${i + 1}`,
      aiRationale: '虚位以待',
      targetMbtiTypes: [],
    };
    const slotIndex = i + 1;
    const roleLabel = formatSuggestedRoleLabel(spec.shortLabel);
    const vibeSlotId = vibePayload?.slot_definitions[i]?.slot_id;
    let highlightForViewer = false;
    let viewerMatchScore: number | undefined;

    if (viewer && snapshot) {
      viewerMatchScore = scoreViewerAgainstDeficit(viewer, spec, snapshot);
      highlightForViewer = viewerMatchScore >= VIEWER_MATCH_THRESHOLD;
    } else if (viewer && spec.deficitDimension === 'preference') {
      highlightForViewer = preferenceRoleMatchesViewer(spec.shortLabel, viewer);
      viewerMatchScore = highlightForViewer ? 80 : 30;
    }

    slots.push({
      kind: 'open',
      slotIndex,
      slotId: vibeSlotId != null ? buildVibePuzzleSlotId(vibeSlotId) : buildPuzzleSlotId(slotIndex),
      roleLabel,
      aiRationale: spec.aiRationale,
      deficitDimension: spec.deficitDimension,
      targetMbtiTypes: spec.targetMbtiTypes,
      highlightForViewer,
      viewerMatchScore,
    });
  }

  const filledSnapshot = readTeamPuzzleFilledSlots(post.captainPersonaSnapshot);
  const mergedSlots = mergeFilledSlotsIntoTeamPuzzle(slots, filledSnapshot);
  const viewerPuzzleMatch = viewer ? buildViewerPuzzleMatch(mergedSlots) : null;

  return {
    progressLabel: '车队拼图进度',
    algorithm: 'team_deficit_pomdp_v1',
    slots: mergedSlots,
    viewerPuzzleMatch,
  };
}
