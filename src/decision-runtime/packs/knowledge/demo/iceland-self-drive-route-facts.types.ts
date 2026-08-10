/**
 * Structured route facts for Iceland self-drive situation hydrate.
 * Upstream planners / Decision Case write these; hydrate never scrapes free text.
 */

import type {
  IcelandRoadLiveStatus,
  IcelandVehicleRoadClass,
} from '../road-weather/iceland-road-weather.types';

export interface IcelandSelfDriveRouteFacts {
  schemaId?: 'tripnara.iceland.self_drive_route_facts@v1';
  /** Pack roadIds (e.g. F208, RING_ROAD) in traversal order */
  roadSegmentIds?: string[];
  roadStatusBySegmentId?: Partial<Record<string, IcelandRoadLiveStatus>>;
  seasonOpenBySegmentId?: Partial<Record<string, boolean>>;
  /** Contract flags such as NO_F_ROAD */
  rentalRestrictions?: string[];
  vehicleClass?: IcelandVehicleRoadClass;
  /** Structured driver experience — never inferred from free text */
  driverExperience?: 'NONE' | 'BASIC' | 'EXPERIENCED';
  /** Planned drive segment length (km) when known from planner / corridor */
  segmentLengthKm?: number;
  /** True only when planner/daylight layer asserts night driving for this segment */
  isNight?: boolean;
  /**
   * Structured daylight / load facts (SunCalc-derived minutes must be supplied upstream).
   * Never invent dusk/dawn here.
   */
  daylightDriving?: {
    nightExposureMinutes?: number;
    sameDayDriveMinutes?: number;
    nextMorningBooking?: boolean;
    unfamiliarRoad?: boolean;
    latestArrivalHotelLocalMin?: number;
    remainingDriveMinutes?: number;
    civilDawnLocalMin?: number;
    civilDuskLocalMin?: number;
  };
  /**
   * Winter knowledge slices — structured only.
   * Omit fields rather than invent OPEN/hours/plow ETA.
   */
  winter?: {
    attractionAccess?: {
      poiId: string;
      status: 'OPEN' | 'CLOSED' | 'PENDING_CONFIRMATION' | 'UNKNOWN';
      enforcement?: 'HARD' | 'SOFT';
      reasons?: string[];
    };
    activityRisk?: {
      experienceCode: string;
      weatherDependency?: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
      cancelReasonCodes?: string[];
      sessionStatus?: 'SCHEDULED' | 'WEATHER_HOLD' | 'CANCELLED' | 'UNKNOWN';
    };
    snowPlow?: {
      roadSegmentId?: string;
      plowRuleCode?: string;
      plowServiceBand?: 'DAILY' | 'REDUCED' | 'NOT_PLOWED' | 'UNKNOWN';
      plowDelayRangeMin?: [number, number];
    };
    lodging?: {
      openingMode: 'KNOWN' | 'UNKNOWN' | 'SEASONAL_REDUCED';
      latestArrivalLocalMin?: number;
      hoursUnknown?: boolean;
    };
  };
  /** Boolean route planner flags — not keyword guesses */
  routeFlags?: {
    hasFRoad?: boolean;
    hasGravel?: boolean;
    highWindExposure?: boolean;
  };
}
