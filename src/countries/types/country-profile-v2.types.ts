/**
 * CountryProfile V2 — algorithm-ready national commons (Decision OS).
 * Stored across Prisma columns; assembled for API via mapper.
 */

export type DrivingSide = 'LEFT' | 'RIGHT';
export type TippingLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type RecommendedCarType =
  | 'ANY'
  | '2WD'
  | '4WD_SUV'
  | '4WD_SUV_STUDDED_TIRES'
  | '2WD_WITH_SNOW_CHAINS_OR_4WD';

/** Prisma PaymentType 扩展标签（存于 paymentInfo.paymentProfile） */
export type CountryPaymentProfile =
  | 'CASH_HEAVY'
  | 'BALANCED'
  | 'DIGITAL_ONLY'
  | 'HYBRID_DIGITAL_PREFER';

export type RoadSurfaceForEta =
  | 'GRAVEL'
  | 'F_ROAD'
  | 'MOUNTAIN_PASS'
  | 'WINTER_BLACK_ICE'
  | 'ASPHALT';

export type AutoRerouteTrigger =
  | 'WIND_SPEED_OVER_20MS'
  | 'ROAD_STATUS_CLOSED'
  | 'AVALANCHE_WARNING'
  | string;

export interface CountryProfileV2TimeSeason {
  name: string;
  months: number[];
  avgDaylightHours?: number;
  outdoorRoutingWindow?: { start: string; end: string };
  recommendedCarType?: RecommendedCarType;
}

export interface CountryProfileV2TimeBoundaries {
  daylightFluctuation?: boolean;
  seasons?: CountryProfileV2TimeSeason[];
  environmentalTriggers?: {
    weatherAlertSource?: string;
    roadStatusSource?: string;
    autoRerouteTriggers?: AutoRerouteTrigger[];
  };
}

export interface CountryProfileV2DrivingRules {
  minAge?: number;
  drivingSide?: DrivingSide;
  requiresInternationalLicense?: boolean;
  requires4x4ForFRoad?: boolean;
  gravelRoadPresent?: boolean;
  acceptedLicenseTypes?: string[];
  speedLimits?: {
    urban?: number;
    gravelRoad?: number;
    asphaltHighway?: number;
    algorithmEtaPenaltyCoefficients?: {
      gravelRoad?: number;
      fRoad?: number;
      mountainPassRoad?: number;
      winterBlackIceRoad?: number;
    };
  };
  /** 习惯右舵用户在左行国家的 ETA 加成（如 0.15 = +15%） */
  leftHandDrivingEtaBuffer?: number;
  specialRules?: string[];
  infrastructure?: {
    selfServiceGasStation?: boolean;
    gasBrandRequiredApp?: string[];
    tollRoads?: string[];
  };
}

export interface CountryProfileV2DroneRules {
  allowed?: boolean;
  maxAltitudeMeter?: number;
  requiresRegistration?: boolean;
  registrationUrl?: string;
  restrictions?: string[];
  prohibitedPoiCategories?: string[];
  prohibitedPoiIds?: string[];
  prohibitedPlaceIds?: string[];
}

/** Entry / visa rules for one traveler nationality (ISO 3166-1 alpha-2 passport) */
export interface CountryProfileV2EntryRequirement {
  cost?: number;
  link?: string;
  status?: string;
  /** Display label (English-first for global UX) */
  statusLabel?: string;
  statusLabelCN?: string;
  /** @deprecated use statusLabelCN */
  statusCN?: string;
  requirementSummary?: string;
  requirementSummaryCN?: string;
  /** @deprecated use requirementSummary */
  requirement?: string;
  /** @deprecated use requirementSummaryCN */
  requirementCN?: string;
  allowedStay?: string;
  allowedStayCN?: string;
  schengenZone?: boolean;
  visaApplicationLeadTimeDays?: number;
  nzetaAvailableForPassports?: string[];
}

/** @deprecated alias */
export type CountryProfileV2VisaForCN = CountryProfileV2EntryRequirement;

/** Global entry requirements keyed by traveler passport nationality */
export interface CountryProfileV2EntryRequirements {
  officialLink?: string;
  byNationality: Record<string, CountryProfileV2EntryRequirement>;
}

export interface CountryProfileV2BiosecurityPolicy {
  strictBorderControl?: boolean;
  declarationPlatform?: string;
  declarationRequired?: boolean;
  instantFineAmountNZD?: number;
  prohibitedItems?: string[];
  inspectionRequiredItems?: string[];
}

export interface CountryProfileV2ExperienceRule {
  targetPoiCategory: string;
  requirementsCN?: string[];
  smartTipsCN?: string[];
}

export interface CountryProfileV2TravelCulture {
  tippingHabits?: {
    level?: TippingLevel;
    description?: string;
  };
  experienceRules?: CountryProfileV2ExperienceRule[];
  dressCodeHints?: unknown[];
}

export interface CountryProfileV2Compliance {
  droneRules?: CountryProfileV2DroneRules;
  drivingRules?: CountryProfileV2DrivingRules;
  biosecurityPolicy?: CountryProfileV2BiosecurityPolicy;
  alcoholPolicy?: {
    bacLimit?: number;
    legalAge?: number;
    specialRules?: string[];
    publicDrinking?: boolean;
  };
}

/** Full API payload (profile endpoint) */
export interface CountryProfileV2Data {
  schemaVersion: 2;
  isoCode: string;
  nameCN: string;
  nameEN?: string;
  updatedAt: string | Date;
  currencyCode?: string;
  currencyName?: string;
  exchangeRateToCNY?: number;
  exchangeRateToUSD?: number;
  paymentType?: string;
  paymentInfo?: Record<string, unknown>;
  powerInfo?: Record<string, unknown>;
  emergency?: Record<string, unknown>;
  entryRequirements?: CountryProfileV2EntryRequirements;
  /** @deprecated use entryRequirements.byNationality.CN — still populated when CN data exists */
  visaForCN?: CountryProfileV2EntryRequirement;
  complianceInfo?: CountryProfileV2Compliance;
  timeBoundaries?: CountryProfileV2TimeBoundaries;
  travelCulture?: CountryProfileV2TravelCulture;
  /** Destination hero image — trip list cover fallback & profile endpoint */
  coverImageUrl?: string | null;
}
