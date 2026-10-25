/**
 * Trip Override Service — 「按我的习惯 / 这次不一样」。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TravelMemoryRuntimeService } from '../runtime/travel-memory-runtime.service';
import { writeTravelerMemoryObject } from './write-traveler-memory.util';
import { encodeTravelerMemoryPredicate } from './traveler-memory-predicate.util';
import {
  buildTravelerHabitSummary,
  readTripMemoryMode,
  selectClearableTripOverrides,
} from './trip-override.util';
import { projectOsProfileToHabitMemories } from './os-habit-projection.util';
import {
  TRIP_MEMORY_MODE_KEY,
  type ApplyHabitInheritRequestV1,
  type ApplyTripDifferentRequestV1,
  type TravelerHabitSummaryV1,
  type TripOverrideApplyResultV1,
} from './trip-override.types';
import type { TravelerMemoryObjectV1 } from './traveler-memory-contract.types';

/** Contract 优先；OS 投影按 domain+key 补缺 */
function mergeHabitMemories(
  primary: TravelerMemoryObjectV1[],
  fallback: TravelerMemoryObjectV1[],
): TravelerMemoryObjectV1[] {
  const seen = new Set(
    primary.map((m) => `${m.domain}:${m.key}:${m.semantic_type}`),
  );
  const out = [...primary];
  for (const m of fallback) {
    const k = `${m.domain}:${m.key}:${m.semantic_type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

@Injectable()
export class TripOverrideService {
  private readonly logger = new Logger(TripOverrideService.name);

  constructor(
    private readonly runtime: TravelMemoryRuntimeService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async getHabitSummary(userId: string): Promise<TravelerHabitSummaryV1> {
    const fromLedger = this.runtime.listTravelerMemories(userId, {
      includeCandidates: false,
      includeLegacy: true,
    });
    const fromOs = await this.loadOsHabitMemories(userId);
    // Contract 优先；OS 投影补缺（按 domain+key）
    const merged = mergeHabitMemories(fromLedger, fromOs);
    return buildTravelerHabitSummary(userId, merged);
  }

  private async loadOsHabitMemories(
    userId: string,
  ): Promise<TravelerMemoryObjectV1[]> {
    if (!this.prisma?.isDbConnected?.()) return [];
    try {
      const [profile, travel] = await Promise.all([
        this.prisma.userProfile.findUnique({
          where: { userId },
          select: { preferences: true },
        }),
        this.prisma.userTravelProfile.findUnique({
          where: { userId },
        }),
      ]);
      const preferences =
        profile?.preferences &&
        typeof profile.preferences === 'object' &&
        !Array.isArray(profile.preferences)
          ? (profile.preferences as Record<string, unknown>)
          : null;
      return projectOsProfileToHabitMemories({
        userId,
        preferences,
        travelProfile: travel
          ? {
              pacePreference: travel.pacePreference,
              riskTolerance: travel.riskTolerance,
              travelPhilosophy: travel.travelPhilosophy,
              preferredRouteTypes: travel.preferredRouteTypes,
              extendedProfile: travel.extendedProfile,
            }
          : null,
      });
    } catch (err) {
      this.logger.warn(
        `[TripOverride] OS habit load failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  listTripOverrides(tripId: string): TravelerMemoryObjectV1[] {
    return this.runtime.listTravelerMemories(tripId, {
      includeCandidates: false,
      includeLegacy: false,
    });
  }

  getTripMemoryMode(tripId: string) {
    return readTripMemoryMode(this.listTripOverrides(tripId));
  }

  /**
   * 按我的习惯：不写 L1；标记 HABIT_INHERIT；默认清掉本次覆盖。
   */
  async applyHabitInherit(
    req: ApplyHabitInheritRequestV1,
  ): Promise<TripOverrideApplyResultV1> {
    const clearExisting = req.clearExistingOverrides !== false;
    let clearedCount = 0;
    if (clearExisting) {
      clearedCount = this.clearTripOverrides(req.tripId, {
        includeModeMarker: true,
      });
    }

    this.writeModeMarker(req.userId, req.tripId, 'HABIT_INHERIT');

    const habitSummary = await this.getHabitSummary(req.userId);
    this.logger.debug(
      `[TripOverride] HABIT_INHERIT trip=${req.tripId} cleared=${clearedCount} habits=${habitSummary.memoryCount}`,
    );

    return {
      schemaId: 'tripnara.trip_override_apply@v1',
      version: 1,
      mode: 'HABIT_INHERIT',
      tripId: req.tripId,
      userId: req.userId,
      overrides: [],
      clearedCount,
      habitSummary,
      l1Untouched: true,
    };
  }

  /**
   * 这次不一样：只写 TRIP scope；禁止污染 L1。
   */
  async applyTripDifferent(
    req: ApplyTripDifferentRequestV1,
  ): Promise<TripOverrideApplyResultV1> {
    if (!req.overrides?.length) {
      throw new Error('overrides_required');
    }

    const replace = req.replaceExisting !== false;
    let clearedCount = 0;
    if (replace) {
      clearedCount = this.clearTripOverrides(req.tripId, {
        includeModeMarker: true,
      });
    }

    this.writeModeMarker(req.userId, req.tripId, 'TRIP_DIFFERENT');

    const written: TravelerMemoryObjectV1[] = [];
    for (const item of req.overrides) {
      if (item.key === TRIP_MEMORY_MODE_KEY) {
        continue;
      }
      const result = writeTravelerMemoryObject(this.runtime, {
        subject_id: req.userId,
        trip_id: req.tripId,
        scope: 'TRIP',
        domain: item.domain,
        semantic_type: item.semantic_type,
        key: item.key,
        value: item.value,
        source: ['EXPLICIT'],
        explicitConfirm: true,
        confidence: item.confidence ?? 0.9,
        override_policy: 'L2_WINS',
        evidence_refs: [
          {
            type: 'USER_EXPLICIT',
            id: `trip_override:${req.tripId}:${item.domain}:${item.key}`,
          },
        ],
      });
      if (result.ok === false) {
        throw new Error(`override_write_failed:${item.key}:${result.reason}`);
      }
      if (result.object.scope !== 'TRIP') {
        throw new Error('l1_pollution_guard:scope_not_trip');
      }
      if (result.object.subject_id !== req.tripId) {
        throw new Error('l1_pollution_guard:subject_not_trip');
      }
      written.push(result.object);
    }

    const habitSummary = await this.getHabitSummary(req.userId);
    this.logger.debug(
      `[TripOverride] TRIP_DIFFERENT trip=${req.tripId} overrides=${written.length} cleared=${clearedCount}`,
    );

    return {
      schemaId: 'tripnara.trip_override_apply@v1',
      version: 1,
      mode: 'TRIP_DIFFERENT',
      tripId: req.tripId,
      userId: req.userId,
      overrides: written,
      clearedCount,
      habitSummary,
      l1Untouched: true,
    };
  }

  clearTripOverrides(
    tripId: string,
    opts?: { includeModeMarker?: boolean },
  ): number {
    const existing = this.listTripOverrides(tripId);
    const toClear = selectClearableTripOverrides(existing, opts);
    let n = 0;
    for (const m of toClear) {
      this.runtime.invalidate({
        subject: { type: 'TRIP', id: tripId },
        predicate: encodeTravelerMemoryPredicate({
          domain: m.domain,
          semantic_type: m.semantic_type,
          key: m.key,
        }),
        scope: 'TRIP',
        targetEventId: m.memory_id,
        reason: 'trip_override_clear',
      });
      n += 1;
    }
    return n;
  }

  private writeModeMarker(
    userId: string,
    tripId: string,
    mode: 'HABIT_INHERIT' | 'TRIP_DIFFERENT',
  ): void {
    const result = writeTravelerMemoryObject(this.runtime, {
      subject_id: userId,
      trip_id: tripId,
      scope: 'TRIP',
      domain: 'DECISION_STYLE',
      semantic_type: 'HABIT',
      key: TRIP_MEMORY_MODE_KEY,
      value: mode,
      source: ['EXPLICIT'],
      explicitConfirm: true,
      visibility: 'INTERNAL_ONLY',
      override_policy: 'L2_WINS',
      evidence_refs: [
        { type: 'USER_EXPLICIT', id: `trip_memory_mode:${tripId}:${mode}` },
      ],
    });
    if (result.ok === false) {
      throw new Error(`mode_marker_failed:${result.reason}`);
    }
    if (result.object.scope !== 'TRIP') {
      throw new Error('l1_pollution_guard:mode_scope');
    }
  }
}
