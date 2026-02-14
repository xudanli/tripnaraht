import { RoadStatus, RoadStatusQuery } from '../interfaces/road-status.interface';
export interface RoadStatusAdapter {
    getRoadStatus(query: RoadStatusQuery): Promise<RoadStatus>;
    getRoadStatuses(query: RoadStatusQuery): Promise<RoadStatus[]>;
    getSupportedCountries(): string[];
    getPriority(): number;
    getName(): string;
}
