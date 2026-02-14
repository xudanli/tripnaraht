import { DynamicTransportTimeEstimate, DynamicTransportTimeConfig, TransportMode } from '../interfaces/executability-enhancement.interface';
import { DateTime } from 'luxon';
export declare class DynamicTransportTimeService {
    private readonly logger;
    private readonly defaultConfig;
    estimateTransportTime(from: {
        lat: number;
        lng: number;
        name?: string;
    }, to: {
        lat: number;
        lng: number;
        name?: string;
    }, mode: TransportMode, baseTime: number, travelDateTime: DateTime, config?: Partial<DynamicTransportTimeConfig>): Promise<DynamicTransportTimeEstimate>;
    private isRushHour;
    private getWeatherCondition;
    private getRoadCondition;
    private isHoliday;
    private calculateCongestionFactor;
    private calculateWeatherFactor;
    private calculateConfidence;
    private generateRecommendations;
}
