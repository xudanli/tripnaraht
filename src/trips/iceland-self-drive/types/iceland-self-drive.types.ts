import type {
  IcelandSelfDriveArrivalDayDriving,
  IcelandSelfDriveDriverRole,
  IcelandSelfDriveExperienceLevel,
  IcelandSelfDriveFuelType,
  IcelandSelfDriveGravelTolerance,
  IcelandSelfDriveLocationCode,
  IcelandSelfDriveNightAcceptance,
  IcelandSelfDriveNightDrivingPreference,
  IcelandSelfDrivePacePreference,
  IcelandSelfDriveRefuelStrategy,
  IcelandSelfDriveRegionId,
  IcelandSelfDriveRestFrequency,
  IcelandSelfDriveRoadHazardPreference,
  IcelandSelfDriveSettingsItem,
  IcelandSelfDriveSettingsStatus,
  IcelandSelfDriveSurfaceExperience,
  IcelandSelfDriveVehicleAcquisition,
  IcelandSelfDriveVehicleClass,
  IcelandSelfDriveVehicleLifecycleStatus,
  IcelandSelfDriveVehicleSource,
} from '../dto/iceland-self-drive-enums';
import type { IcelandSelfDriveBookingDto } from '../dto/create-iceland-self-drive-trip.dto';
import type { IcelandSelfDriveRegionCoverage } from './iceland-region-planning-pack.types';

export type { IcelandSelfDriveRegionCoverage } from './iceland-region-planning-pack.types';

export interface IcelandSelfDriveCompletionItem {
  code: string;
  label: string;
  settingsItem?: IcelandSelfDriveSettingsItem;
}

export interface IcelandSelfDriveGeneratedRoute {
  summaryTitle: string;
  summarySubtitle: string;
  regionSummary: string;
  durationLabel: string;
  dateRangeLabel: string;
  transferLabel: string;
  travelerLabel: string;
}

export interface IcelandSelfDriveCompletion {
  progress: number;
  headline: string;
  subheadline: string;
  doneItems: IcelandSelfDriveCompletionItem[];
  pendingItems: IcelandSelfDriveCompletionItem[];
}

export interface IcelandSelfDriveWarning {
  code: string;
  message: string;
}

export interface IcelandSelfDriveSettingsSummaryItem {
  code: IcelandSelfDriveSettingsItem;
  status: IcelandSelfDriveSettingsStatus;
  pendingCount: number | null;
}

export interface IcelandSelfDriveRouteSkeletonDay {
  date: string;
  corridorLabel: string;
  overnightHint: string;
}

export interface IcelandSelfDriveRouteSkeleton {
  strategyId: string;
  regionSummary: string;
  days: IcelandSelfDriveRouteSkeletonDay[];
}

export interface IcelandSelfDriveHardAnchor {
  itemId: string;
  clientId: string;
  kind: 'lodging' | 'activity';
  placeId: number | null;
  regionId?: string | null;
}

export interface IcelandSelfDriveVehicleRecognitionSummary {
  fields: string[];
  warnings: string[];
}

export interface IcelandSelfDriveVehicleSettings {
  lifecycleStatus: IcelandSelfDriveVehicleLifecycleStatus;
  acquisition: IcelandSelfDriveVehicleAcquisition;
  rentalCompanyId: string | null;
  rentalCompanyName: string | null;
  vehicleClass: IcelandSelfDriveVehicleClass | null;
  vehicleClassLabel: string | null;
  is4wd: boolean | null;
  fuelType: IcelandSelfDriveFuelType | null;
  isHighBody: boolean | null;
  estimatedRangeKm: number | null;
  pickupAt: string | null;
  rentalRestrictions: string[];
  source: IcelandSelfDriveVehicleSource;
  recognitionSummary: IcelandSelfDriveVehicleRecognitionSummary | null;
}

