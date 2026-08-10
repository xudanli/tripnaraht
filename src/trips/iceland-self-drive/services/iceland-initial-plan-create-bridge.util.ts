/**
 * Maps Iceland create / trip context → InitialPlanSeedInput.
 * Create HTTP service should call IcelandInitialPlanPipelineService after trip shell exists.
 */

import type { CreateIcelandSelfDriveTripDto } from '../dto/create-iceland-self-drive-trip.dto';
import type { IcelandSelfDriveRegionId } from '../dto/iceland-self-drive-enums';
import type {
  InitialPlanSeedInput,
  PlaceRef,
  VehicleProfile,
} from '../types/iceland-initial-plan-seed.types';
import { resolveIcelandGatewayFromLocationCode } from '../utils/iceland-gateway-location.util';

export interface IcelandCreateSeedContext {
  tripId: string;
  dto: CreateIcelandSelfDriveTripDto;
  /** Resolved from vehicle catalog / acquisition */
  vehicleProfile?: VehicleProfile;
  requestedPlaces?: PlaceRef[];
  preferences?: InitialPlanSeedInput['preferences'];
  dailyDrivingLimitMin?: number;
}

/** Build seed input from create DTO — does not touch PlanVersion. */
export function buildInitialPlanSeedInputFromCreate(
  ctx: IcelandCreateSeedContext,
): InitialPlanSeedInput {
  const regionIds = (ctx.dto.regionIds?.length
    ? ctx.dto.regionIds
    : (['reykjanes', 'golden_circle', 'south_coast'] as IcelandSelfDriveRegionId[])) as string[];

  const confirmedLodgings: PlaceRef[] = (ctx.dto.bookings ?? [])
    .filter((b) => b.kind === 'lodging' && typeof b.placeId === 'number' && b.placeId > 0)
    .map((b) => ({
      placeId: b.placeId!,
      label: b.name,
      nightDate: b.startDate?.trim() ? b.startDate : undefined,
    }));

  return {
    tripId: ctx.tripId,
    travelDates: {
      startDate: ctx.dto.dateRange.startDate,
      endDate: ctx.dto.dateRange.endDate,
    },
    regionIds,
    originGateway: resolveIcelandGatewayFromLocationCode(
      ctx.dto.startLocationCode,
    ),
    exitGateway: resolveIcelandGatewayFromLocationCode(
      ctx.dto.endSameAsStart
        ? ctx.dto.startLocationCode
        : ctx.dto.endLocationCode,
    ),
    confirmedLodgings: confirmedLodgings.length ? confirmedLodgings : undefined,
    vehicleProfile: ctx.vehicleProfile,
    requestedPlaces: ctx.requestedPlaces,
    preferences: ctx.preferences,
    dailyDrivingLimitMin: ctx.dailyDrivingLimitMin,
  };
}
