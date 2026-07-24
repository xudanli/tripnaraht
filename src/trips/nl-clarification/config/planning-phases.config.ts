/**
 * 规划师分层采集阶段配置
 *
 * 统一 4 阶段框架，供通用流程和目的地特化流程共用
 * 前端可根据 phaseIndicator 展示「第一阶段」「第二阶段」等进度
 */

export const PLANNING_PHASES = [
  { phase: 1, name: '硬约束确认', nameEn: 'Hard constraints', fields: ['destination', 'startDate', 'endDate', 'totalBudget', 'departureCity', 'travelerCount'] },
  { phase: 2, name: '风格选择', nameEn: 'Travel style', fields: ['travelStyle', 'travelSeason', 'activityPreferences', 'travelGroup'] },
  { phase: 3, name: '节奏校准', nameEn: 'Pace calibration', fields: ['pace', 'preferencePace', 'lunch_strategy'] },
  { phase: 4, name: '风险偏好', nameEn: 'Risk preference', fields: ['riskTolerance', 'hasWinterDrivingExperience', 'hasInsurance', 'hasEquipment'] },
] as const;

/** 阶段 1 的硬约束字段（推断后需用户确认） */
export const PHASE1_INFERRABLE_FIELDS = ['startDate', 'endDate', 'totalBudget'] as const;

/** 目的地 roundId -> 阶段映射（用于展示） */
export const ROUND_TO_PHASE: Record<string, number> = {
  round_1_basic: 1,
  round_2_experience: 2,
  round_2_experience_assessment: 2,
  round_2_safety_gate: 2,
  round_2_season_activities: 2,
  round_2_altitude_safety: 2,
  round_3_details: 4,
  round_3_activities: 3,
  round_3_season_activities: 3,
  round_3_k2_knowledge: 3,
  round_4_gate: 4,
};

export interface PhaseIndicator {
  phase: number;
  phaseName: string;
  progress: string;
  totalPhases?: number;
}

export function buildPhaseIndicator(phase: number, totalPhases = 4): PhaseIndicator {
  const def = PLANNING_PHASES.find(p => p.phase === phase);
  return {
    phase,
    phaseName: def?.name ?? `阶段 ${phase}`,
    progress: `${phase}/${totalPhases}`,
    totalPhases,
  };
}

/** 检查阶段 1 是否有未确认的推断字段 */
export function hasUnconfirmedPhase1Inferred(params: Record<string, any>): boolean {
  const inferred = (params.inferredFields as string[]) || [];
  const hasInferred = PHASE1_INFERRABLE_FIELDS.some(f => inferred.includes(f));
  const confirmed = params.confirmInferred === 'confirm' || params.confirmInferred === '确认无误';
  return hasInferred && !confirmed;
}