export interface IcelandSelfDriveVehicleDocumentRecord {
  docId: string;
  status: 'processing' | 'ready' | 'failed';
  createdAt: string;
  updatedAt: string;
  contentType: string | null;
  fileName: string | null;
  vehicleDraft: Partial<IcelandSelfDriveVehicleSettings>;
  warnings: string[];
  errorMessage?: string;
}

export interface IcelandSelfDriveDriverCandidateState {
  memberId: string;
  isSelected: boolean;
  role: IcelandSelfDriveDriverRole;
  snowExperience: IcelandSelfDriveSurfaceExperience | null;
  gravelExperience: IcelandSelfDriveSurfaceExperience | null;
  nightAcceptance: IcelandSelfDriveNightAcceptance | null;
  isAdditionalDriver: boolean;
}

export interface IcelandSelfDriveDriversSettings {
  driverCount: number | null;
  experienceLevel: IcelandSelfDriveExperienceLevel | null;
  dailyDrivingLimitHours: number | null;
  arrivalDayDriving: IcelandSelfDriveArrivalDayDriving | null;
  candidates: IcelandSelfDriveDriverCandidateState[];
}

export interface IcelandSelfDriveMembersSettings {
  hasChildren: boolean;
  hasElderly: boolean;
  motionSickness: boolean;
}

export interface IcelandSelfDriveRoutePreferenceSettings {
  pacePreference: IcelandSelfDrivePacePreference;
  dailyDrivingLimitHours: number | null;
  useSystemRest: boolean;
  restFrequency: IcelandSelfDriveRestFrequency;
  arrivalDayDriving: IcelandSelfDriveArrivalDayDriving | null;
  gravelTolerance: IcelandSelfDriveGravelTolerance;
  allowNightDriving: boolean;
  nightDrivingPreference: IcelandSelfDriveNightDrivingPreference;
  fRoadPreference: IcelandSelfDriveRoadHazardPreference;
  waterCrossingPreference: IcelandSelfDriveRoadHazardPreference;
  highWindPreference: IcelandSelfDriveRoadHazardPreference;
}

export interface IcelandSelfDriveFuelSettings {
  fuelType: IcelandSelfDriveFuelType | null;
  refuelStrategy: IcelandSelfDriveRefuelStrategy;
  useDynamicSafetyMargin: boolean;
  safetyMarginPercent: number | null;
  configured: boolean;
}

export interface IcelandSelfDriveInsuranceSettings {
  userAcknowledgedCodes: string[];
  preferredUpgradeCodes: string[];
  configured: boolean;
}

export interface IcelandSelfDriveDrivingSettingsState {
  vehicle: IcelandSelfDriveVehicleSettings;
  drivers: IcelandSelfDriveDriversSettings;
  members: IcelandSelfDriveMembersSettings;
  routePreference: IcelandSelfDriveRoutePreferenceSettings;
  fuel: IcelandSelfDriveFuelSettings;
  insurance: IcelandSelfDriveInsuranceSettings;
}

export interface IcelandSelfDriveWizardInput {
  destinationCode: 'IS';
  productLine: 'iceland_self_drive';
  dateRange: {
    startDate: string;
    endDate: string;
  };
  arrivalAt: string | null;
  departureAt: string | null;
  travelerCount: number;
  startLocationCode: IcelandSelfDriveLocationCode;
  endLocationCode: IcelandSelfDriveLocationCode;
  endSameAsStart: boolean;
  vehicleAcquisition: IcelandSelfDriveVehicleAcquisition;
  regionIds: IcelandSelfDriveRegionId[];
  bookings: IcelandSelfDriveBookingDto[];
  skipBookings: boolean;
  fillBookingsLater: boolean;
}

export type IcelandSelfDriveGenerationStatus = 'RUNNING' | 'READY' | 'FAILED';

export interface IcelandSelfDriveDomainEvent {
  type: 'route_generated' | 'driving_settings_updated' | 'trip_context_changed';
  at: string;
  message?: string;
}

