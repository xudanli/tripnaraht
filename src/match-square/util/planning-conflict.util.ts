import type { CaptainPersonaSnapshot } from '../types/match-square.types';

export interface PlanningConflictPrompt {
  required: true;
  dimension: 'planning_hardness';
  message: string;
}

const PLANNING_CONFLICT_MESSAGE =
  '检测到你们对「计划硬度」的认知存在差异，你是否愿意向队长做出不迟到、配合核心行程的承诺声明？';

/** PRD 4.3 — 强 J 队伍 vs 强 P 申请者时触发承诺弹窗 */
export function detectPlanningConflict(
  captain: CaptainPersonaSnapshot,
  applicant: CaptainPersonaSnapshot,
): PlanningConflictPrompt | null {
  const captainJ = captain.dimensionPercents.J;
  const captainP = captain.dimensionPercents.P;
  const applicantJ = applicant.dimensionPercents.J;
  const applicantP = applicant.dimensionPercents.P;

  const captainStrongJ = captainJ >= 75;
  const captainStrongP = captainP >= 75;
  const applicantStrongJ = applicantJ >= 75;
  const applicantStrongP = applicantP >= 75;

  const conflict =
    (captainStrongJ && applicantStrongP) ||
    (captainStrongP && applicantStrongJ) ||
    (captainStrongJ && applicantP > applicantJ + 20);

  if (!conflict) return null;

  return {
    required: true,
    dimension: 'planning_hardness',
    message: PLANNING_CONFLICT_MESSAGE,
  };
}
