/**
 * INV-02：Sensor 技术失败 ≠ 业务不可订。
 * HTTP/MCP 404 / init failure → liveEvidence UNAVAILABLE / channel UNKNOWN|CATALOG，
 * 不得映射为 SOLD_OUT。
 */

import type { BookingChannelMode } from './decision-state.types';

export type SensorFetchFact = {
  ok: boolean;
  httpStatus?: number | null;
  errorMessage?: string | null;
  /** 是否拿到可解析的实时库存字段 */
  hasLiveInventoryEvidence?: boolean;
  /** 业务侧明确停售/关闭（非技术错误） */
  businessClosed?: boolean;
  /** 目录命中商品 */
  catalogHit?: boolean;
};

export type NormalizedBookingEvidence = {
  bookingChannel: BookingChannelMode;
  liveEvidence: 'PRESENT' | 'UNAVAILABLE' | 'ABSENT';
  /** 严禁由技术失败填充 */
  businessAvailability: 'UNKNOWN' | 'AVAILABLE' | 'SOLD_OUT' | 'CLOSED';
  reasonCode: string;
};

export function normalizeBookingChannelFromSensor(
  fact: SensorFetchFact,
): NormalizedBookingEvidence {
  if (fact.businessClosed === true) {
    return {
      bookingChannel: 'UNAVAILABLE',
      liveEvidence: 'PRESENT',
      businessAvailability: 'CLOSED',
      reasonCode: 'BUSINESS_CLOSED',
    };
  }

  if (fact.hasLiveInventoryEvidence === true && fact.ok) {
    return {
      bookingChannel: 'LIVE',
      liveEvidence: 'PRESENT',
      businessAvailability: 'AVAILABLE',
      reasonCode: 'LIVE_INVENTORY',
    };
  }

  const err = String(fact.errorMessage ?? '');
  const status = fact.httpStatus ?? null;
  const techFail =
    fact.ok === false ||
    status === 404 ||
    status === 401 ||
    status === 403 ||
    status === 500 ||
    /Initialization failed|Server not found|OAuth|ECONNREFUSED|timeout/i.test(err);

  if (techFail) {
    if (fact.catalogHit) {
      return {
        bookingChannel: 'CATALOG',
        liveEvidence: 'UNAVAILABLE',
        businessAvailability: 'UNKNOWN',
        reasonCode: 'LIVE_TECH_FAIL_CATALOG_FALLBACK',
      };
    }
    return {
      bookingChannel: 'UNKNOWN',
      liveEvidence: 'UNAVAILABLE',
      businessAvailability: 'UNKNOWN',
      reasonCode: 'LIVE_TECH_FAIL',
    };
  }

  if (fact.catalogHit) {
    return {
      bookingChannel: 'CATALOG',
      liveEvidence: 'ABSENT',
      businessAvailability: 'UNKNOWN',
      reasonCode: 'CATALOG_ONLY',
    };
  }

  return {
    bookingChannel: 'UNKNOWN',
    liveEvidence: 'ABSENT',
    businessAvailability: 'UNKNOWN',
    reasonCode: 'NO_EVIDENCE',
  };
}