/** @deprecated 用 IcelandSelfDriveInitialPlanState */
export interface IcelandSelfDriveInitialScheduleState {
  ready: boolean;
  scheduledItemCount: number;
  appliedAt: string | null;
  lastProposalId: string | null;
}

export type IcelandSelfDriveInitialPlanStatus =
  | 'GENERATING'
  | 'READY'
  | 'PARTIAL'
  | 'FAILED';

export type IcelandSelfDriveInitialPlanVerificationStatus =
  | 'PASS'
  | 'WARN'
  | 'BLOCK'
  | 'NOT_RUN';

export type IcelandSelfDriveArrangeAuthority =
  | 'coverage_ortools'
  | 'coverage'
  | 'greedy';

export interface IcelandSelfDriveInitialPlanState {
  status: IcelandSelfDriveInitialPlanStatus;
  verificationStatus: IcelandSelfDriveInitialPlanVerificationStatus;
  scheduledDayCount: number;
  scheduledActivityCount: number;
  scheduledAnchorCount: number;
  emptyDayCount: number;
  lastProposalId: string | null;
  fallbackAllowed: boolean;
  applyReason: 'INITIAL_PLAN_CREATION';
  authorizationSource: 'CREATE_WIZARD_SUBMISSION';
  generatedAt: string | null;
  warnings: IcelandSelfDriveWarning[];
  arrangeAuthority?: IcelandSelfDriveArrangeAuthority;
  regionCoverage?: IcelandSelfDriveRegionCoverage;
}

export interface IcelandSelfDriveTripMetadata {
  productLine: 'iceland_self_drive';
  idempotencyKey: string;
  contextVersion: string;
  wizard: IcelandSelfDriveWizardInput;
  drivingSettings: IcelandSelfDriveDrivingSettingsState;
  vehicleDocuments?: Record<string, IcelandSelfDriveVehicleDocumentRecord>;
  routeSkeleton: IcelandSelfDriveRouteSkeleton;
  hardAnchors: IcelandSelfDriveHardAnchor[];
  warnings: IcelandSelfDriveWarning[];
  createdAt: string;
  generationStatus: IcelandSelfDriveGenerationStatus;
  lastEvents?: IcelandSelfDriveDomainEvent[];
  /**
   * @deprecated 用 initialPlan；仍可写，供旧客户端兼容
   */
  initialSchedule?: IcelandSelfDriveInitialScheduleState;
  /** 方案 A'：初始计划状态（与 generationStatus 分离） */
  initialPlan?: IcelandSelfDriveInitialPlanState;
}

export interface IcelandSelfDriveCreateTripResponse {
  tripId: string;
  tripVersion: number;
  contextVersion: string;
  lifecycle: 'PLANNING';
  scenarioId: string;
  generationStatus: IcelandSelfDriveGenerationStatus;
  generatedRoute: IcelandSelfDriveGeneratedRoute;
  completion: IcelandSelfDriveCompletion;
  warnings: IcelandSelfDriveWarning[];
  initialPlan?: IcelandSelfDriveInitialPlanState;
  initialScheduleReady?: boolean;
  scheduledItemCount?: number;
}

export interface IcelandSelfDriveBootstrapResponse {
  tripId: string;
  generationStatus: IcelandSelfDriveGenerationStatus;
  generatedRoute: IcelandSelfDriveGeneratedRoute;
  completion: IcelandSelfDriveCompletion;
  drivingSettingsSummary: {
    items: IcelandSelfDriveSettingsSummaryItem[];
  };
  initialPlan: IcelandSelfDriveInitialPlanState;
  initialScheduleReady: boolean;
  scheduledItemCount: number;
  activeProposalId: string | null;
  warnings: IcelandSelfDriveWarning[];
}

export interface IcelandSelfDriveDraftRecord {
  draftId: string;
  updatedAt: string;
  createdAt: string;
  step: number | null;
  wizard: Record<string, unknown>;
}
