/**
 * 注册轻量种子 — 冷启动显式 CONSTRAINT / PREFERENCE。
 * 禁止做成 8×5 问卷；只收会进硬面或强排序的少数字段。
 */

import type { TravelerMemoryObjectV1 } from './traveler-memory-contract.types';
import type { TravelerHabitSummaryV1 } from './trip-override.types';

export type RegistrationSeedPaceV1 = 'SLOW' | 'MODERATE' | 'FAST';
export type RegistrationSeedRiskV1 = 'LOW' | 'MEDIUM' | 'HIGH';
export type RegistrationSeedPhilosophyV1 = 'SCENIC' | 'ADVENTURE' | 'RELAXED';

/**
 * 注册引导可勾选字段（全部可选，至少填一项）。
 * 写入 GLOBAL_USER + EXPLICIT + confirm。
 */
export type RegistrationSeedRequestV1 = {
  /** 行程节奏 */
  pace?: RegistrationSeedPaceV1;
  /** 风险偏好 */
  riskTolerance?: RegistrationSeedRiskV1;
  /** 饮食硬约束 */
  dietaryRestrictions?: string[];
  /** 日均驾驶上限（小时）→ MOBILITY CONSTRAINT */
  maxDailyDrivingHours?: number;
  /** 住宿必避 */
  hotelAvoid?: string[];
  /** 旅行哲学（软偏好） */
  travelPhilosophy?: RegistrationSeedPhilosophyV1;
};

export type RegistrationSeedResultV1 = {
  schemaId: 'tripnara.registration_seed@v1';
  version: 1;
  subject_id: string;
  written: TravelerMemoryObjectV1[];
  failed: Array<{ key: string; reason: string }>;
  /** 迁移期：是否同步写入旧 Memory OS L1（默认 true，便于 ETC=off 冷启动） */
  osL1Synced: boolean;
  osL1Fields: string[];
  habitSummary: TravelerHabitSummaryV1;
};
