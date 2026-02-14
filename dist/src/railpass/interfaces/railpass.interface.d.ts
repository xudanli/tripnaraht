export type ISODate = string;
export type ISOTime = string;
export type ISODatetime = string;
export type PassFamily = 'EURAIL' | 'INTERRAIL';
export type PassType = 'GLOBAL' | 'ONE_COUNTRY';
export type ValidityType = 'FLEXI' | 'CONTINUOUS';
export type PassClass = 'FIRST' | 'SECOND';
export type PassMedium = 'MOBILE' | 'PAPER';
export type ReservationRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReservationTaskStatus = 'NEEDED' | 'PLANNED' | 'BOOKED' | 'FAILED' | 'FALLBACK_APPLIED';
export type ReservationChannel = 'EURail_Interrail_Platform' | 'Operator_Direct' | 'Third_Party';
export type MandatoryReservationReason = 'NIGHT_TRAIN' | 'HIGH_SPEED' | 'INTERNATIONAL' | 'OPERATOR_POLICY';
export interface RailPassProfile {
    residencyCountry: string;
    passFamily: PassFamily;
    passType: PassType;
    validityType: ValidityType;
    travelDaysTotal?: number;
    homeCountryOutboundUsed: number;
    homeCountryInboundUsed: number;
    class: PassClass;
    mobileOrPaper: PassMedium;
    validityStartDate: ISODate;
    validityEndDate: ISODate;
}
export interface RailSegment {
    segmentId: string;
    fromPlaceId: number;
    toPlaceId: number;
    fromCountryCode: string;
    toCountryCode: string;
    departureTimeWindow?: {
        earliest: ISODatetime;
        latest: ISODatetime;
    };
    arrivalDeadline?: ISODatetime;
    operatorHint?: string;
    isNightTrain: boolean;
    isHighSpeed: boolean;
    isInternational: boolean;
    t_api?: number;
    t_robust?: number;
    departureDate: ISODate;
    crossesMidnight?: boolean;
}
export interface ReservationRequirement {
    required: boolean;
    mandatoryReasonCode?: MandatoryReservationReason;
    feeEstimate?: {
        min: number;
        max: number;
        currency: string;
    };
    quotaRisk: ReservationRiskLevel;
    bookingChannels: ReservationChannel[];
    riskFactors?: string[];
}
export interface ReservationTask {
    taskId: string;
    segmentId: string;
    status: ReservationTaskStatus;
    bookingRef?: string;
    cost?: number;
    failReason?: string;
    fallbackPlanId?: string;
    createdAt: ISODatetime;
    updatedAt: ISODatetime;
    travelDay?: ISODate;
}
export interface FallbackOption {
    optionId: string;
    type: 'SWITCH_TO_SLOW_TRAIN' | 'CHANGE_ROUTE' | 'SHIFT_TIME' | 'SPLIT_SEGMENT' | 'REPLACE_WITH_FLIGHT' | 'REPLACE_WITH_BUS';
    description: string;
    alternativeSegment?: Partial<RailSegment>;
    timeDeltaMinutes?: number;
    costDeltaEur?: number;
}
export interface EligibilityResult {
    eligible: boolean;
    recommendedPassFamily: PassFamily;
    constraints: string[];
    warnings?: string[];
    homeCountryRules?: {
        outboundAllowed: boolean;
        inboundAllowed: boolean;
        outboundUsed: number;
        inboundUsed: number;
        maxAllowed: number;
        explanation: string;
    };
}
export interface PassRecommendation {
    recommendedProfile: RailPassProfile;
    alternatives?: Array<{
        profile: RailPassProfile;
        reason: string;
    }>;
    travelDaySimulation?: {
        estimatedDaysUsed: number;
        daysByDate: Record<ISODate, {
            consumed: boolean;
            segments: string[];
        }>;
    };
    explanation: string;
}
export interface ReservationPlanResult {
    reservationTasks: ReservationTask[];
    violations: Array<{
        code: string;
        severity: 'error' | 'warning';
        message: string;
        segmentId?: string;
        details?: any;
    }>;
    fallbackOptions: FallbackOption[];
    totalFeeEstimate?: {
        min: number;
        max: number;
        currency: string;
    };
    overallRisk: ReservationRiskLevel;
}
export interface TravelDayCalculationResult {
    totalDaysUsed: number;
    daysByDate: Record<ISODate, {
        consumed: boolean;
        segments: string[];
        crossesMidnight?: boolean;
        explanation: string;
    }>;
    remainingDays?: number;
    violations?: Array<{
        date: ISODate;
        message: string;
    }>;
}
export interface ComplianceValidationResult {
    valid: boolean;
    violations: Array<{
        code: string;
        severity: 'error' | 'warning';
        message: string;
        segmentId?: string;
        details?: any;
    }>;
    warnings: Array<{
        code: string;
        severity: 'error' | 'warning';
        message: string;
        segmentId?: string;
        details?: any;
    }>;
}
