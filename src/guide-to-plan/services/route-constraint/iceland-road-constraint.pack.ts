import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RoadStatusRealtimeService } from '../../../skills/world/services/road-status-realtime.service';
import type {
  CountryRoadConstraintInput,
  CountryRoadConstraintPack,
  RouteConstraintContext,
  RouteConstraintHintInput,
  RouteConstraintPackHint,
} from '../../types/guide-route-constraint.types';
import type { GuideRouteAvailability } from '../../types/guide-spatial.types';
import {
  assessIcelandRouteConstraints,
  detectIcelandPlaceIntent,
} from '../../utils/guide-iceland-constraint.util';
import { mapGuideVehicleType } from '../../utils/guide-vehicle.util';
import { buildBaseRouteAvailability } from '../../utils/route-constraint/route-availability.util';

/**
 * 冰岛道路约束 Pack：F-road / 高地季节 / 车型 / Road.is 实时状态。
 */
@Injectable()
export class IcelandRoadConstraintPack implements CountryRoadConstraintPack {
  readonly supportedCountryCodes = ['IS'] as const;

  private readonly logger = new Logger(IcelandRoadConstraintPack.name);
  private roadStatus?: RoadStatusRealtimeService;

  constructor(@Optional() private readonly moduleRef?: ModuleRef) {}

  async assessDayRoute(
    input: CountryRoadConstraintInput,
    ctx?: RouteConstraintContext,
  ): Promise<GuideRouteAvailability> {
    const intent = detectIcelandPlaceIntent(input.placeNames);
    const needsDeepCheck =
      intent.hasHighlandIntent || (input.drivingMinutes ?? 0) > 360 || intent.fRoadIds.length > 0;

    if (!needsDeepCheck) {
      return buildBaseRouteAvailability({
        routeExists: input.routeExists,
        drivingMinutes: input.drivingMinutes,
      });
    }

    const liveFRoadStatuses =
      ctx?.liveRoadStatuses ?? (await this.fetchLiveFRoadStatuses(intent.fRoadIds));
    const vehicleType = mapGuideVehicleType({
      vehicleType: input.travelContext?.vehicleType,
      transportMode: input.travelContext?.transportMode,
    });

    const result = assessIcelandRouteConstraints({
      travelDate: input.travelDate,
      placeNames: input.placeNames,
      vehicleType,
      drivingMinutes: input.drivingMinutes,
      routeExists: input.routeExists,
      liveFRoadStatuses,
    });

    return {
      routeExists: result.routeExists,
      legallyAllowed: result.legallyAllowed,
      operationallyAvailable: result.operationallyAvailable,
      recommended: result.recommended,
      level: result.level,
      warnings: result.warnings,
      blockedReasons: result.blockedReasons,
    };
  }

  private getRoadStatusService(): RoadStatusRealtimeService | null {
    if (this.roadStatus) return this.roadStatus;
    if (!this.moduleRef) return null;
    try {
      this.roadStatus = this.moduleRef.get(RoadStatusRealtimeService, { strict: false });
      return this.roadStatus ?? null;
    } catch {
      return null;
    }
  }

  private async fetchLiveFRoadStatuses(
    roadIds: string[],
  ): Promise<Array<{ roadId: string; status: string }>> {
    if (roadIds.length === 0) return [];
    const svc = this.getRoadStatusService();
    if (!svc) return [];

    const out: Array<{ roadId: string; status: string }> = [];
    await Promise.all(
      roadIds.map(async (roadId) => {
        try {
          const st = await svc.getRoadStatus(roadId);
          if (st) {
            out.push({ roadId: st.roadId ?? roadId, status: st.currentStatus });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.debug(`F-road status skip ${roadId}: ${message}`);
        }
      }),
    );
    return out;
  }

  getTravelContextHints(input: RouteConstraintHintInput): RouteConstraintPackHint[] {
    const ctx = input.travelContext ?? {};
    if (ctx.transportMode !== 'self_drive' || ctx.vehicleType) {
      return [];
    }
    return [
      {
        field: 'vehicleType',
        label: '自驾车型',
        reason: '冰岛 F-road/高地通行依赖车型（建议填写 4x4）',
        required: false,
      },
    ];
  }
}
