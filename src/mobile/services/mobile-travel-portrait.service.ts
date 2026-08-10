import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserPreferencesOtherStore, deepMerge } from './user-preferences-other.store';
import {
  DEFAULT_TRAVEL_PORTRAIT,
  DRIVING_PRIORITY_VALUES,
  GRAVEL_ACCEPTANCE_VALUES,
  MOBILE_TRAVEL_PORTRAIT_PREFERENCES_KEY,
  MOBILITY_LIMITATION_VALUES,
  NIGHT_DRIVING_ACCEPTANCE_VALUES,
  REST_FREQUENCY_VALUES,
  TRAVEL_PACE_VALUES,
  type MobileTravelPortraitResponseDto,
  type PatchMobileTravelPortraitDto,
} from '../dto/mobile-travel-portrait.dto';

const FITNESS_PROFILE_SOURCE = '/api/v1/fitness/profile';

@Injectable()
export class MobileTravelPortraitService {
  constructor(
    private readonly store: UserPreferencesOtherStore,
    private readonly prisma: PrismaService,
  ) {}

  async getPortrait(userId: string): Promise<MobileTravelPortraitResponseDto> {
    const { value, updatedAt } = await this.store.readKey<Record<string, unknown>>(
      userId,
      MOBILE_TRAVEL_PORTRAIT_PREFERENCES_KEY,
    );
    const merged = deepMerge(
      DEFAULT_TRAVEL_PORTRAIT as unknown as Record<string, unknown>,
      (value && typeof value === 'object' ? value : {}) as Record<string, unknown>,
    ) as unknown as typeof DEFAULT_TRAVEL_PORTRAIT;

    const hasProfile = await this.hasFitnessProfile(userId);

    return {
      ...merged,
      fitnessProfileRef: {
        hasProfile,
        source: FITNESS_PROFILE_SOURCE,
      },
      updatedAt: (updatedAt ?? new Date()).toISOString(),
    };
  }

  async patchPortrait(
    userId: string,
    dto: PatchMobileTravelPortraitDto,
  ): Promise<MobileTravelPortraitResponseDto> {
    validatePatch(dto);
    const patch: Record<string, unknown> = {};
    if (dto.pace) patch.pace = dto.pace;
    if (dto.accessibility) patch.accessibility = dto.accessibility;
    if (dto.drivingDefaults) patch.drivingDefaults = dto.drivingDefaults;

    if (Object.keys(patch).length > 0) {
      await this.store.mergeKey(userId, MOBILE_TRAVEL_PORTRAIT_PREFERENCES_KEY, patch);
    }
    return this.getPortrait(userId);
  }

  /** For Iceland create projection — returns stored+defaults without fitness lookup cost if needed. */
  async getPortraitForProjection(userId: string): Promise<typeof DEFAULT_TRAVEL_PORTRAIT> {
    const { value } = await this.store.readKey<Record<string, unknown>>(
      userId,
      MOBILE_TRAVEL_PORTRAIT_PREFERENCES_KEY,
    );
    return deepMerge(
      DEFAULT_TRAVEL_PORTRAIT as unknown as Record<string, unknown>,
      (value && typeof value === 'object' ? value : {}) as Record<string, unknown>,
    ) as unknown as typeof DEFAULT_TRAVEL_PORTRAIT;
  }

  private async hasFitnessProfile(userId: string): Promise<boolean> {
    try {
      const row = await this.prisma.user_fitness_profile_snapshot.findFirst({
        where: { user_id: userId },
        select: { id: true },
      });
      return Boolean(row);
    } catch {
      return false;
    }
  }
}

function validatePatch(dto: PatchMobileTravelPortraitDto): void {
  if (dto.pace?.travelPace != null) {
    assertEnum('pace.travelPace', dto.pace.travelPace, TRAVEL_PACE_VALUES);
  }
  if (dto.pace?.restFrequency != null) {
    assertEnum('pace.restFrequency', dto.pace.restFrequency, REST_FREQUENCY_VALUES);
  }
  if (dto.pace?.comfortableActivitiesPerDay != null) {
    const n = dto.pace.comfortableActivitiesPerDay;
    if (!Number.isFinite(n) || n < 0 || n > 20) {
      throw new BadRequestException('pace.comfortableActivitiesPerDay 非法');
    }
  }
  if (dto.accessibility?.mobilityLimitation != null) {
    assertEnum(
      'accessibility.mobilityLimitation',
      dto.accessibility.mobilityLimitation,
      MOBILITY_LIMITATION_VALUES,
    );
  }
  if (dto.accessibility?.dietaryRestrictions != null) {
    if (!Array.isArray(dto.accessibility.dietaryRestrictions)) {
      throw new BadRequestException('accessibility.dietaryRestrictions 须为数组');
    }
  }
  if (dto.drivingDefaults?.nightDrivingAcceptance != null) {
    assertEnum(
      'drivingDefaults.nightDrivingAcceptance',
      dto.drivingDefaults.nightDrivingAcceptance,
      NIGHT_DRIVING_ACCEPTANCE_VALUES,
    );
  }
  if (dto.drivingDefaults?.gravelAcceptance != null) {
    assertEnum(
      'drivingDefaults.gravelAcceptance',
      dto.drivingDefaults.gravelAcceptance,
      GRAVEL_ACCEPTANCE_VALUES,
    );
  }
  if (dto.drivingDefaults?.priority != null) {
    assertEnum(
      'drivingDefaults.priority',
      dto.drivingDefaults.priority,
      DRIVING_PRIORITY_VALUES,
    );
  }
  if (dto.drivingDefaults?.comfortableDailyDrivingHours != null) {
    const n = dto.drivingDefaults.comfortableDailyDrivingHours;
    if (!Number.isFinite(n) || n < 0 || n > 24) {
      throw new BadRequestException('drivingDefaults.comfortableDailyDrivingHours 非法');
    }
  }
}

function assertEnum(field: string, value: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) {
    throw new BadRequestException(`${field} 非法枚举值`);
  }
}
