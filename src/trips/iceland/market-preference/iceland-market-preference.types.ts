// src/trips/iceland/market-preference/iceland-market-preference.types.ts

import type { IcelandRentalIntentProfile } from '../../../skills/world/iceland-rental-guidance.skill';

export type IcelandMarketSegmentId =
  | 'IS_MARKET_US'
  | 'IS_MARKET_UK'
  | 'IS_MARKET_DACH_NORDIC'
  | 'IS_MARKET_EAST_ASIA';

export type IcelandMarketVehicleClass = '2wd' | '4x4' | 'luxury_suv' | 'private_guide';

export interface IcelandMarketRoutingInput {
  countryCode?: string;
  residencyCountry?: string;
  nationality?: string;
  locale?: string;
  month?: number;
  userQuery?: string;
  vehicleClass?: IcelandMarketVehicleClass;
  budgetStyle?: 'low' | 'medium' | 'high';
}

export interface IcelandMarketSegmentResolution {
  segmentId: IcelandMarketSegmentId;
  confidence: number;
  blended: boolean;
  runnerUpSegmentId?: IcelandMarketSegmentId;
  canonicalRouteId: string;
  /** 对应 RouteDirection.fixture / DB `name` */
  routeDirectionName?: string;
  routeDirectionTagAffinities: Record<string, number>;
  preferredRouteTypes?: string[];
  rentalIntentProfile?: IcelandRentalIntentProfile;
  worldModelIntents?: Record<string, number>;
  promptBlockZh: string;
}

export interface IcelandMarketPreferenceMatrixV1 {
  metadata: Record<string, unknown>;
  routing_weights: {
    residency: number;
    locale: number;
    season: number;
    vehicle: number;
  };
  blend_threshold: number;
  confidence_apply_full: number;
  confidence_apply_partial: number;
  season_cross_matrix: Record<string, Record<string, number>>;
  segments: Record<
    IcelandMarketSegmentId,
    {
      label_zh: string;
      label_en: string;
      residency_countries: string[];
      locale_prefixes: string[];
      canonical_route_id: string;
      peak_months: number[];
      avoid_months: number[];
      route_direction_tags: Record<string, number>;
      preferred_route_types?: string[];
      rental_intent_profile?: IcelandRentalIntentProfile;
      vehicle_affinities: Record<string, number>;
      decision_params_delta: {
        routeDirectionBias?: Partial<{
          sceneryWeight: number;
          stabilityWeight: number;
          adventureWeight: number;
          difficultyWeight: number;
        }>;
        constraints?: Partial<{
          maxDailyAscentM: number;
          maxSlopePct: number;
          bufferTimeMin: number;
        }>;
        strategyPreference?: Partial<{
          abuWeight: number;
          drDreWeight: number;
          neptuneWeight: number;
        }>;
        repairPolicy?: Partial<{
          preferSplitDays: boolean;
          preferAltRoute: boolean;
          preferRestDay: boolean;
        }>;
      };
      world_model_intents?: Record<string, number>;
      prompt_template_zh: string;
    }
  >;
}
