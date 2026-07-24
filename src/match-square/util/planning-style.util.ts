import { BadRequestException } from '@nestjs/common';
import { isValidTeamworkStyle } from '../config/planning-styles.config';
import type { RecruitmentPlanningStyle } from '../types/match-square.types';

type PlanningStyleInput = {
  planningStyle?: string;
  planning_style?: string;
  collaborationStyle?: string;
  collaboration_style?: string;
};

/** 归一化发帖时的三档策划模式字段（兼容 snake_case） */
export function normalizePlanningStyleInput(
  input: PlanningStyleInput,
  options?: { required?: boolean },
): RecruitmentPlanningStyle | null {
  const raw = input.planningStyle ?? input.planning_style ?? input.collaborationStyle ?? input.collaboration_style;

  if (raw == null || raw === '') {
    if (options?.required !== false) {
      throw new BadRequestException(
        '请选择策划协作模式 planningStyle：full_managed | co_planning | casual_play',
      );
    }
    return null;
  }

  const normalized = String(raw).trim();
  if (!isValidTeamworkStyle(normalized)) {
    throw new BadRequestException(
      `未知的 planningStyle: ${normalized}；可选值: full_managed, co_planning, casual_play`,
    );
  }

  return normalized;
}
