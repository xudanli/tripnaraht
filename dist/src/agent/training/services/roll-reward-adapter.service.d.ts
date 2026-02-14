import { ConfigService } from '@nestjs/config';
import { QualityScoreResult } from '../interfaces/enhancement.interface';
import { RollClientService } from './roll-client.service';
export declare class RollRewardAdapterService {
    private readonly configService;
    private readonly rollClient?;
    private readonly logger;
    private readonly enabled;
    constructor(configService: ConfigService, rollClient?: RollClientService);
    computeReward(plan: any, userRequest: string, evidence: any[], decisionLog: any[]): Promise<{
        reward: number;
        rawReward: number;
        rewardBreakdown: any[];
        success: boolean;
    }>;
    convertToQualityScoreResult(rewardResult: {
        reward: number;
        rawReward: number;
        rewardBreakdown: any[];
    }, llmJudgeScore?: number, rmScore?: number): QualityScoreResult;
}
