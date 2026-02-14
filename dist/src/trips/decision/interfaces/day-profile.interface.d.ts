import { RouteSegment } from '../shared/world-model.types';
export interface DayProfile {
    dayIndex: number;
    segments: RouteSegment[];
    totalDistanceKm: number;
    totalAscentM: number;
    maxSlopePct: number;
    estMovingHours: number;
    fatigueIndex: number;
}
export interface PaceConstraints {
    maxDailyAscentM: number;
    maxDailyDistanceKm: number;
    maxMovingHours: number;
    rollingAscent3DaysM: number;
}
export interface RollingFatigueIssue {
    startDay: number;
    endDay: number;
    totalAscent: number;
}
