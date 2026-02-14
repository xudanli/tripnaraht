import { Poi } from './poi.interface';
import { PlanningPolicy } from './planning-policy.interface';
import { DayOfWeek } from '../utils/time-utils';
export interface PoiRankingFeatures {
    poiId: string;
    baseInterestScore: number;
    feasibleNow: boolean;
    openWindowNextMin: number;
    lastEntrySlack: number;
    accessibilityOK: boolean;
    expectedWalkPain: number;
    restSupportDensity: number;
    finalScore: number;
    infeasibleReason?: string;
}
export interface RankingRequest {
    pois: Poi[];
    policy: PlanningPolicy;
    currentTimeMin: number;
    dayOfWeek: DayOfWeek;
    dateISO?: string;
    currentLocation?: {
        lat: number;
        lng: number;
    };
    restStops?: Array<{
        lat: number;
        lng: number;
    }>;
    baseInterestScores?: Map<string, number>;
}
