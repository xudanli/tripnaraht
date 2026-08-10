import {
  ICELAND_SELF_DRIVE_LOCATION_CODES,
  ICELAND_SELF_DRIVE_REGION_IDS,
  type IcelandSelfDriveLocationCode,
  type IcelandSelfDriveRegionId,
} from '../dto/iceland-self-drive-enums';
import {
  LOCATION_LABELS_ZH,
  LOCATION_PICKUP_CODES,
  LOCATION_SHORT_ZH,
  REGION_LABELS_ZH,
} from './iceland-self-drive.dictionaries';
import type { IcelandSelfDriveRegionSupportLevel } from '../types/iceland-region-planning-pack.types';
import { packsForWizardRegion } from '../packs/iceland-region-pack.registry';

export type { IcelandSelfDriveRegionSupportLevel };

export const REGION_LABELS_EN: Record<IcelandSelfDriveRegionId, string> = {
  golden_circle: 'Golden Circle',
  south_coast: 'South Coast',
  snaefellsnes: 'Snæfellsnes',
  east_fjords: 'East Fjords',
  north: 'North Iceland',
  ring_road: 'Ring Road',
  westfjords: 'Westfjords',
  highlands: 'Highlands',
  reykjanes: 'Reykjanes',
};

export const LOCATION_LABELS_EN: Record<IcelandSelfDriveLocationCode, string> = {
  keflavik: 'Keflavík International Airport (KEF)',
  reykjavik: 'Reykjavík City Center',
  akureyri: 'Akureyri',
};

const REGION_COVER_PATH = '/static/iceland-self-drive/regions';

/**
 * 封面资源根：优先 PUBLIC_ASSET_BASE_URL / APP_BASE_URL；
 * 未配置时返回同源相对路径，便于本地 Nest 直接托管 public/static。
 */
export function resolveRegionCoverBase(): string {
  const configured =
    process.env.PUBLIC_ASSET_BASE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    '';
  if (!configured) return REGION_COVER_PATH;
  return `${configured.replace(/\/$/, '')}${REGION_COVER_PATH}`;
}

export interface IcelandSelfDriveRegionCatalogItem {
  id: IcelandSelfDriveRegionId;
  nameZh: string;
  nameEn: string;
  coverImageUrl: string;
  supportLevel: IcelandSelfDriveRegionSupportLevel;
  regionalGoldenSetReady: boolean;
  coverageStatus?: string;
}

export function resolveRegionSupportLevel(
  id: IcelandSelfDriveRegionId,
): IcelandSelfDriveRegionSupportLevel {
  if (id === 'ring_road') return 'corridor';
  const packs = packsForWizardRegion(id);
  if (packs.length === 0) return 'experimental';
  if (packs.every((p) => p.coverageStatus === 'CORRIDOR_ONLY')) {
    return 'corridor_only';
  }
  if (packs.some((p) => p.regionalGoldenSetReady)) return 'full';
  return 'partial';
}

export function listRegionCatalog(): IcelandSelfDriveRegionCatalogItem[] {
  const coverBase = resolveRegionCoverBase();
  return ICELAND_SELF_DRIVE_REGION_IDS.map((id) => {
    const packs = packsForWizardRegion(id);
    const ready = packs.some((p) => p.regionalGoldenSetReady);
    const coverageStatus =
      packs.length === 0
        ? undefined
        : packs.every((p) => p.coverageStatus === 'CORRIDOR_ONLY')
          ? 'CORRIDOR_ONLY'
          : packs[0]?.coverageStatus;
    return {
      id,
      nameZh: REGION_LABELS_ZH[id],
      nameEn: REGION_LABELS_EN[id],
      // SVG 占位封面（同路径亦有 .jpg 兜底文件）
      coverImageUrl: `${coverBase}/${id}.svg`,
      supportLevel: resolveRegionSupportLevel(id),
      regionalGoldenSetReady: ready,
      coverageStatus,
    };
  });
}

export interface IcelandSelfDriveLocationCatalogItem {
  code: IcelandSelfDriveLocationCode;
  nameZh: string;
  nameEn: string;
  shortNameZh: string;
  pickupCode: string;
}

export function listLocationCatalog(): IcelandSelfDriveLocationCatalogItem[] {
  return ICELAND_SELF_DRIVE_LOCATION_CODES.map((code) => ({
    code,
    nameZh: LOCATION_LABELS_ZH[code],
    nameEn: LOCATION_LABELS_EN[code],
    shortNameZh: LOCATION_SHORT_ZH[code],
    pickupCode: LOCATION_PICKUP_CODES[code],
  }));
}
