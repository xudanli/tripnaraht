import { PassRecommendation, RailSegment, ISODate } from '../interfaces/railpass.interface';
import { TravelDayCalculationEngineService } from './travel-day-calculation-engine.service';
interface PassSelectionInput {
    estimatedRailSegments: number;
    crossCountryCount: number;
    isDailyTravel: boolean;
    stayMode: 'city_hopping' | 'stay_extended';
    budgetSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    tripDurationDays: number;
    tripDateRange: {
        start: ISODate;
        end: ISODate;
    };
    residencyCountry: string;
    passFamily: 'EURAIL' | 'INTERRAIL';
    preferences?: {
        preferFlexibility?: boolean;
        preferMobile?: boolean;
        preferFirstClass?: boolean;
    };
}
export declare class PassSelectionEngineService {
    private readonly travelDayCalculator;
    private readonly logger;
    constructor(travelDayCalculator: TravelDayCalculationEngineService);
    recommendPass(input: PassSelectionInput, sampleSegments?: RailSegment[]): Promise<PassRecommendation>;
    private determinePassType;
    private determineValidityType;
    private estimateTravelDays;
    private determineClass;
    private determineMedium;
    private generateExplanation;
}
export {};
