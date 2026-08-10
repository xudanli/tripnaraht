/**
 * Real Decision Pilot — 第一批低风险 DecisionKey。
 * 暂停新增 Harness/State/DI/Canary 基础设施；目标是真实 Eligible Episode 与高质量 Dataset。
 */

export const REAL_DECISION_PILOT_KEYS = [
  'pace_preference',
  'arrival_day_load',
  'accommodation_movement',
  'experience_selection',
] as const;

export type RealDecisionPilotKey = (typeof REAL_DECISION_PILOT_KEYS)[number];

export function isRealDecisionPilotKey(key: string): key is RealDecisionPilotKey {
  return (REAL_DECISION_PILOT_KEYS as readonly string[]).includes(key);
}

export function assertRealDecisionPilotKeyOrThrow(key: string): RealDecisionPilotKey {
  if (!isRealDecisionPilotKey(key)) {
    throw new Error(
      `[RealDecisionPilot] decision_key_not_in_pilot_batch:${key}`,
    );
  }
  return key;
}
