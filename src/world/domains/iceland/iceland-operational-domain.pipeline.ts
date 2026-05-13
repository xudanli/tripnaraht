/**
 * Iceland operational domain — gathers domain skills, emits typed OperationalSlices (v1).
 * worldState.summarize 只应编排本 pipeline，而非内联 DAG。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { SafetravelGetAdvisoriesSkill } from '../../../skills/world/safetravel-get-advisories.skill';
import { IcelandRentalGuidanceSkill } from '../../../skills/world/iceland-rental-guidance.skill';
import { IcelandDaylightWindowSkill } from '../../../skills/world/iceland-daylight-window.skill';
import type { IcelandDaylightWindowInput } from '../../../skills/world/iceland-daylight-window.skill';
import { IcelandFRoadStatusSkill } from '../../../skills/world/iceland-f-road-status.skill';
import type { WorldModelContext } from '../../../trips/decision/shared/world-model.types';
import type { OperationalSlice } from '../../contracts/operational-severity.contract';
import {
  sliceFromSafetravelOutput,
  sliceFromFRoadStatusOutput,
  sliceFromDaylightOutput,
  sliceFromRentalGuidanceOutput,
} from './iceland-slice-normalizer';

export interface IcelandOperationalPipelineRunInput {
  tripId: string;
  world: WorldModelContext;
}

export interface IcelandOperationalPipelineRunOutput {
  slices: OperationalSlice[];
  /** True if at least one domain skill returned data */
  gathered: boolean;
}

@Injectable()
export class IcelandOperationalDomainPipeline {
  private readonly logger = new Logger(IcelandOperationalDomainPipeline.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly safetravelGetAdvisories?: SafetravelGetAdvisoriesSkill,
    @Optional() private readonly icelandRentalGuidance?: IcelandRentalGuidanceSkill,
    @Optional() private readonly icelandDaylightWindow?: IcelandDaylightWindowSkill,
    @Optional() private readonly icelandFRoadStatus?: IcelandFRoadStatusSkill,
  ) {}

  async run(input: IcelandOperationalPipelineRunInput): Promise<IcelandOperationalPipelineRunOutput> {
    const { tripId, world } = input;
    const slices: OperationalSlice[] = [];

    if (!this.prisma) {
      this.logger.warn('[IcelandOperationalDomainPipeline] PrismaService missing — skip gather');
      return { slices, gathered: false };
    }

    let trip: { destination: string; startDate: Date } | null = null;
    try {
      trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { destination: true, startDate: true },
      });
    } catch (e: any) {
      this.logger.warn(`[IcelandOperationalDomainPipeline] trip lookup: ${e?.message ?? e}`);
      return { slices, gathered: false };
    }

    const dest = (trip?.destination ?? '').trim();
    const regionKeyword = dest.slice(0, 48);
    const startDateIso = trip?.startDate
      ? DateTime.fromJSDate(trip.startDate, { zone: 'utc' }).setZone('Atlantic/Reykjavik').toFormat('yyyy-MM-dd')
      : DateTime.now().setZone('Atlantic/Reykjavik').toFormat('yyyy-MM-dd');
    const daylightRegion = this.mapDestinationToDaylightRegion(dest);
    const fRoadIds = this.extractFRoadIdsFromWorld(world);

    const results = await Promise.allSettled([
      this.runSafetravel(regionKeyword),
      this.runRental(dest),
      this.runDaylight(startDateIso, daylightRegion),
      this.runFRoad(tripId, fRoadIds),
    ]);

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        slices.push(r.value);
      }
    }

    return { slices, gathered: slices.length > 0 };
  }

  private async runSafetravel(regionKeyword: string): Promise<OperationalSlice | null> {
    if (!this.safetravelGetAdvisories) return null;
    try {
      const out = await this.safetravelGetAdvisories.execute({
        max_items: 25,
        ...(regionKeyword ? { region_keyword: regionKeyword } : {}),
      });
      return sliceFromSafetravelOutput(out);
    } catch (e: any) {
      this.logger.warn(`[IcelandOperationalDomainPipeline] safetravel: ${e?.message ?? e}`);
      return null;
    }
  }

  private async runRental(dest: string): Promise<OperationalSlice | null> {
    if (!this.icelandRentalGuidance) return null;
    try {
      const out = await this.icelandRentalGuidance.execute({ user_query: dest || 'Iceland self-drive' });
      return sliceFromRentalGuidanceOutput(out);
    } catch (e: any) {
      this.logger.warn(`[IcelandOperationalDomainPipeline] rental: ${e?.message ?? e}`);
      return null;
    }
  }

  private async runDaylight(isoDate: string, region: NonNullable<IcelandDaylightWindowInput['region']>): Promise<OperationalSlice | null> {
    if (!this.icelandDaylightWindow) return null;
    try {
      const out = await this.icelandDaylightWindow.execute({ date: isoDate, region });
      return sliceFromDaylightOutput(out);
    } catch (e: any) {
      this.logger.warn(`[IcelandOperationalDomainPipeline] daylight: ${e?.message ?? e}`);
      return null;
    }
  }

  private async runFRoad(tripId: string, roadIds: string[]): Promise<OperationalSlice | null> {
    if (!this.icelandFRoadStatus || roadIds.length === 0) return null;
    try {
      const out = await this.icelandFRoadStatus.execute({
        request_id: `iceland-operational-pipeline:${tripId}`,
        roadIds,
      });
      return sliceFromFRoadStatusOutput(out);
    } catch (e: any) {
      this.logger.warn(`[IcelandOperationalDomainPipeline] fRoad: ${e?.message ?? e}`);
      return null;
    }
  }

  private mapDestinationToDaylightRegion(
    dest: string,
  ): NonNullable<IcelandDaylightWindowInput['region']> {
    const d = dest.toLowerCase();
    if (/\bakureyri\b|阿克雷里/.test(d)) return 'akureyri';
    if (/\bvik\b|维克/.test(d)) return 'vik';
    if (/\bhöfn|hofn\b|赫本/.test(d)) return 'hofn';
    if (/\begilsstaðir|egilsstadir\b|埃伊尔斯塔济/.test(d)) return 'egilsstadir';
    if (/\bísafjörður|isafjordur\b|伊萨菲厄泽/.test(d)) return 'isafjordur';
    if (/\bpatreksfjörður|patreksfjordur\b/.test(d)) return 'patreksfjordur';
    if (/\bholmavik\b|侯尔马维克/.test(d)) return 'holmavik';
    if (/高地|中央高地|landmannalaugar|kerlingarfjöll|sprengisand|askja|f26|f208|f910/i.test(d)) {
      return 'highlands_center';
    }
    if (/keflavik|凯夫拉维克|kef\b|机场/.test(d)) return 'keflavik';
    return 'reykjavik';
  }

  private extractFRoadIdsFromWorld(world: WorldModelContext): string[] {
    const ids = new Set<string>();
    const re = /F\d{2,4}/gi;
    for (const hz of world.physical.hazardZones || []) {
      const blob = `${hz.zoneId || ''} ${JSON.stringify(hz.metadata ?? {})}`;
      for (const m of blob.matchAll(re)) {
        ids.add(m[0].toUpperCase());
      }
    }
    for (const rs of world.physical.roadStates || []) {
      const id = String(rs.roadId || '').trim();
      if (/^F\d{2,4}$/i.test(id)) {
        ids.add(id.toUpperCase());
      }
    }
    return [...ids].slice(0, 14);
  }
}
