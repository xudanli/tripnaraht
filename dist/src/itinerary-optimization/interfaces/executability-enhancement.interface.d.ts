export type POIType = 'ATTRACTION' | 'RESTAURANT' | 'MUSEUM' | 'THEME_PARK' | 'SHOPPING' | 'ENTERTAINMENT' | 'OTHER';
export type TimePeriod = 'PEAK' | 'OFF_PEAK' | 'SHOULDER';
export interface QueueTimeEstimate {
    poiId: string;
    poiName: string;
    poiType: POIType;
    baseWaitTime: number;
    estimatedWaitTime: number;
    peakMultiplier: number;
    seasonMultiplier: number;
    dayOfWeekMultiplier: number;
    timeOfDayMultiplier: number;
    confidence: number;
    factors: {
        isPeakHour: boolean;
        isPeakSeason: boolean;
        isWeekend: boolean;
        isHoliday: boolean;
    };
    recommendations?: string[];
}
export interface QueueTimeModelConfig {
    poiId: string;
    poiType: POIType;
    baseWaitTime: number;
    peakMultiplier?: number;
    seasonMultiplier?: number;
    dayOfWeekMultiplier?: Record<number, number>;
    timeOfDayMultiplier?: Record<string, number>;
    popularityScore?: number;
}
export type TransportMode = 'WALK' | 'SUBWAY' | 'BUS' | 'TAXI' | 'DRIVE' | 'BIKE';
export interface DynamicTransportTimeEstimate {
    from: {
        lat: number;
        lng: number;
        name?: string;
    };
    to: {
        lat: number;
        lng: number;
        name?: string;
    };
    mode: TransportMode;
    baseTime: number;
    estimatedTime: number;
    congestionFactor: number;
    weatherFactor: number;
    bufferTime: number;
    confidence: number;
    factors: {
        isRushHour: boolean;
        weatherCondition?: 'CLEAR' | 'RAIN' | 'SNOW' | 'FOG' | 'STORM';
        roadCondition?: 'NORMAL' | 'CONGESTED' | 'SEVERELY_CONGESTED';
        isHoliday: boolean;
    };
    recommendations?: string[];
}
export interface DynamicTransportTimeConfig {
    baseTime: number;
    mode: TransportMode;
    congestionFactor?: number;
    weatherFactor?: number;
    bufferPercentage?: number;
    rushHourMultiplier?: number;
}
export interface UserFatigueState {
    currentHP: number;
    maxHP: number;
    accumulatedFatigue: number;
    timeSinceLastRest: number;
    activityIntensity: 'LOW' | 'MEDIUM' | 'HIGH';
    userProfile?: {
        fitnessLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
        age?: number;
        hasHealthIssues?: boolean;
    };
}
export interface RestTimeRecommendation {
    recommendedRestTime: number;
    minimumRestTime: number;
    optimalRestTime: number;
    hpRecovery: number;
    fatigueReduction: number;
    confidence: number;
    factors: {
        currentFatigueLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        timeSinceLastRest: number;
        activityIntensity: 'LOW' | 'MEDIUM' | 'HIGH';
        userFitnessLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    restType: 'SHORT_BREAK' | 'MEAL_BREAK' | 'LONG_REST' | 'OVERNIGHT';
    recommendations?: string[];
}
export interface RestTimeModelConfig {
    baseRestTime: number;
    shortBreakTime: number;
    mealBreakTime: number;
    longRestTime: number;
    hpRecoveryRate: number;
    fatigueReductionRate: number;
}
export interface EnhancedExecutabilityResult {
    itineraryId?: string;
    dayNumber?: number;
    items: Array<{
        itemId: string;
        itemName: string;
        queueTimeEstimate?: QueueTimeEstimate;
        transportTimeEstimate?: DynamicTransportTimeEstimate;
        restTimeRecommendation?: RestTimeRecommendation;
        totalEstimatedTime: number;
        feasibility: 'FEASIBLE' | 'MARGINAL' | 'INFEASIBLE';
        issues: string[];
        suggestions: string[];
    }>;
    overallFeasibility: 'FEASIBLE' | 'MARGINAL' | 'INFEASIBLE';
    overallIssues: string[];
    overallSuggestions: string[];
    timeBufferAnalysis: {
        totalPlannedTime: number;
        totalEstimatedTime: number;
        bufferTime: number;
        bufferPercentage: number;
        isSufficient: boolean;
    };
}
