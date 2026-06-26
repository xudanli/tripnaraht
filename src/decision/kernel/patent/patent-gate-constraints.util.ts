/**
 * 专利 6.5 步骤 4：将 INTAKE 约束种子 + 环境信念投影为 GATE_EVAL 扩展字段
 */

import type { ConstraintReport, DecisionState } from '../decision-state.types';
import type { PatentIntakeConstraintSeeds } from './patent-intake-normalizer.util';

export interface PatentGateConstraintExtensions {
  budget?: { max: number; current: number | null };
  daily_walk?: { max_per_day: number; unit: string; reason?: string };
  weather_risk?: { max: number; current?: number; day?: number; warning?: string };
  drive_time?: { max_per_day: number; unit: string; reason?: string };
  warnings?: Array<{ type: string; day?: number; message: string }>;
}

function readIntakeSeeds(dso: DecisionState): PatentIntakeConstraintSeeds | undefined {
  const c = dso.userIntent?.constraints as Record<string, unknown> | undefined;
  if (!c) return undefined;
  const embedded = c._patentIntakeSeeds as PatentIntakeConstraintSeeds | undefined;
  if (embedded) return embedded;
  if (c.daily_walk || c.drive_time || c.userAge) {
    return c as PatentIntakeConstraintSeeds;
  }
  return undefined;
}

/**
 * 合并专利形状约束扩展（写入 constraints 顶层扩展键，供 NARRATE/审计使用）。
 */
export function enrichPatentGateConstraintExtensions(
  dso: DecisionState,
  report: ConstraintReport,
): ConstraintReport & PatentGateConstraintExtensions {
  if (process.env.DECISION_OS_PATENT_GATE_CONSTRAINTS !== '1') {
    return report;
  }

  const seeds = readIntakeSeeds(dso);
  const weatherCurrent = dso.environmentState?.weatherRisk;
  const maxWeather = 0.5;
  const extensions: PatentGateConstraintExtensions = {};

  if (seeds?.budget) extensions.budget = seeds.budget;
  if (seeds?.daily_walk) extensions.daily_walk = seeds.daily_walk;
  if (seeds?.drive_time) extensions.drive_time = seeds.drive_time;

  if (typeof weatherCurrent === 'number' && weatherCurrent > maxWeather) {
    extensions.weather_risk = {
      max: maxWeather,
      current: weatherCurrent,
      day: 3,
      warning: `第3天暴风雨风险${weatherCurrent}，超过阈值`,
    };
    extensions.warnings = [
      {
        type: 'weather',
        day: 3,
        message: `第3天暴风雨风险${weatherCurrent}，超过阈值${maxWeather}`,
      },
    ];
  }

  return {
    ...report,
    ...extensions,
    warnings: extensions.warnings ?? (report as PatentGateConstraintExtensions).warnings,
  };
}
