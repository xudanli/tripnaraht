/**
 * 自驾准备 checklist 报告契约
 * @see SELF_DRIVE_READINESS_REPORT.md
 */

export type SelfDriveReadinessCategoryCode =
  | 'DRIVING_ELIGIBILITY'
  | 'VEHICLE_RENTAL'
  | 'ITINERARY_ANCHORS'
  | 'COMPLIANCE_KNOWLEDGE';

export type SelfDriveItemStatus =
  | 'COMPLETED'
  | 'TO_PREPARE'
  | 'TO_CONFIRM'
  | 'MUST_RESOLVE'
  | 'BLOCKED';

export type DrivingEligibilityItemType =
  | 'LICENSE_VALIDITY'
  | 'IDP_OR_TRANSLATION'
  | 'PRIMARY_DRIVER_AGE'
  | 'ADDITIONAL_DRIVERS'
  | 'CHILD_SEAT';

export type VehicleRentalItemType =
  | 'RENTAL_ORDER'
  | 'VEHICLE_MODEL'
  | 'PICKUP_DROPOFF'
  | 'WINTER_TIRES'
  | 'INSURANCE'
  | 'EMERGENCY_CONTACT';

export type ItineraryAnchorItemType =
  | 'ACCOMMODATION_ORDERS'
  | 'ACTIVITY_ORDERS'
  | 'MEETING_TIME'
  | 'CHECKIN_TIME'
  | 'NIGHT_SELF_CHECKIN';

export type ComplianceKnowledgeItemType =
  | 'SPEED_LIMIT'
  | 'LIGHTS_ALWAYS_ON'
  | 'NO_HANDHELD_PHONE'
  | 'NO_OFFROAD'
  | 'SINGLE_LANE_BRIDGE'
  | 'DUI_RULE'
  | 'ROADSIDE_PARKING'
  | 'ACCIDENT_HANDLING'
  /** 中国：城市限行 / 外牌 */
  | 'CITY_DRIVING_LIMIT'
  /** 中国：高速 ETC */
  | 'ETC_EXPRESSWAY'
  /** 中国：高原控程与高反节奏 */
  | 'HIGH_ALTITUDE_PACE'
  /** 中国：涉藏检查站 / 证件 */
  | 'CHECKPOINT_DOCUMENTS'
  /** 中国：热门景区分时预约 */
  | 'TIMED_ENTRY_BOOKING';

export type SelfDriveItemType =
  | DrivingEligibilityItemType
  | VehicleRentalItemType
  | ItineraryAnchorItemType
  | ComplianceKnowledgeItemType;

export interface SelfDriveStatusCounts {
  completed: number;
  toPrepare: number;
  toConfirm: number;
  mustResolve: number;
  blocked: number;
}

export interface SelfDriveStatusCountsWithRemaining extends SelfDriveStatusCounts {
  remaining: number;
}

export interface SelfDriveTripSummary {
  title: string;
  coverImageUrl: string | null;
  dateRangeLabelZh: string;
  startDate: string;
  endDate: string;
  travelerCount: number;
  travelerLabelZh: string;
  routeLabelZh: string;
  distanceSummaryZh: string | null;
}

export interface SelfDriveReadinessItem {
  id: string;
  type: SelfDriveItemType;
  titleZh: string;
  descriptionZh: string | null;
  status: SelfDriveItemStatus;
  statusLabelZh: string;
  iconKey: string;
  isTappable: boolean;
  deepLink?: string | null;
  actionCode?: string | null;
  /** 合规项 */
  contentUrl?: string | null;
}

export interface SelfDriveCategoryTip {
  style: 'TIP' | 'WARNING' | 'INFO';
  iconKey: string;
  textZh: string;
}

export interface SelfDriveCategorySummary {
  code: SelfDriveReadinessCategoryCode;
  order: number;
  titleZh: string;
  descriptionZh: string;
  iconKey: string;
  aggregateStatus: SelfDriveItemStatus;
  statusSummaryZh: string;
  itemCounts: SelfDriveStatusCounts;
}

