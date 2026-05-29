import type { HikingTrailDetail } from '../../route-directions/types/hiking-trail-detail.types';
import type { RouteDirectionData } from '../../route-directions/fixtures';
import {
  IS_HIGHLAND_PERMITS,
  LAUGAVEGUR_PERMITS,
  NEPAL_TREK_PERMITS,
  type HikingPermitSeed,
} from '../constants/hiking-permits.constants';
import { ROUTE_DIRECTION_NAME } from '../constants/laugavegur-demo.constants';

export type HikingPermitInput = HikingPermitSeed;

/** 保证 C 端 / prep 每条 permit 有唯一 id 与明确 nameCN */
export function normalizeHikingDetailPermits(
  permits: HikingPermitInput[] | undefined | null,
): NonNullable<HikingTrailDetail['permits']> {
  if (!permits?.length) return [];

  const seen = new Map<string, number>();
  return permits.map((p, index) => {
    const nameCN = String(p.nameCN ?? p.titleZh ?? p.name ?? p.id ?? `许可-${index + 1}`).trim();
    const name = String(p.nameEN ?? p.name ?? nameCN).trim();
    const baseId = String(p.id ?? `permit-${index + 1}`).trim() || `permit-${index + 1}`;
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;

    return {
      id,
      titleZh: nameCN,
      name,
      nameCN,
      nameEN: p.nameEN,
      required: p.required !== false,
      bookingUrl: p.bookingUrl,
      noteZh: p.noteZh,
    };
  });
}

export function buildDefaultPermitsForRoute(
  rd: { name: string; nameCN?: string | null; countryCode?: string | null },
  fixture?: RouteDirectionData,
): NonNullable<HikingTrailDetail['permits']> {
  const meta = (fixture?.metadata ?? {}) as Record<string, unknown>;
  if (meta.demoAnchor === 'laugavegur' || rd.name === ROUTE_DIRECTION_NAME) {
    return normalizeHikingDetailPermits(LAUGAVEGUR_PERMITS);
  }
  const cc = (rd.countryCode ?? fixture?.countryCode ?? '').toUpperCase();
  if (cc === 'IS' || rd.name.startsWith('IS_')) {
    return normalizeHikingDetailPermits(IS_HIGHLAND_PERMITS);
  }
  if (cc === 'NP' || rd.name.includes('EBC') || rd.name.includes('NEPAL')) {
    return normalizeHikingDetailPermits(NEPAL_TREK_PERMITS);
  }

  const label = rd.nameCN ?? rd.name;
  return normalizeHikingDetailPermits([
    {
      id: 'trail-registration',
      nameCN: `${label} 行程登记/许可`,
      name: `${label} registration`,
      titleZh: `${label} 行程登记/许可`,
      required: true,
      noteZh: '请向当地管理机构确认许可、保险与向导要求',
    },
  ]);
}

export function ensureHikingDetailPermits(
  detail: HikingTrailDetail,
  rd: { name: string; nameCN?: string | null; countryCode?: string | null },
  fixture?: RouteDirectionData,
): HikingTrailDetail {
  const hasPermits = Array.isArray(detail.permits) && detail.permits.length > 0;
  const permits = hasPermits
    ? normalizeHikingDetailPermits(detail.permits)
    : buildDefaultPermitsForRoute(rd, fixture);
  return { ...detail, permits };
}
