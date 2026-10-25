/**
 * 注册轻量种子服务 — Contract 主写 + 可选 OS L1 兼容同步。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { MemoryService } from '../../agent/memory/services/memory.service';
import {
  createDefaultUserTravelProfile,
  type PacePreference,
  type RiskTolerance,
  type TravelPhilosophy,
} from '../../agent/memory/interfaces/user-travel-profile.interface';
import { TravelMemoryRuntimeService } from '../runtime/travel-memory-runtime.service';
import { writeTravelerMemoryObject } from './write-traveler-memory.util';
import { buildRegistrationSeedWrites } from './registration-seed.util';
import type {
  RegistrationSeedRequestV1,
  RegistrationSeedResultV1,
} from './registration-seed.types';
import { TripOverrideService } from './trip-override.service';

@Injectable()
export class RegistrationSeedService {
  private readonly logger = new Logger(RegistrationSeedService.name);

  constructor(
    private readonly runtime: TravelMemoryRuntimeService,
    private readonly tripOverride: TripOverrideService,
    @Optional() private readonly memoryService?: MemoryService,
  ) {}

  async applySeed(
    userId: string,
    seed: RegistrationSeedRequestV1,
    opts?: { syncOsL1?: boolean },
  ): Promise<RegistrationSeedResultV1 | { error: string }> {
    const built = buildRegistrationSeedWrites(userId, seed);
    if (built.ok === false) {
      return { error: built.reason };
    }

    const written: RegistrationSeedResultV1['written'] = [];
    const failed: RegistrationSeedResultV1['failed'] = [];

    for (const draft of built.drafts) {
      const result = writeTravelerMemoryObject(this.runtime, draft);
      if (result.ok === true) {
        written.push(result.object);
      } else {
        failed.push({ key: draft.key, reason: result.reason });
      }
    }

    const syncOsL1 = opts?.syncOsL1 !== false;
    let osL1Synced = false;
    let osL1Fields: string[] = [];
    if (syncOsL1 && this.memoryService && written.length > 0) {
      try {
        osL1Fields = await this.syncOsL1(userId, seed);
        osL1Synced = osL1Fields.length > 0;
      } catch (err) {
        this.logger.warn(
          `[RegistrationSeed] OS L1 sync failed user=${userId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const habitSummary = await this.tripOverride.getHabitSummary(userId);
    this.logger.debug(
      `[RegistrationSeed] user=${userId} written=${written.length} failed=${failed.length} osL1=${osL1Fields.join(',') || '-'}`,
    );

    return {
      schemaId: 'tripnara.registration_seed@v1',
      version: 1,
      subject_id: userId.trim(),
      written,
      failed,
      osL1Synced,
      osL1Fields,
      habitSummary,
    };
  }

  /** 迁移期：把种子投影到旧 OS UserTravelProfile，便于 ETC=off 冷启动。 */
  private async syncOsL1(
    userId: string,
    seed: RegistrationSeedRequestV1,
  ): Promise<string[]> {
    if (!this.memoryService) return [];
    const existing =
      (await this.memoryService.getUserTravelProfile(userId)) ??
      createDefaultUserTravelProfile(userId);
    const next = {
      ...existing,
      preferredRouteTypes: existing.preferredRouteTypes
        ? [...existing.preferredRouteTypes]
        : undefined,
      drivingFatiguePreferences: existing.drivingFatiguePreferences
        ? { ...existing.drivingFatiguePreferences }
        : undefined,
      companions: existing.companions ? { ...existing.companions } : undefined,
      source: 'explicit' as const,
      confidence: Math.max(existing.confidence ?? 0.3, 0.9),
      updatedAt: new Date(),
    };
    const fields: string[] = [];

    if (seed.pace) {
      next.pacePreference = seed.pace as PacePreference;
      fields.push('pacePreference');
    }
    if (seed.riskTolerance) {
      next.riskTolerance = seed.riskTolerance as RiskTolerance;
      fields.push('riskTolerance');
    }
    if (seed.travelPhilosophy) {
      next.travelPhilosophy = seed.travelPhilosophy as TravelPhilosophy;
      fields.push('travelPhilosophy');
    }
    // maxDailyDrivingHours / dietary / hotelAvoid：仅 Contract（OS L1 无对等字段）

    if (fields.length === 0) return [];
    await this.memoryService.saveUserTravelProfile(next);
    return fields;
  }
}
