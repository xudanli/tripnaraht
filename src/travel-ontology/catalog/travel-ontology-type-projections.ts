/**
 * Travel Ontology — runtime-projectable field catalog (SSOT for Admin ontology APIs).
 *
 * 字段与枚举必须引用 contracts 中的 const 数组，禁止在 knowledge-system 再抄一份枚举。
 * Identity 扩展类型（Place / Road / Flight / WeatherRegion）由 knowledge-system 叠加。
 */

import {
  ENTRY_ELIGIBILITY_STATUS_VALUES,
  FACT_FRESHNESS_VALUES,
  FATIGUE_STATE_VALUES,
  HAZARD_SEVERITY_VALUES,
  PLAN_ITEM_STATUS_VALUES,
  ROAD_STATUS_VALUES,
  VEHICLE_DRIVETRAIN_VALUES,
  VISA_REQUIREMENT_VALUES,
  WEATHER_WARNING_LEVEL_VALUES,
} from '../contracts/common-states.types';
import { CONSTRAINT_ASSESSMENT_OUTCOME_VALUES } from '../contracts/constraint-assessment.types';
import {
  FACT_AUTHORITY_LEVEL_VALUES,
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  TRAVEL_WORLD_PREDICATES,
} from '../contracts/travel-world-fact.types';
import { TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID } from '../contracts/core-entities.types';
import { CONSTRAINT_ASSESSMENT_SCHEMA_ID } from '../contracts/constraint-assessment.types';

export type TravelOntologyDomain =
  | 'TRAVELER'
  | 'GEOGRAPHY'
  | 'PLACE'
  | 'MOBILITY'
  | 'ACTIVITY'
  | 'TIME'
  | 'ENVIRONMENT'
  | 'TRIP';

export type TravelOntologyTypeKind =
  | 'ENTITY'
  | 'VALUE_OBJECT'
  | 'FACT'
  | 'ASSESSMENT'
  | 'ENUM';

export type TravelOntologyValueKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'object'
  | 'array'
  | 'datetime'
  | 'unknown';

export type TravelOntologyFieldDef = {
  name: string;
  valueKind: TravelOntologyValueKind;
  /** 引用 contracts 枚举 const；投影时展开为枚举选项 */
  enumRef?: readonly string[];
  required?: boolean;
  description?: string;
};

export type TravelOntologyTypeProjection = {
  typeId: string;
  name: string;
  kind: TravelOntologyTypeKind;
  domain: TravelOntologyDomain;
  description: string;
  schemaRef: string;
  fields: TravelOntologyFieldDef[];
};

export type TravelOntologyPredicateProjection = {
  predicateId: string;
  predicate: string;
  domain: TravelOntologyDomain;
  description: string;
};

const PREDICATE_DOMAIN: Record<string, TravelOntologyDomain> = {
  'mobility.hasDrivetrain': 'MOBILITY',
  'mobility.permittedRoadClass': 'MOBILITY',
  'mobility.prohibitedRoadClass': 'MOBILITY',
  'route.requiredVehicleCapability': 'MOBILITY',
  'route.currentRoadStatus': 'MOBILITY',
  'insurance.coversDamageCause': 'MOBILITY',
  'insurance.excludesDamageCause': 'MOBILITY',
  'immigration.entryEligibility': 'TRAVELER',
  'immigration.visaRequired': 'TRAVELER',
  'weather.warningLevel': 'ENVIRONMENT',
  'activity.operatingStatus': 'ACTIVITY',
  'accommodation.checkInWindow': 'PLACE',
};

/**
 * 核心实体 / 值对象 / 事实 / 评估 — 与 contracts 接口字段对齐的投影表。
 * 增删字段时优先改 contracts，再同步此表（validate 可检测枚举漂移）。
 */
