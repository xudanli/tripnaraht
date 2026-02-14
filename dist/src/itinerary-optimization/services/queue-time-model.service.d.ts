import { QueueTimeEstimate, QueueTimeModelConfig, POIType } from '../interfaces/executability-enhancement.interface';
import { DateTime } from 'luxon';
export declare class QueueTimeModelService {
    private readonly logger;
    private readonly defaultConfig;
    estimateQueueTime(poiId: string, poiName: string, poiType: POIType, visitDateTime: DateTime, config?: Partial<QueueTimeModelConfig>): Promise<QueueTimeEstimate>;
    private getBaseWaitTime;
    private determineTimePeriod;
    private isPeakSeason;
    private isHoliday;
    private getTimeOfDayMultiplier;
    private calculateConfidence;
    private generateRecommendations;
}
