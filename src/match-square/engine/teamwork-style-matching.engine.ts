import type { CaptainPersonaSnapshot, RecruitmentPlanningStyle } from '../types/match-square.types';
import {
  isCoCreatorPlanner,
  isExtremeDelegator,
  isPassiveFollower,
  isStrongImproviser,
  isStrongPlanner,
} from '../config/planning-styles.config';

export interface TeamworkStyleMatchResult {
  hardBlocked: boolean;
  blockReason: string | null;
  deltaPercent: number;
  highlights: string[];
  warnings: string[];
}

const CASUAL_PLAY_BLOCK_REASON =
  '该招募为「一起随便玩」即兴模式，与你的强计划型人格存在责任边界冲突，系统不予推荐。';

/**
 * PRD 3.4.4 / 3.5.1 — 组队风格 Hard Gate
 * 队长[随便玩] + 队员[必须按计划] → 熔断
 */
export function failsTeamworkStyleHardGate(
  teamworkStyle: RecruitmentPlanningStyle | null | undefined,
  applicant: CaptainPersonaSnapshot,
): boolean {
  if (teamworkStyle !== 'casual_play') return false;
  return isStrongPlanner(applicant);
}

/**
 * PRD 3.5.1 — 组队风格匹配加减分（在基础契合度之上叠加）
 */
export function computeTeamworkStyleMatch(
  teamworkStyle: RecruitmentPlanningStyle | null | undefined,
  captain: CaptainPersonaSnapshot,
  applicant: CaptainPersonaSnapshot,
): TeamworkStyleMatchResult {
  if (!teamworkStyle) {
    return { hardBlocked: false, blockReason: null, deltaPercent: 0, highlights: [], warnings: [] };
  }

  if (failsTeamworkStyleHardGate(teamworkStyle, applicant)) {
    return {
      hardBlocked: true,
      blockReason: CASUAL_PLAY_BLOCK_REASON,
      deltaPercent: 0,
      highlights: [],
      warnings: [CASUAL_PLAY_BLOCK_REASON],
    };
  }

  const highlights: string[] = [];
  const warnings: string[] = [];
  let deltaPercent = 0;

  switch (teamworkStyle) {
    case 'full_managed': {
      if (isPassiveFollower(applicant)) {
        deltaPercent += 15;
        highlights.push('组队契约「全托管」与您的随性服从型人格高度互补（体验者 × 主导者）。');
      } else if (isCoCreatorPlanner(applicant)) {
        deltaPercent -= 20;
        warnings.push(
          '组队契约为「全托管」，但您倾向深度参与决策，存在权力边界冲突（一山不容二虎）。',
        );
      }
      break;
    }
    case 'co_planning': {
      if (isExtremeDelegator(applicant)) {
        deltaPercent -= 15;
        warnings.push(
          '「一起策划」需要行前分担筹备；您的高随性低参与倾向可能引发「说随便、现场挑刺」风险。',
        );
      } else if (isCoCreatorPlanner(applicant) && isCoCreatorPlanner(captain)) {
        deltaPercent += 10;
        highlights.push('双方均具备共创型计划偏好，适合「一起策划」的合伙人分工模式。');
      }
      break;
    }
    case 'casual_play': {
      if (isStrongImproviser(applicant)) {
        deltaPercent += 10;
        highlights.push('您的高弹性与「一起随便玩」契约一致，即兴脱队预期对齐。');
      } else if (applicant.dimensionPercents.J >= 60 && applicant.dimensionPercents.P < 55) {
        deltaPercent -= 10;
        warnings.push('您偏好一定行程结构，与即兴盲盒模式可能产生期望落差。');
      }
      break;
    }
  }

  return { hardBlocked: false, blockReason: null, deltaPercent, highlights, warnings };
}

export function clampCompatibilityPercent(value: number): number {
  return Math.min(99, Math.max(1, Math.round(value)));
}
