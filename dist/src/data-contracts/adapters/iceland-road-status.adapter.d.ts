import { ConfigService } from '@nestjs/config';
import { RoadStatusAdapter } from './road-status.adapter.interface';
import { RoadStatus, RoadStatusQuery } from '../interfaces/road-status.interface';
import { BaseAdapter } from './base.adapter';
export declare class IcelandRoadStatusAdapter extends BaseAdapter implements RoadStatusAdapter {
    private configService?;
    private readonly baseUrl;
    private readonly datexUrl;
    constructor(configService?: ConfigService);
    getRoadStatus(query: RoadStatusQuery): Promise<RoadStatus>;
    getRoadStatuses(query: RoadStatusQuery): Promise<RoadStatus[]>;
    getSupportedCountries(): string[];
    getPriority(): number;
    getName(): string;
    private mapToRoadStatus;
    private getFRoadInfo;
    private getRiverCrossingInfo;
}
