/**
 * Wizard locationCode → planning placeId for arrival / departure gateway legs.
 */

import type { PlaceRef } from '../types/iceland-initial-plan-seed.types';

export const ICELAND_GATEWAY_BY_LOCATION_CODE = {
  keflavik: {
    placeId: 381221,
    label: 'Keflavík International Airport (KEF)',
  },
  reykjavik: {
    placeId: 381042,
    label: 'Reykjavík city base',
  },
  akureyri: {
    placeId: 381097,
    label: 'Akureyri',
  },
} as const;

export type IcelandGatewayLocationCode =
  keyof typeof ICELAND_GATEWAY_BY_LOCATION_CODE;

export function resolveIcelandGatewayFromLocationCode(
  code?: string | null,
): PlaceRef {
  const key = (code ?? 'keflavik').toLowerCase() as IcelandGatewayLocationCode;
  const hit =
    ICELAND_GATEWAY_BY_LOCATION_CODE[key] ??
    ICELAND_GATEWAY_BY_LOCATION_CODE.keflavik;
  return { placeId: hit.placeId, label: hit.label };
}

/** Prefer explicit placeId; else map label/locationCode. */
export function resolveIcelandGatewayPlaceRef(
  ref?: PlaceRef | null,
  fallbackCode = 'keflavik',
): PlaceRef {
  if (ref?.placeId != null && ref.placeId > 0) {
    return {
      placeId: ref.placeId,
      label: ref.label ?? `gateway:${ref.placeId}`,
    };
  }
  if (ref?.label) {
    return resolveIcelandGatewayFromLocationCode(ref.label);
  }
  return resolveIcelandGatewayFromLocationCode(fallbackCode);
}
