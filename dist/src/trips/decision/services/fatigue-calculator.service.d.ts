import { DayProfile, PaceConstraints } from '../interfaces/day-profile.interface';
export declare class FatigueCalculatorService {
    computeFatigueIndex(day: DayProfile, pace: PaceConstraints): number;
    estimateMovingHours(distanceKm: number, ascentM: number): number;
}
