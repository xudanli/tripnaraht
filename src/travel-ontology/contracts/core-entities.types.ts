/**
 * Travel Ontology — 核心实体与值对象（v1）
 *
 * SSOT: internal-docs/product/travel-ontology-world-model-v1.md §5.1–§5.2, §10–§14
 */

import type {
  BookingStatus,
  EntryEligibilityStatus,
  PlanItemStatus,
  RoadStatus,
  VehicleDrivetrain,
} from './common-states.types';

export const TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID = 'tripnara.travel_ontology_entity@v1';

/** §10.1 旅行者身份 */
export interface TravelerIdentity {
  nationality: string;
  passportCountry: string;
  passportExpiryDate: string;
  residenceCountry?: string;
  residencePermitType?: string;
  previousSchengenStayDays?: number;
  travelPurpose?: string;
  plannedStayDays: number;
}

/** §10.2 入境规则（Destination Pack 实例） */
export interface EntryRule {
  destinationCountry: string;
  passportCountry: string;
  visaRequirement: 'NONE' | 'VISA_REQUIRED' | 'ETIAS' | 'UNKNOWN';
  allowedStayRule?: string;
  passportValidityRule?: string;
  requiredDocuments?: string[];
  transitRule?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  sourceEvidence?: string;
}

/** §10.3 入境资格结果 */
export interface EntryEligibility {
  status: EntryEligibilityStatus;
  visaRequired: boolean;
  passportValiditySatisfied?: boolean;
  stayDurationSatisfied?: boolean;
  missingDocuments?: string[];
  recommendedActions?: string[];
  evidenceFreshness?: string;
}

/** §11.1 驾驶人 */
export interface Driver {
  driverId: string;
  age: number;
  licenceCountry: string;
  licenceLanguage?: string;
  licenceCategories?: string[];
  issueDate?: string;
  drivingExperienceYears?: number;
  internationalPermit?: boolean;
  winterDrivingExperience?: boolean;
  gravelRoadExperience?: boolean;
  fatigueState?: 'RESTED' | 'TIRED' | 'UNKNOWN';
}

/** §11.2 租用车辆 */
export interface RentalVehicle {
  vehicleId: string;
  vehicleClass: string;
  makeModel?: string;
  drivetrain: VehicleDrivetrain;
  fuelType?: string;
  tyreType?: string;
  seats?: number;
  luggageCapacity?: number;
  groundClearance?: number;
  permittedRoadClasses?: string[];
  prohibitedRoadClasses?: string[];
  riverCrossingAllowed?: boolean;
  winterEquipment?: boolean;
  roadsideAssistance?: boolean;
}

/** §11.3 租车合同 */
export interface RentalContract {
  contractId: string;
  supplier: string;
  pickupLocation: string;
  pickupWindow?: { start: string; end: string };
  returnLocation?: string;
  returnWindow?: { start: string; end: string };
  minimumDriverAge?: number;
  youngDriverFee?: number;
  depositAmount?: number;
  creditCardRequirement?: boolean;
  mileagePolicy?: string;
  fuelPolicy?: string;
  additionalDriverRule?: string;
  lateReturnRule?: string;
  prohibitedUse?: string[];
  contractVersion?: string;
}

/** §11.4 路线区段 */
export interface RouteSegment {
  segmentId: string;
  roadId: string;
  roadClass: string;
  surfaceType?: string;
  fRoad?: boolean;
  seasonalRoad?: boolean;
  riverCrossing?: boolean;
  elevation?: number;
  distance?: number;
  expectedDuration?: number;
  currentRoadStatus?: RoadStatus;
  weatherExposure?: string;
  nearestServiceDistance?: number;
  requiredVehicleCapability?: VehicleDrivetrain;
}

