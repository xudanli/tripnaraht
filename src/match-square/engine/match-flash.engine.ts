import type { MatchSquareRecruitmentPost } from '@prisma/client';
import type { MatchableProfile } from '../../odyssey-intake/engine/companion-matching.engine';
import { buildApplicationMatchInsights } from './application-insights.engine';
import type { CaptainPersonaSnapshot, MatchFlashCardView, TeamworkStyle } from '../types/match-square.types';
import { computeRecruitmentCompatibility } from '../util/recruitment-compatibility.util';

const MATCH_FLASH_THRESHOLD = 88;
const MAX_WARNINGS = 1;

function parseSnapshot(raw: unknown): CaptainPersonaSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as CaptainPersonaSnapshot;
}

/** PRD 3.7 — 灵魂旅伴闪送卡（匹配度 > 88% 且冲突极低） */
export function buildMatchFlashCard(
  post: MatchSquareRecruitmentPost,
  viewer: MatchableProfile,
  viewerSnapshot: CaptainPersonaSnapshot,
): MatchFlashCardView | null {
  if (post.captainUserId === viewer.userId) return null;

  const captainSnapshot = parseSnapshot(post.captainPersonaSnapshot);
  if (!captainSnapshot) return null;

  const teamworkStyle = (post.planningStyle as TeamworkStyle | null) ?? null;
  const match = computeRecruitmentCompatibility(teamworkStyle, captainSnapshot, viewer);
  if (match.teamworkMatchBlocked || match.compatibilityPercent == null) return null;
  if (match.compatibilityPercent < MATCH_FLASH_THRESHOLD) return null;

  const insights = buildApplicationMatchInsights(captainSnapshot, viewerSnapshot, teamworkStyle);
  if (insights.warnings.length > MAX_WARNINGS) return null;

  const headline = '🧩 算法发现：你与这个车队存在『宿命级同频』';
  const verdictParts = [
    '你们是平台极其罕见的低冲突组合，消费与节奏预期高度重合。',
    insights.highlights[0] ?? '人格维度契合度处于平台前 12%。',
  ];

  if (post.preferenceNotes?.includes('摄影') || post.preferenceNotes?.includes('拍照')) {
    verdictParts.push('队长缺口与你的 Profile 能力标签存在高度重合。');
  }

  return {
    kind: 'match_flash',
    postId: post.id,
    compatibilityPercent: match.compatibilityPercent,
    headline,
    aiVerdict: verdictParts.join(' '),
    bullets: insights.highlights.slice(0, 3),
    theme: 'shimmer_gradient',
    ctaPrimary: { label: '⚡️ 闪速补位', action: 'flash_apply' },
    ctaSecondary: { label: '💬 勾搭一下', action: 'chat_captain' },
    insertAfterIndex: 1,
  };
}

export function pickBestMatchFlash(
  posts: MatchSquareRecruitmentPost[],
  viewer: MatchableProfile,
  viewerSnapshot: CaptainPersonaSnapshot,
): MatchFlashCardView | null {
  let best: MatchFlashCardView | null = null;

  for (const post of posts) {
    const flash = buildMatchFlashCard(post, viewer, viewerSnapshot);
    if (!flash) continue;
    if (!best || flash.compatibilityPercent > best.compatibilityPercent) {
      best = flash;
    }
  }

  return best;
}
