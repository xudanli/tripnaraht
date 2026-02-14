import { ConfigService } from '@nestjs/config';
import { TrajectoryCollectionData } from '../interfaces/trajectory.interface';
import { RollClientService } from './roll-client.service';
export declare class RollTrajectoryAdapterService {
    private readonly configService;
    private readonly rollClient?;
    private readonly logger;
    private readonly enabled;
    constructor(configService: ConfigService, rollClient?: RollClientService);
    generateTrajectory(data: TrajectoryCollectionData): Promise<{
        trajectoryId: string;
        trajectory: any;
        success: boolean;
    }>;
    private extractUserRequest;
}
