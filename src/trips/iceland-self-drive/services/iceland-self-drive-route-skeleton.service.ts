import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { IcelandSelfDriveRegionId } from '../dto/iceland-self-drive-enums';
import {
  REGION_ID_TO_TEMPLATE,
  REGION_LABELS_ZH,
  formatRegionSummary,
} from '../dictionaries/iceland-self-drive.dictionaries';
import type {
  IcelandSelfDriveRouteSkeleton,
  IcelandSelfDriveWarning,
} from '../types/iceland-self-drive.types';

const OVERNIGHT_BY_REGION: Partial<Record<IcelandSelfDriveRegionId, string>> = {
  golden_circle: '雷克雅未克 / 黄金圈周边',
  south_coast: '维克 / 南岸',
  snaefellsnes: '斯奈山半岛',
  east_fjords: '霍芬 / 东峡湾',
  north: '阿库雷里 / 米湖',
  ring_road: '环岛走廊过夜点',
  westfjords: '伊萨菲厄泽 / 西峡湾',
  highlands: '高地营地（季节性）',
  reykjanes: '雷克雅未克 / 雷克雅内斯',
};

@Injectable()
export class IcelandSelfDriveRouteSkeletonService {
  build(opts: {
    startDate: string;
    endDate: string;
    regionIds: IcelandSelfDriveRegionId[];
  }): { skeleton: IcelandSelfDriveRouteSkeleton; warnings: IcelandSelfDriveWarning[] } {
    const regionIds = opts.regionIds;
    const strategyId = this.pickStrategyId(regionIds);
    const warnings = this.buildWarnings(opts.startDate, opts.endDate, regionIds);
    const days = this.buildDays(opts.startDate, opts.endDate, regionIds);

    return {
      skeleton: {
        strategyId,
        regionSummary: formatRegionSummary(regionIds),
        days,
      },
      warnings,
    };
  }

  /** Exported for unit tests */
  pickStrategyId(regionIds: IcelandSelfDriveRegionId[]): string {
    const set = new Set(regionIds);
    if (set.has('highlands')) return 'remote-highlands-south';
    if (set.has('ring_road') || set.size >= 4) return 'coverage-ring-compressed';
    if (set.has('south_coast') || set.has('golden_circle') || set.size === 0) {
      return 'depth-south-coast';
    }
    return 'coverage-ring-compressed';
  }

  mapToTemplateRegions(regionIds: IcelandSelfDriveRegionId[]): string[] {
    return regionIds.map((id) => REGION_ID_TO_TEMPLATE[id]);
  }

  private buildWarnings(
    startDate: string,
    endDate: string,
    regionIds: IcelandSelfDriveRegionId[],
  ): IcelandSelfDriveWarning[] {
    const warnings: IcelandSelfDriveWarning[] = [];
    const dayCount = this.inclusiveDays(startDate, endDate);
    const ambitious =
      regionIds.length >= 4 ||
      (regionIds.includes('highlands') && dayCount < 10) ||
      (regionIds.includes('ring_road') && dayCount < 10);

    if (ambitious && dayCount > 0) {
      const month = Number(startDate.slice(5, 7));
      const seasonHint = month >= 10 || month <= 3 ? '冬季' : '';
      warnings.push({
        code: 'REGION_TIGHTNESS',
        message: `${dayCount}天${seasonHint}行程同时包含太多区域可能会比较紧张，NARA 会先为你生成可行路线，再优化体验。`,
      });
    }
    return warnings;
  }

  private buildDays(
    startDate: string,
    endDate: string,
    regionIds: IcelandSelfDriveRegionId[],
  ): IcelandSelfDriveRouteSkeleton['days'] {
    const start = DateTime.fromISO(startDate, { zone: 'utc' });
    const end = DateTime.fromISO(endDate, { zone: 'utc' });
    if (!start.isValid || !end.isValid || end < start) return [];

    const dayCount = Math.floor(end.diff(start, 'days').days) + 1;
    const sequence =
      regionIds.length > 0
        ? regionIds
        : (['reykjanes', 'golden_circle', 'south_coast'] as IcelandSelfDriveRegionId[]);

    const days: IcelandSelfDriveRouteSkeleton['days'] = [];
    for (let i = 0; i < dayCount; i++) {
      const date = start.plus({ days: i }).toISODate()!;
      const region = sequence[Math.min(i, sequence.length - 1)]!;
      const overnight =
        i === dayCount - 1
          ? '返程 overnight / 机场周边'
          : (OVERNIGHT_BY_REGION[region] ?? REGION_LABELS_ZH[region]);
      days.push({
        date,
        corridorLabel: REGION_LABELS_ZH[region],
        overnightHint: overnight,
      });
    }
    return days;
  }

  private inclusiveDays(startDate: string, endDate: string): number {
    const start = DateTime.fromISO(startDate, { zone: 'utc' });
    const end = DateTime.fromISO(endDate, { zone: 'utc' });
    if (!start.isValid || !end.isValid || end < start) return 0;
    return Math.floor(end.diff(start, 'days').days) + 1;
  }
}