export const TRAVEL_ONTOLOGY_TYPE_PROJECTIONS: TravelOntologyTypeProjection[] = [
  {
    typeId: 'TravelerIdentity',
    name: 'TravelerIdentity',
    kind: 'ENTITY',
    domain: 'TRAVELER',
    description: '旅行者身份契约',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#TravelerIdentity`,
    fields: [
      { name: 'nationality', valueKind: 'string', required: true },
      { name: 'passportCountry', valueKind: 'string', required: true },
      { name: 'passportExpiryDate', valueKind: 'datetime', required: true },
      { name: 'plannedStayDays', valueKind: 'number', required: true },
      { name: 'residenceCountry', valueKind: 'string' },
      { name: 'residencePermitType', valueKind: 'string' },
      { name: 'previousSchengenStayDays', valueKind: 'number' },
      { name: 'travelPurpose', valueKind: 'string' },
    ],
  },
  {
    typeId: 'EntryRule',
    name: 'EntryRule',
    kind: 'VALUE_OBJECT',
    domain: 'TRAVELER',
    description: '入境规则（Destination Pack）',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#EntryRule`,
    fields: [
      { name: 'destinationCountry', valueKind: 'string', required: true },
      { name: 'passportCountry', valueKind: 'string', required: true },
      {
        name: 'visaRequirement',
        valueKind: 'enum',
        enumRef: VISA_REQUIREMENT_VALUES,
        required: true,
      },
      { name: 'allowedStayRule', valueKind: 'string' },
      { name: 'passportValidityRule', valueKind: 'string' },
      { name: 'requiredDocuments', valueKind: 'array' },
      { name: 'transitRule', valueKind: 'string' },
      { name: 'effectiveFrom', valueKind: 'datetime' },
      { name: 'effectiveTo', valueKind: 'datetime' },
      { name: 'sourceEvidence', valueKind: 'string' },
    ],
  },
  {
    typeId: 'EntryEligibility',
    name: 'EntryEligibility',
    kind: 'VALUE_OBJECT',
    domain: 'TRAVELER',
    description: '入境资格结果',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#EntryEligibility`,
    fields: [
      {
        name: 'status',
        valueKind: 'enum',
        enumRef: ENTRY_ELIGIBILITY_STATUS_VALUES,
        required: true,
      },
      { name: 'visaRequired', valueKind: 'boolean', required: true },
      { name: 'passportValiditySatisfied', valueKind: 'boolean' },
      { name: 'stayDurationSatisfied', valueKind: 'boolean' },
      { name: 'missingDocuments', valueKind: 'array' },
      { name: 'recommendedActions', valueKind: 'array' },
      { name: 'evidenceFreshness', valueKind: 'string' },
    ],
  },
  {
    typeId: 'Driver',
    name: 'Driver',
    kind: 'ENTITY',
    domain: 'TRAVELER',
    description: '驾驶人',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#Driver`,
    fields: [
      { name: 'driverId', valueKind: 'string', required: true },
      { name: 'age', valueKind: 'number', required: true },
      { name: 'licenceCountry', valueKind: 'string', required: true },
      { name: 'licenceLanguage', valueKind: 'string' },
      { name: 'licenceCategories', valueKind: 'array' },
      { name: 'issueDate', valueKind: 'datetime' },
      { name: 'drivingExperienceYears', valueKind: 'number' },
      { name: 'internationalPermit', valueKind: 'boolean' },
      { name: 'winterDrivingExperience', valueKind: 'boolean' },
      { name: 'gravelRoadExperience', valueKind: 'boolean' },
      { name: 'fatigueState', valueKind: 'enum', enumRef: FATIGUE_STATE_VALUES },
    ],
  },
  {
    typeId: 'RentalVehicle',
    name: 'RentalVehicle',
    kind: 'ENTITY',
    domain: 'MOBILITY',
    description: '租用车辆',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#RentalVehicle`,
    fields: [
      { name: 'vehicleId', valueKind: 'string', required: true },
      { name: 'vehicleClass', valueKind: 'string', required: true },
      { name: 'makeModel', valueKind: 'string' },
      {
        name: 'drivetrain',
        valueKind: 'enum',
        enumRef: VEHICLE_DRIVETRAIN_VALUES,
        required: true,
      },
      { name: 'fuelType', valueKind: 'string' },
      { name: 'tyreType', valueKind: 'string' },
      { name: 'seats', valueKind: 'number' },
      { name: 'luggageCapacity', valueKind: 'number' },
      { name: 'groundClearance', valueKind: 'number' },
      { name: 'permittedRoadClasses', valueKind: 'array' },
      { name: 'prohibitedRoadClasses', valueKind: 'array' },
      { name: 'riverCrossingAllowed', valueKind: 'boolean' },
      { name: 'winterEquipment', valueKind: 'boolean' },
      { name: 'roadsideAssistance', valueKind: 'boolean' },
    ],
  },
  {
    typeId: 'RentalContract',
    name: 'RentalContract',
    kind: 'ENTITY',
    domain: 'MOBILITY',
    description: '租车合同',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#RentalContract`,
    fields: [
      { name: 'contractId', valueKind: 'string', required: true },
      { name: 'supplier', valueKind: 'string', required: true },
      { name: 'pickupLocation', valueKind: 'string', required: true },
      { name: 'pickupWindow', valueKind: 'object' },
      { name: 'returnLocation', valueKind: 'string' },
      { name: 'returnWindow', valueKind: 'object' },
      { name: 'minimumDriverAge', valueKind: 'number' },
      { name: 'youngDriverFee', valueKind: 'number' },
      { name: 'depositAmount', valueKind: 'number' },
      { name: 'creditCardRequirement', valueKind: 'boolean' },
      { name: 'mileagePolicy', valueKind: 'string' },
      { name: 'fuelPolicy', valueKind: 'string' },
      { name: 'additionalDriverRule', valueKind: 'string' },
      { name: 'lateReturnRule', valueKind: 'string' },
      { name: 'prohibitedUse', valueKind: 'array' },
      { name: 'contractVersion', valueKind: 'string' },
    ],
  },
  {
    typeId: 'RouteSegment',
    name: 'RouteSegment',
    kind: 'ENTITY',
    domain: 'MOBILITY',
    description: '路线区段',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#RouteSegment`,
    fields: [
      { name: 'segmentId', valueKind: 'string', required: true },
      { name: 'roadId', valueKind: 'string', required: true },
      { name: 'roadClass', valueKind: 'string', required: true },
      { name: 'surfaceType', valueKind: 'string' },
      { name: 'fRoad', valueKind: 'boolean' },
      { name: 'seasonalRoad', valueKind: 'boolean' },
      { name: 'riverCrossing', valueKind: 'boolean' },
      { name: 'elevation', valueKind: 'number' },
      { name: 'distance', valueKind: 'number' },
      { name: 'expectedDuration', valueKind: 'number' },
      { name: 'currentRoadStatus', valueKind: 'enum', enumRef: ROAD_STATUS_VALUES },
      { name: 'weatherExposure', valueKind: 'string' },
      { name: 'nearestServiceDistance', valueKind: 'number' },
      {
        name: 'requiredVehicleCapability',
        valueKind: 'enum',
        enumRef: VEHICLE_DRIVETRAIN_VALUES,
      },
    ],
  },
  {
    typeId: 'InsurancePolicy',
    name: 'InsurancePolicy',
    kind: 'ENTITY',
    domain: 'MOBILITY',
    description: '保险策略',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#InsurancePolicy`,
    fields: [
      { name: 'policyId', valueKind: 'string', required: true },
      { name: 'coverageTypes', valueKind: 'array', required: true },
      { name: 'coveredComponents', valueKind: 'array' },
      { name: 'coveredCauses', valueKind: 'array' },
      { name: 'exclusions', valueKind: 'array' },
      { name: 'financialLiability', valueKind: 'object' },
      { name: 'claimRequirements', valueKind: 'array' },
    ],
  },
  {
    typeId: 'RouteWeatherExposure',
    name: 'RouteWeatherExposure',
    kind: 'VALUE_OBJECT',
    domain: 'ENVIRONMENT',
    description: '路线天气暴露',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#RouteWeatherExposure`,
    fields: [
      { name: 'segmentId', valueKind: 'string', required: true },
      { name: 'windSpeed', valueKind: 'number' },
      { name: 'windGust', valueKind: 'number' },
      { name: 'precipitation', valueKind: 'number' },
      { name: 'snow', valueKind: 'number' },
      { name: 'visibility', valueKind: 'number' },
      { name: 'temperature', valueKind: 'number' },
      { name: 'icingProbability', valueKind: 'number' },
      {
        name: 'warningLevel',
        valueKind: 'enum',
        enumRef: WEATHER_WARNING_LEVEL_VALUES,
      },
      { name: 'exposedVehicleTypes', valueKind: 'array' },
    ],
  },
  {
    typeId: 'NaturalHazard',
    name: 'NaturalHazard',
    kind: 'ENTITY',
    domain: 'ENVIRONMENT',
    description: '自然危险',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#NaturalHazard`,
    fields: [
      { name: 'hazardId', valueKind: 'string', required: true },
      { name: 'hazardType', valueKind: 'string', required: true },
      { name: 'affectedGeometry', valueKind: 'unknown' },
      {
        name: 'severity',
        valueKind: 'enum',
        enumRef: HAZARD_SEVERITY_VALUES,
        required: true,
      },
      { name: 'validFrom', valueKind: 'datetime' },
      { name: 'validTo', valueKind: 'datetime' },
      { name: 'accessRestriction', valueKind: 'string' },
      { name: 'recommendedAction', valueKind: 'string' },
      { name: 'authoritySource', valueKind: 'string' },
    ],
  },
  {
    typeId: 'DaylightWindow',
    name: 'DaylightWindow',
    kind: 'VALUE_OBJECT',
    domain: 'TIME',
    description: '日照窗口',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#DaylightWindow`,
    fields: [
      { name: 'date', valueKind: 'string', required: true },
      { name: 'sunrise', valueKind: 'datetime', required: true },
      { name: 'sunset', valueKind: 'datetime', required: true },
      { name: 'civilTwilightStart', valueKind: 'datetime' },
      { name: 'civilTwilightEnd', valueKind: 'datetime' },
      { name: 'usableDrivingWindow', valueKind: 'object' },
      { name: 'usableOutdoorWindow', valueKind: 'object' },
    ],
  },
  {
    typeId: 'ActivityCapability',
    name: 'ActivityCapability',
    kind: 'ENTITY',
    domain: 'ACTIVITY',
    description: '活动能力',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#ActivityCapability`,
    fields: [
      { name: 'activityId', valueKind: 'string', required: true },
      { name: 'openingWindow', valueKind: 'object' },
      { name: 'lastEntryTime', valueKind: 'datetime' },
      { name: 'reservationRequired', valueKind: 'boolean' },
      { name: 'capacity', valueKind: 'number' },
      { name: 'minimumAge', valueKind: 'number' },
      { name: 'minimumHeight', valueKind: 'number' },
      { name: 'maximumWeight', valueKind: 'number' },
      { name: 'fitnessRequirement', valueKind: 'string' },
      { name: 'equipmentRequirement', valueKind: 'array' },
      { name: 'weatherThresholds', valueKind: 'object' },
      { name: 'cancellationPolicy', valueKind: 'string' },
      { name: 'operatorQualification', valueKind: 'string' },
      { name: 'fallbackOptions', valueKind: 'array' },
      { name: 'status', valueKind: 'enum', enumRef: PLAN_ITEM_STATUS_VALUES },
    ],
  },
  {
    typeId: 'TripWorldStateSummary',
    name: 'TripWorldStateSummary',
    kind: 'VALUE_OBJECT',
    domain: 'TRIP',
    description: 'Trip World State 摘要契约',
    schemaRef: `${TRAVEL_ONTOLOGY_ENTITY_SCHEMA_ID}#TripWorldStateSummary`,
    fields: [
      { name: 'tripId', valueKind: 'string', required: true },
      { name: 'tripGoal', valueKind: 'string' },
      { name: 'planVersion', valueKind: 'string' },
      { name: 'factsVersion', valueKind: 'string' },
      { name: 'entryEligibility', valueKind: 'object' },
      { name: 'currentBlockerCount', valueKind: 'number' },
      { name: 'currentWarningCount', valueKind: 'number' },
      { name: 'openDecisionCount', valueKind: 'number' },
      { name: 'lastUpdatedAt', valueKind: 'datetime', required: true },
    ],
  },
  {
    typeId: 'TravelWorldFact',
    name: 'TravelWorldFact',
    kind: 'FACT',
    domain: 'TRIP',
    description: '统一世界事实原子',
    schemaRef: TRAVEL_WORLD_FACT_SCHEMA_ID,
    fields: [
      { name: 'factId', valueKind: 'string', required: true },
      { name: 'subjectType', valueKind: 'string', required: true },
      { name: 'subjectId', valueKind: 'string', required: true },
      { name: 'predicate', valueKind: 'string', required: true },
      { name: 'value', valueKind: 'unknown', required: true },
      { name: 'scope', valueKind: 'object' },
      {
        name: 'authorityLevel',
        valueKind: 'enum',
        enumRef: FACT_AUTHORITY_LEVEL_VALUES,
        required: true,
      },
      { name: 'source', valueKind: 'object' },
      { name: 'validFrom', valueKind: 'datetime' },
      { name: 'validTo', valueKind: 'datetime' },
      { name: 'observedAt', valueKind: 'datetime', required: true },
      { name: 'expiresAt', valueKind: 'datetime' },
      { name: 'confidence', valueKind: 'number', required: true },
      {
        name: 'freshness',
        valueKind: 'enum',
        enumRef: FACT_FRESHNESS_VALUES,
        required: true,
      },
      { name: 'verificationStatus', valueKind: 'string' },
      { name: 'replanTrigger', valueKind: 'boolean' },
    ],
  },
  {
    typeId: 'ConstraintAssessment',
    name: 'ConstraintAssessment',
    kind: 'ASSESSMENT',
    domain: 'TRIP',
    description: '约束评估结果',
    schemaRef: CONSTRAINT_ASSESSMENT_SCHEMA_ID,
    fields: [
      { name: 'assessmentId', valueKind: 'string', required: true },
      { name: 'basis', valueKind: 'object', required: true },
      {
        name: 'outcome',
        valueKind: 'enum',
        enumRef: CONSTRAINT_ASSESSMENT_OUTCOME_VALUES,
        required: true,
      },
      { name: 'reasonCodes', valueKind: 'array', required: true },
      { name: 'factRefs', valueKind: 'array' },
      { name: 'constraintRefs', valueKind: 'array' },
      { name: 'affectedScopes', valueKind: 'array' },
      { name: 'affectedGates', valueKind: 'array' },
      { name: 'evaluatedAt', valueKind: 'datetime', required: true },
      { name: 'lifecycleStatus', valueKind: 'string' },
      { name: 'invalidated', valueKind: 'boolean' },
      { name: 'problemIds', valueKind: 'array' },
      { name: 'semanticKey', valueKind: 'string' },
    ],
  },
];

export function projectTravelOntologyPredicates(): TravelOntologyPredicateProjection[] {
  return Object.values(TRAVEL_WORLD_PREDICATES).map((p) => ({
    predicateId: p,
    predicate: p,
    domain: PREDICATE_DOMAIN[p] ?? 'TRIP',
    description: `TravelWorldFact predicate ${p}`,
  }));
}

/** 校验：投影里的 enumRef 非空（防漏挂 contracts 枚举） */
export function assertTravelOntologyProjectionIntegrity(): string[] {
  const issues: string[] = [];
  for (const t of TRAVEL_ONTOLOGY_TYPE_PROJECTIONS) {
    for (const f of t.fields) {
      if (f.valueKind === 'enum' && (!f.enumRef || f.enumRef.length === 0)) {
        issues.push(`${t.typeId}.${f.name}: enum missing enumRef`);
      }
    }
  }
  return issues;
}
