import { ConfigService } from '@nestjs/config';
import { RollClientService } from './roll-client.service';
export declare class RollBatchProcessorService {
    private readonly configService;
    private readonly rollClient;
    private readonly logger;
    private readonly batchSize;
    private readonly batchTimeout;
    private actorBatchQueue;
    private rewardBatchQueue;
    private policyBatchQueue;
    private actorBatchTimer;
    private rewardBatchTimer;
    private policyBatchTimer;
    constructor(configService: ConfigService, rollClient: RollClientService);
    batchGenerateTrajectory(request: any): Promise<{
        success: boolean;
        trajectory_id?: string;
        trajectory?: any;
        error?: string;
    }>;
    batchComputeReward(trajectory: any, rewardConfig?: any): Promise<{
        success: boolean;
        reward?: number;
        error?: string;
    }>;
    batchPredict(state: any): Promise<{
        success: boolean;
        action?: string;
        confidence?: number;
        error?: string;
    }>;
    private processActorBatch;
    private processRewardBatch;
    private processPolicyBatch;
}
