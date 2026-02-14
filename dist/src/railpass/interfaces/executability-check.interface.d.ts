export type ISODate = string;
export type SegmentCoverageStatus = 'COVERED' | 'NOT_COVERED' | 'UNKNOWN';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export interface SegmentCardInfo {
    segmentId: string;
    departureTime: string;
    fromPlace: {
        name: string;
        countryCode: string;
    };
    toPlace: {
        name: string;
        countryCode: string;
    };
    coverage: SegmentCoverageStatus;
    travelDayInfo?: {
        consumed: boolean;
        daysConsumed: number;
        explanation: string;
    };
    reservationInfo: {
        status: 'REQUIRED' | 'OPTIONAL' | 'UNKNOWN' | 'NOT_REQUIRED';
        mandatoryReason?: string;
        feeEstimate?: {
            min: number;
            max: number;
            currency: string;
        };
        riskLevel: RiskLevel;
        suggestions: string[];
    };
    riskLevel: RiskLevel;
    keySuggestions: string[];
    details?: {
        ruleExplanation?: string[];
        riskDetails?: string[];
        mobilePassReminders?: string[];
        peakSeasonWarnings?: string[];
    };
    violations?: Array<{
        code: string;
        severity: 'error' | 'warning';
        message: string;
    }>;
}
export interface ExecutabilityCheckOverview {
    executableCount: number;
    needConfirmationCount: number;
    highRiskCount: number;
    estimatedTravelDaysUsed?: {
        total: number;
        remaining?: number;
        explanation: string;
    };
    segments: SegmentCardInfo[];
    summarySuggestions: string[];
    hasIncompleteProfile: boolean;
    missingInfo?: string[];
}
export interface HighRiskAlert {
    type: 'HOME_COUNTRY_LIMIT' | 'TRAVEL_DAY_OVERUSE' | 'NIGHT_TRAIN_2_DAYS' | 'RESERVATION_MANDATORY' | 'RESERVATION_QUOTA_HIGH' | 'PASS_VALIDITY_EXCEEDED' | 'MOBILE_PASS_OFFLINE_RISK';
    affectedSegmentIds: string[];
    explanation: string;
    alternatives: Array<{
        id: string;
        title: string;
        description: string;
        impact?: {
            timeDelta?: number;
            costDelta?: number;
            travelDaysDelta?: number;
        };
    }>;
    severity: 'error' | 'warning';
}
export interface RegeneratePlanRequest {
    tripId: string;
    strategy: 'MORE_STABLE' | 'MORE_ECONOMICAL' | 'MORE_AFFORDABLE' | 'CUSTOM';
    customParams?: {
        avoidMandatoryReservations?: boolean;
        minimizeTravelDays?: boolean;
        maxReservationFee?: number;
    };
}
