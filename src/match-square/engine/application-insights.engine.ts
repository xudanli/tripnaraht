import type { CaptainPersonaSnapshot, RecruitmentPlanningStyle } from '../types/match-square.types';
import type { SocialBackgroundProfile } from '../engine/social-background-matching.engine';
import {
  computeRecruitmentCompatibilityForSnapshots,
  type RecruitmentCompatibilityResult,
} from '../util/recruitment-compatibility.util';

export interface ApplicationMatchInsights {
  compatibilityPercent: number | null;
  teamworkMatchBlocked: boolean;
  teamworkBlockReason: string | null;
  matchInsightDrawer?: import('../types/match-square.types').MatchInsightDrawerView | null;
  structuralMatch?: import('../types/match-square.types').StructuralMatchBreakdownView | null;
  highlights: string[];
  warnings: string[];
}

/**
 * PRD 4.2 + 3.5.1 — 规则叙事层；叠加组队风格加减分 / Hard Gate
 */
export function buildApplicationMatchInsights(
  captain: CaptainPersonaSnapshot,
  applicant: CaptainPersonaSnapshot,
  teamworkStyle?: RecruitmentPlanningStyle | null,
  social?: { captain?: SocialBackgroundProfile; viewer?: SocialBackgroundProfile },
  ctx?: import('../util/recruitment-compatibility.util').RecruitmentMatchContext,
): ApplicationMatchInsights {
  const base = computeRecruitmentCompatibilityForSnapshots(
    teamworkStyle,
    captain,
    applicant,
    social,
    ctx,
  );
  const narrative = buildPersonalityNarrative(captain, applicant, base);

  return {
    compatibilityPercent: base.compatibilityPercent,
    teamworkMatchBlocked: base.teamworkMatchBlocked,
    teamworkBlockReason: base.teamworkBlockReason,
    matchInsightDrawer: base.matchInsightDrawer ?? null,
    structuralMatch: base.structuralMatch ?? null,
    highlights: [...base.highlights, ...narrative.highlights].slice(0, 4),
    warnings: [...base.warnings, ...narrative.warnings].slice(0, 4),
  };
}

function buildPersonalityNarrative(
  captain: CaptainPersonaSnapshot,
  applicant: CaptainPersonaSnapshot,
  base: RecruitmentCompatibilityResult,
): { highlights: string[]; warnings: string[] } {
  if (base.teamworkMatchBlocked || base.compatibilityPercent == null) {
    return { highlights: [], warnings: [] };
  }

  const highlights: string[] = [];
  const warnings: string[] = [];

  const finDiff = Math.abs(
    captain.rawScores.financial_flexibility - applicant.rawScores.financial_flexibility,
  );
  if (finDiff <= 1) {
    highlights.push('消费观念高度匹配，在拼房与就餐预算上处于同一带宽。');
  } else if (finDiff >= 3) {
    warnings.push('消费带宽差异较大，行中可能在住宿档次或餐饮选择上产生摩擦。');
  }

  const energyDiff = Math.abs(captain.rawScores.energy_capacity - applicant.rawScores.energy_capacity);
  if (energyDiff <= 1) {
    highlights.push('旅行体力与节奏偏好相近，暴走/松弛程度较同步。');
  } else if (energyDiff >= 4) {
    warnings.push('体力与行程节奏预期差异明显，可能需要提前协商每日强度。');
  }

  const aestheticGap = Math.abs(
    captain.rawScores.aesthetic_preference - applicant.rawScores.aesthetic_preference,
  );
  if (aestheticGap >= 3) {
    warnings.push(
      '你们对人文/风景的深度偏好存在分歧，行中可能在「深度看」与「随便看看」之间产生审美落差。',
    );
  }

  if (highlights.length === 0 && base.compatibilityPercent >= 60) {
    highlights.push('综合人格维度契合度良好，具备顺利组队的潜力。');
  }

  return { highlights, warnings };
}