export interface SelfDriveCategoryDetail {
  code: SelfDriveReadinessCategoryCode;
  order: number;
  titleZh: string;
  aggregateStatus: SelfDriveItemStatus;
  summaryTitleZh: string;
  summaryDetailZh: string;
  iconKey: string;
}

export interface SelfDriveCriticalAlert {
  id: string;
  severity: 'MUST_RESOLVE';
  titleZh: string;
  messageZh: string;
  categoryCode: SelfDriveReadinessCategoryCode;
  itemId: string;
  deepLink?: string | null;
  actionCode?: string | null;
}

export interface SelfDrivePrimaryCta {
  labelZh: string;
  action: 'OPEN_FIRST_INCOMPLETE_CATEGORY' | 'OPEN_CATEGORY';
  categoryCode: SelfDriveReadinessCategoryCode;
}

/** GET ?view=self_drive_report */
export interface SelfDriveReadinessReport {
  tripId: string;
  contextVersion: number;
  generatedAt: string;
  tripSummary: SelfDriveTripSummary;
  score: number;
  state: string;
  displayLabelZh: string;
  headlineZh: string;
  mustResolveSummaryZh: string;
  counts: SelfDriveStatusCountsWithRemaining;
  categories: SelfDriveCategorySummary[];
  criticalAlerts: SelfDriveCriticalAlert[];
  primaryCta: SelfDrivePrimaryCta;
  /** P0：内嵌全部 items，便于详情免二次请求；P1 可改懒加载 */
  categoryItems?: Record<SelfDriveReadinessCategoryCode, SelfDriveReadinessItem[]>;
  categoryTips?: Record<SelfDriveReadinessCategoryCode, SelfDriveCategoryTip[]>;
}

/** GET .../categories/:categoryCode */
export interface SelfDriveCategoryDetailResponse {
  tripId: string;
  contextVersion: number;
  category: SelfDriveCategoryDetail;
  items: SelfDriveReadinessItem[];
  tips: SelfDriveCategoryTip[];
}

/** POST .../compliance/:itemId/read */
export interface SelfDriveComplianceReadResponse {
  itemId: string;
  status: 'COMPLETED';
  categoryAggregateStatus: SelfDriveItemStatus;
  score: number;
  contextVersion: number;
}

/** 投影输入（服务层采集） */
export interface SelfDriveReadinessFactInput {
  tripId: string;
  contextVersion: number;
  generatedAt?: string;
  isSelfDrive: boolean;
  countryCode: string | null;
  productLine?: string | null;

  tripSummary: SelfDriveTripSummary;

  /** 五维快照 score/state — 同源壳层 */
  overallScore: number;
  overallState: string;
  overallDisplayLabelZh: string;

  driving: {
    licenseConfirmed?: boolean;
    idpOrTranslationConfirmed?: boolean;
    primaryDriverAge?: number | null;
    rentalMinAge?: number;
    additionalDriversRegistered?: boolean | null;
    driverCount?: number | null;
    hasChildren?: boolean;
    childSeatPrepared?: boolean | null;
  };

  rental: {
    hasRentalOrder?: boolean;
    vehicleModelConfirmed?: boolean;
    pickupDropoffConfirmed?: boolean;
    winterTiresRequired?: boolean;
    winterTiresConfirmed?: boolean | null;
    insuranceConfirmed?: boolean;
    emergencyPhone?: string | null;
  };

  anchors: {
    expectedNightCount: number;
    bookedNightCount: number;
    needBookingNightCount: number;
    activityTotal: number;
    activityBooked: number;
    meetingTimeConfirmed?: boolean;
    checkinTimeConfirmed?: boolean;
    nightSelfCheckinConfirmed?: boolean | null;
  };

  /** itemId → ISO readAt */
  complianceReads: Record<string, string>;
}
