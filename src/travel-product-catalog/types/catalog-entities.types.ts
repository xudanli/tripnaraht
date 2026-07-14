/**
 * Travel Product Catalog — 五层实体契约（v1）
 *
 * Place → ExperienceDefinition → ProductOffering → ProductSession → RatePlan
 * (+ Operator 独立供应商库；空间关系多角色挂靠)
 */

import type {
  ExtensibleProductSubtypeCode,
  TravelProductType,
} from './product-taxonomy.types';

export const TRAVEL_PRODUCT_CATALOG_ENTITY_SCHEMA_ID =
  'tripnara.travel_product_catalog_entity@v1';

/** 产品 ↔ Place 的空间角色（一产品多坐标） */
export const ProductPlaceSpatialRole = {
  MEETING_POINT: 'meetingPoint',
  START_POINT: 'startPoint',
  END_POINT: 'endPoint',
  PICKUP_POINT: 'pickupPoints',
  OPERATING_AREA: 'operatingArea',
  RELATED_PLACE: 'relatedPlaces',
  FALLBACK_POINT: 'fallbackPoint',
  PARKING: 'parking',
} as const;

export type ProductPlaceSpatialRole =
  (typeof ProductPlaceSpatialRole)[keyof typeof ProductPlaceSpatialRole];

export type FitnessLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type WeatherDependency = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type ProductOfferingStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'SUSPENDED'
  | 'RETIRED';

export type ProductSessionStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'WEATHER_HOLD';

export type OperatorTrustLevel = 'UNVERIFIED' | 'BASIC' | 'VERIFIED' | 'PREFERRED';

/** Layer 2 — 体验定义（非供应商商品） */
export interface ExperienceDefinition {
  id: string;
  code: string;
  productType: TravelProductType;
  categoryCode: string;
  subtypeCode: ExtensibleProductSubtypeCode;
  displayNameZh: string;
  displayNameEn: string;
  typicalDurationMin?: number;
  fitnessLevel?: FitnessLevel;
  riskLevel?: RiskLevel;
  recommendedMinAge?: number;
  recommendedMaxAge?: number;
  equipmentTypical?: string[];
  seasonalityNotes?: string;
  weatherDependency?: WeatherDependency;
  commonCancelReasons?: string[];
  requiresGuide?: boolean;
  requiresLicense?: boolean;
  /** 意图层桥接：ExperienceAtomCode[] */
  relatedExperienceAtomCodes?: string[];
  countryCodes?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Layer 5 旁路 — 供应商 */
export interface Operator {
  id: string;
  brandName: string;
  legalName?: string;
  countryCode?: string;
  operatingRegions?: string[];
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  licenses?: string[];
  insuranceSummary?: string;
  languages?: string[];
  cancellationPolicySummary?: string;
  dataSources?: string[];
  distributionChannels?: string[];
  externalOperatorId?: string;
  trustLevel?: OperatorTrustLevel;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Layer 3 — 供应商具体产品 */
export interface ProductOffering {
  id: string;
  experienceDefinitionId: string;
  operatorId: string;
  nameEN: string;
  nameCN?: string;
  description?: string;
  productType: TravelProductType;
  categoryCode: string;
  subtypeCode: ExtensibleProductSubtypeCode;
  defaultDurationMin?: number;
  included?: string[];
  excluded?: string[];
  minAge?: number;
  maxAge?: number;
  minHeightCm?: number;
  maxWeightKg?: number;
  fitnessRequirement?: FitnessLevel | string;
  equipmentRequired?: string[];
  languages?: string[];
  cancellationPolicy?: string;
  safetyRules?: string[];
  bookingChannels?: string[];
  externalProductId?: string;
  status: ProductOfferingStatus;
  countryCode?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** 产品空间挂靠 */
export interface ProductPlaceLink {
  id: string;
  offeringId: string;
  placeId: number;
  role: ProductPlaceSpatialRole;
  /** 同角色多点时的排序（如多个 pickup） */
  sortOrder?: number;
  label?: string;
  /** GeoJSON / 近似航线等，非 Place 点状实体时用 */
  geometry?: unknown;
  metadata?: Record<string, unknown>;
}

/** Layer 4 — 班次 / 时段 */
export interface ProductSession {
  id: string;
  offeringId: string;
  /** 当地日历日 YYYY-MM-DD */
  localDate: string;
  startTimeLocal?: string;
  endTimeLocal?: string;
  meetTimeLocal?: string;
  latestCheckInLocal?: string;
  timezone?: string;
  capacityTotal?: number;
  capacityRemaining?: number;
  status: ProductSessionStatus;
  minParticipants?: number;
  isGuaranteedDeparture?: boolean;
  weatherStatus?: string;
  postponementOrCancelStatus?: string;
  externalSessionId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Layer 5 — 价格方案（勿在 Offering 上只放单一 price） */
export interface RatePlan {
  id: string;
  offeringId: string;
  /** 可选：班次专属价；空则适用于 offering 默认 */
  sessionId?: string;
  code: string;
  nameEN: string;
  nameCN?: string;
  currency: string;
  amount: number;
  travelerType?: 'ADULT' | 'CHILD' | 'INFANT' | 'FAMILY' | 'PRIVATE' | 'OTHER';
  refundable?: boolean;
  includesTransfer?: boolean;
  validFrom?: string;
  validTo?: string;
  inventoryCap?: number;
  bookingRules?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** 行程展示用统一项类型（Prisma ItemType 仍可映射，见 itinerary-product-binding） */
export type CatalogItineraryItemType =
  | 'PLACE_VISIT'
  | 'ACTIVITY'
  | 'TOUR'
  | 'TICKET'
  | 'TRANSPORT'
  | 'RENTAL'
  | 'DINING'
  | 'LODGING'
  | 'FREE_TIME';

export const PRODUCT_TYPE_TO_ITINERARY_ITEM_TYPE: Record<
  TravelProductType,
  CatalogItineraryItemType
> = {
  ACTIVITY_EXPERIENCE: 'ACTIVITY',
  SCENIC_FLIGHT: 'ACTIVITY',
  CRUISE_BOAT_TOUR: 'ACTIVITY',
  GUIDED_TOUR: 'TOUR',
  ADMISSION_TICKET: 'TICKET',
  TRANSPORT_SERVICE: 'TRANSPORT',
  RENTAL: 'RENTAL',
  DINING_RESERVATION: 'DINING',
};
