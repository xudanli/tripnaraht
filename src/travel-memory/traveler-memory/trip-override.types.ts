/**
 * Trip Override / 习惯继承 — 产品 §8–§9。
 *
 * 按我的习惯 → 不写 L1，仅标记 trip mode +（可选）清掉本次覆盖
 * 这次不一样 → 只写 scope=TRIP，禁止 GLOBAL_USER / UserTravelProfile
 */

import type {
  TravelerMemoryDomain,
  TravelerMemorySemanticType,
} from '../effective-context/effective-traveler-context.types';
import type { TravelerMemoryObjectV1 } from './traveler-memory-contract.types';

export const TRIP_MEMORY_MODE_KEY = 'trip_memory_mode' as const;

export type TripMemoryModeV1 = 'HABIT_INHERIT' | 'TRIP_DIFFERENT';

export type TripOverrideItemInputV1 = {
  domain: TravelerMemoryDomain;
  semantic_type: TravelerMemorySemanticType;
  key: string;
  value: unknown;
  confidence?: number;
};

export type ApplyHabitInheritRequestV1 = {
  userId: string;
  tripId: string;
  /** 默认 true：清除本 trip 上已有 Domain 覆盖（保留 mode 标记重写） */
  clearExistingOverrides?: boolean;
};

export type ApplyTripDifferentRequestV1 = {
  userId: string;
  tripId: string;
  overrides: TripOverrideItemInputV1[];
  /** 默认 true：先清旧覆盖再写入 */
  replaceExisting?: boolean;
};

export type TravelerHabitCardV1 = {
  domain: TravelerMemoryDomain;
  /** 自然语言碎片，供「已应用你的旅行偏好」 */
  snippets: string[];
};

export type TravelerHabitSummaryV1 = {
  schemaId: 'tripnara.traveler_habit_summary@v1';
  version: 1;
  subject_id: string;
  cards: TravelerHabitCardV1[];
  /** 一句话汇总 */
  appliedSummary: string;
  memoryCount: number;
};

export type TripOverrideApplyResultV1 = {
  schemaId: 'tripnara.trip_override_apply@v1';
  version: 1;
  mode: TripMemoryModeV1;
  tripId: string;
  userId: string;
  /** 本次新写入的覆盖（不含 mode 标记） */
  overrides: TravelerMemoryObjectV1[];
  clearedCount: number;
  habitSummary: TravelerHabitSummaryV1 | null;
  /** 硬保证：未触碰 L1 GLOBAL_USER 偏好表 */
  l1Untouched: true;
};