/** §12 保险 — 保障类型 */
export type InsuranceCoverageType =
  | 'ThirdPartyLiability'
  | 'CollisionDamageWaiver'
  | 'SuperCollisionDamageWaiver'
  | 'TheftProtection'
  | 'GravelProtection'
  | 'SandAndAshProtection'
  | 'WindshieldProtection'
  | 'TyreProtection'
  | 'RoadsideAssistance'
  | 'PersonalAccidentProtection';

/** §12.2 保障对象 */
export type CoverageScopeComponent =
  | 'bodywork'
  | 'windshield'
  | 'windows'
  | 'tyres'
  | 'wheels'
  | 'undercarriage'
  | 'engine'
  | 'interior'
  | 'doors'
  | 'towing'
  | 'thirdPartyLiability';

/** §12.3 损失原因 */
export type DamageCause =
  | 'collision'
  | 'gravel'
  | 'sandAndAsh'
  | 'wind'
  | 'theft'
  | 'animalCollision'
  | 'waterCrossing'
  | 'offRoadDriving'
  | 'tyrePuncture'
  | 'doorDamage'
  | 'negligence';

/** §12.4 财务责任 */
export interface FinancialLiability {
  deductibleAmount?: number;
  depositAmount?: number;
  maximumLiability?: number;
  preAuthorizationAmount?: number;
  claimAdministrationFee?: number;
  towingCostRule?: string;
  lossOfUseRule?: string;
}

/** §12.5 除外责任 */
export interface InsuranceExclusion {
  excludedCause?: DamageCause;
  excludedComponent?: CoverageScopeComponent;
  excludedRoadType?: string;
  excludedDriver?: string;
  negligenceCondition?: string;
  geographicalRestriction?: string;
  evidenceSource?: string;
}

/** §12 保险策略 */
export interface InsurancePolicy {
  policyId: string;
  coverageTypes: InsuranceCoverageType[];
  coveredComponents?: CoverageScopeComponent[];
  coveredCauses?: DamageCause[];
  exclusions?: InsuranceExclusion[];
  financialLiability?: FinancialLiability;
  claimRequirements?: string[];
}

/** §13.3 路线天气暴露 */
export interface RouteWeatherExposure {
  segmentId: string;
  windSpeed?: number;
  windGust?: number;
  precipitation?: number;
  snow?: number;
  visibility?: number;
  temperature?: number;
  icingProbability?: number;
  warningLevel?: 'NONE' | 'YELLOW' | 'ORANGE' | 'RED';
  exposedVehicleTypes?: string[];
}

/** §13.4 日照窗口 */
export interface DaylightWindow {
  date: string;
  sunrise: string;
  sunset: string;
  civilTwilightStart?: string;
  civilTwilightEnd?: string;
  usableDrivingWindow?: { start: string; end: string };
  usableOutdoorWindow?: { start: string; end: string };
}

/** §13.5 自然危险 */
export interface NaturalHazard {
  hazardId: string;
  hazardType: string;
  affectedGeometry?: unknown;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  validFrom?: string;
  validTo?: string;
  accessRestriction?: string;
  recommendedAction?: string;
  authoritySource?: string;
}

/** §14 活动能力 */
export interface ActivityCapability {
  activityId: string;
  openingWindow?: { start: string; end: string };
  lastEntryTime?: string;
  reservationRequired?: boolean;
  capacity?: number;
  minimumAge?: number;
  minimumHeight?: number;
  maximumWeight?: number;
  fitnessRequirement?: string;
  equipmentRequirement?: string[];
  weatherThresholds?: Record<string, unknown>;
  cancellationPolicy?: string;
  operatorQualification?: string;
  fallbackOptions?: string[];
  status?: PlanItemStatus;
}

/** §16 Trip World State 摘要（运行时 SSOT 契约，非存储形态） */
export interface TripWorldStateSummary {
  tripId: string;
  tripGoal?: string;
  planVersion?: string;
  factsVersion?: string;
  entryEligibility?: EntryEligibility;
  currentBlockerCount?: number;
  currentWarningCount?: number;
  openDecisionCount?: number;
  lastUpdatedAt: string;
}
