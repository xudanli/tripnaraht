import { RoadStatusAdapter } from './road-status.adapter.interface';
import { RoadStatus, RoadStatusQuery } from '../interfaces/road-status.interface';
export declare class DefaultRoadStatusAdapter implements RoadStatusAdapter {
    private readonly logger;
    getRoadStatus(query: RoadStatusQuery): Promise<RoadStatus>;
    getRoadStatuses(query: RoadStatusQuery): Promise<RoadStatus[]>;
    getSupportedCountries(): string[];
    getPriority(): number;
    getName(): string;
}
