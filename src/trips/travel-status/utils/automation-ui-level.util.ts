/**
 * C 端 L 档位展示 — 与后端 AutomationLevel 映射。
 * L0/L1 后端均为 INFORM_ONLY，UI 合并为一档。
 */

import type { AutomationLevel } from '../../trip-constraint-solver/types/travel-decision-contract.types';

export type AutomationUiLevel = 'L0_L1' | 'L2' | 'L3' | 'L4';

export const AUTOMATION_UI_LEVEL_LABELS: Record<AutomationUiLevel, string> = {
  L0_L1: '观察与提醒',
  L2: '建议执行',
  L3: '边界内自动执行',
  L4: '高度自主',
};

/** UI 档位 → 写入后端的 defaultLevel */
export const AUTOMATION_UI_LEVEL_TO_BACKEND: Record<AutomationUiLevel, AutomationLevel> = {
  L0_L1: 'INFORM_ONLY',
  L2: 'SUGGEST',
  L3: 'AUTO_REPAIR_LOW_RISK',
  L4: 'AUTO_EXECUTE_CONDITIONAL',
};

/** 后端 defaultLevel → UI 档位（INFORM_ONLY 统一映射 L0_L1） */
export function toAutomationUiLevel(defaultLevel: string): AutomationUiLevel {
  switch (defaultLevel) {
    case 'INFORM_ONLY':
      return 'L0_L1';
    case 'AUTO_REPAIR_LOW_RISK':
      return 'L3';
    case 'AUTO_EXECUTE_CONDITIONAL':
      return 'L4';
    case 'SUGGEST':
    default:
      return 'L2';
  }
}

export function automationUiLevelLabel(defaultLevel: string): string {
  return AUTOMATION_UI_LEVEL_LABELS[toAutomationUiLevel(defaultLevel)];
}
