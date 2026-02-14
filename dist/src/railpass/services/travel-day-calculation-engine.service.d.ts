import { RailSegment, RailPassProfile, TravelDayCalculationResult } from '../interfaces/railpass.interface';
interface CalculateTravelDaysInput {
    segments: RailSegment[];
    passProfile: RailPassProfile;
}
export declare class TravelDayCalculationEngineService {
    private readonly logger;
    calculateTravelDays(input: CalculateTravelDaysInput): TravelDayCalculationResult;
    private generateDayExplanation;
    private addDays;
    simulateTravelDays(args: {
        segments: RailSegment[];
        passProfile: RailPassProfile;
    }): TravelDayCalculationResult;
}
export {};
