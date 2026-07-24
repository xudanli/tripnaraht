/**
 * Þingvellir — 仅停车收费，无预约要求（M1 回归 T2）
 */

import type { PoiAccessRule } from '../interfaces/poi-access-capacity.interface';
import { ICELAND_C_TIER_POI_SLUGS } from './is-c-tier.crowding-profiles';

const VERIFIED_AT = '2026-06-20T00:00:00.000Z';

export const ICELAND_THINGVELLIR_PARKING_FEE_RULE: PoiAccessRule = {
  id: 'is.thingvellir.parking_fee',
  poiId: ICELAND_C_TIER_POI_SLUGS.THINGVELLIR,
  ruleType: 'CAPACITY_LIMIT',
  targetResource: 'PARKING',
  reservationRequired: false,
  status: 'ACTIVE',
  sourceAuthority: 'Þingvellir National Park',
  sourceUrl: 'https://www.thingvellir.is/',
  lastVerifiedAt: VERIFIED_AT,
  confidence: 'OFFICIAL',
  notes: '停车场按次收费（is.parking）；无需提前预约',
};
