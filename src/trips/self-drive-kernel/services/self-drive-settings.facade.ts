/**
 * Global self-drive settings facade.
 * iOS uses countryCode to branch UI; storage reuses driving-settings core.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { IcelandSelfDriveDrivingSettingsService } from '../../iceland-self-drive/services/iceland-self-drive-driving-settings.service';
import type {
  PatchIcelandSelfDriveDrivingSettingsDto,
  PreviewDrivingSettingsImpactDto,
  ReevaluateDrivingSettingsDto,
} from '../../iceland-self-drive/dto/patch-driving-settings.dto';
import {
  resolveDestinationPackId,
  resolveDestinationSelfDriveCapabilities,
} from '../capabilities/resolve-destination-self-drive-capabilities';

const SCHEMA_ID = 'tripnara.self_drive_driving_settings@v1';

function normalizeCountryCode(destination: string | null | undefined): string {
  const raw = String(destination ?? '')
    .trim()
    .toUpperCase();
  if (!raw) return 'UNKNOWN';
  if (raw === 'ICELAND' || /冰岛/.test(String(destination))) return 'IS';
  if (raw === 'CHINA' || raw === 'CHN' || /中国/.test(String(destination))) return 'CN';
  return raw.slice(0, 3);
}

@Injectable()
export class SelfDriveSettingsFacade {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drivingSettings: IcelandSelfDriveDrivingSettingsService,
  ) {}

  private async resolveCountry(tripId: string): Promise<string> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException({
        code: 'TRIP_NOT_FOUND',
        message: `Trip ${tripId} not found`,
      });
    }
    const meta =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};
    const fromSelf =
      meta.selfDrive && typeof meta.selfDrive === 'object'
        ? (meta.selfDrive as { countryCode?: string }).countryCode
        : undefined;
    if (typeof fromSelf === 'string' && fromSelf.trim()) {
      return fromSelf.trim().toUpperCase();
    }
    return normalizeCountryCode(trip.destination);
  }

  private enrich<T extends Record<string, unknown>>(
    countryCode: string,
    data: T,
  ): T & {
    schemaId: string;
    countryCode: string;
    destinationPackId: string;
    capabilities: ReturnType<typeof resolveDestinationSelfDriveCapabilities>;
  } {
    return {
      ...data,
      schemaId: SCHEMA_ID,
      countryCode,
      destinationPackId: resolveDestinationPackId(countryCode),
      capabilities: resolveDestinationSelfDriveCapabilities(countryCode),
    };
  }

  async get(userId: string, tripId: string) {
    const [countryCode, data] = await Promise.all([
      this.resolveCountry(tripId),
      this.drivingSettings.get(userId, tripId),
    ]);
    return this.enrich(countryCode, data as unknown as Record<string, unknown>);
  }

  async getAdmin(tripId: string) {
    const [countryCode, data] = await Promise.all([
      this.resolveCountry(tripId),
      this.drivingSettings.getAdmin(tripId),
    ]);
    return this.enrich(countryCode, data as unknown as Record<string, unknown>);
  }

  async patch(
    userId: string,
    tripId: string,
    dto: PatchIcelandSelfDriveDrivingSettingsDto,
  ) {
    const data = await this.drivingSettings.patch(userId, tripId, dto);
    const countryCode = await this.resolveCountry(tripId);
    return this.enrich(countryCode, data as unknown as Record<string, unknown>);
  }

  async patchAdmin(tripId: string, dto: PatchIcelandSelfDriveDrivingSettingsDto) {
    const data = await this.drivingSettings.patchAdmin(tripId, dto);
    const countryCode = await this.resolveCountry(tripId);
    return this.enrich(countryCode, data as unknown as Record<string, unknown>);
  }

  async previewImpact(
    userId: string,
    tripId: string,
    dto: PreviewDrivingSettingsImpactDto,
  ) {
    const [countryCode, data] = await Promise.all([
      this.resolveCountry(tripId),
      this.drivingSettings.previewImpact(userId, tripId, dto),
    ]);
    return { ...data, countryCode, schemaId: 'tripnara.self_drive_impact_preview@v1' };
  }

  async reevaluate(
    userId: string,
    tripId: string,
    dto: ReevaluateDrivingSettingsDto,
  ) {
    const [countryCode, data] = await Promise.all([
      this.resolveCountry(tripId),
      this.drivingSettings.reevaluate(userId, tripId, dto),
    ]);
    return { ...data, countryCode, schemaId: 'tripnara.self_drive_reevaluate@v1' };
  }

  /** Public catalog hint for iOS: which packs / capabilities a countryCode unlocks */
  getCapabilities(countryCode: string) {
    const cc = normalizeCountryCode(countryCode);
    return {
      schemaId: 'tripnara.self_drive_capabilities@v1',
      countryCode: cc,
      destinationPackId: resolveDestinationPackId(cc),
      capabilities: resolveDestinationSelfDriveCapabilities(cc),
    };
  }
}
