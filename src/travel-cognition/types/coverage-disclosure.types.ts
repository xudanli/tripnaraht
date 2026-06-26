/**
 * CoverageDisclosure — 决策输出时的覆盖声明。
 * 明确「基于哪些数据判断、哪些渠道未覆盖」。
 */

import type { TravelFactType } from './evidence-envelope.types';

/** TripNARA 明确不覆盖的能力域（非交易型产品边界） */
export type UncoveredCapability =
  | 'INVENTORY'
  | 'PRICING'
  | 'BOOKABILITY'
  | 'GDS_NDC'
  | 'PMS_CRS'
  | 'AUTO_BOOKING'
  | 'AUTO_REBOOKING';

export interface CoverageDisclosure {
  /** 本次判断所依据的事实类型 */
  coveredFactTypes: TravelFactType[];
  /** 已使用的数据源标识 */
  sourcesUsed: string[];
  /** 未检查或未覆盖的能力 */
  uncoveredCapabilities: UncoveredCapability[];
  /** 面向用户的摘要（中/英由调用方选择） */
  summary: string;
  /** ISO 8601 */
  disclosedAt: string;
}

/** 默认非交易型覆盖声明文案 */
export const DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH =
  '此建议基于天气、道路、地形、开放时间等可观测事实判断；未检查实时库存、价格或可预订性。预订与改签需您自行确认。';

export const DEFAULT_NON_TRANSACTION_DISCLOSURE_EN =
  'This recommendation is based on weather, road, terrain, and opening-hours signals. ' +
  'Real-time inventory, pricing, and bookability were not checked. ' +
  'Please confirm bookings and changes yourself.';

export function buildDefaultCoverageDisclosure(input: {
  coveredFactTypes: TravelFactType[];
  sourcesUsed: string[];
  locale?: 'zh' | 'en';
  disclosedAt?: string;
}): CoverageDisclosure {
  const locale = input.locale ?? 'zh';
  return {
    coveredFactTypes: input.coveredFactTypes,
    sourcesUsed: input.sourcesUsed,
    uncoveredCapabilities: [
      'INVENTORY',
      'PRICING',
      'BOOKABILITY',
      'AUTO_BOOKING',
      'AUTO_REBOOKING',
    ],
    summary:
      locale === 'en' ? DEFAULT_NON_TRANSACTION_DISCLOSURE_EN : DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH,
    disclosedAt: input.disclosedAt ?? new Date().toISOString(),
  };
}
