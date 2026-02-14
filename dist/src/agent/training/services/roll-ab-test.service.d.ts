import { ConfigService } from '@nestjs/config';
import { ABTestManagerService } from './ab-test-manager.service';
import { RollClientService } from './roll-client.service';
import { RollPolicyAdapterService } from './roll-policy-adapter.service';
import { RollRewardAdapterService } from './roll-reward-adapter.service';
import { RollTrajectoryAdapterService } from './roll-trajectory-adapter.service';
export interface RollABTestVariant {
    variant_id: string;
    name: string;
    roll_enabled: boolean;
    roll_config?: {
        use_policy_worker?: boolean;
        use_reward_worker?: boolean;
        use_trajectory_worker?: boolean;
        worker_config?: Record<string, any>;
    };
    traffic_percentage: number;
}
export declare class RollABTestService {
    private readonly configService;
    private readonly abTestManager;
    private readonly rollClient?;
    private readonly rollPolicyAdapter?;
    private readonly rollRewardAdapter?;
    private readonly rollTrajectoryAdapter?;
    private readonly logger;
    private readonly enabled;
    constructor(configService: ConfigService, abTestManager: ABTestManagerService, rollClient?: RollClientService, rollPolicyAdapter?: RollPolicyAdapterService, rollRewardAdapter?: RollRewardAdapterService, rollTrajectoryAdapter?: RollTrajectoryAdapterService);
    createRollExperiment(name: string, description: string, variants: RollABTestVariant[], successMetrics: string[]): Promise<{
        experimentId: string;
        success: boolean;
    }>;
    shouldUseRoll(experimentId: string, requestId: string, userId?: string): Promise<{
        useRoll: boolean;
        variantId?: string;
        rollConfig?: Record<string, any>;
    }>;
    predictWithRollABTest(experimentId: string, request: any, requestId: string, userId?: string): Promise<{
        action: string;
        confidence: number;
        variantId?: string;
        useRoll: boolean;
    }>;
    computeRewardWithRollABTest(experimentId: string, trajectory: any, requestId: string, userId?: string, rewardConfig?: any): Promise<{
        reward: number;
        variantId?: string;
        useRoll: boolean;
    }>;
    generateTrajectoryWithRollABTest(experimentId: string, data: any, requestId: string, userId?: string): Promise<{
        trajectoryId?: string;
        trajectory?: any;
        variantId?: string;
        useRoll: boolean;
    }>;
    analyzeRollResults(experimentId: string, variantMetrics: Array<{
        variant_id: string;
        sample_size: number;
        success_count: number;
        total_reward: number;
        total_latency_ms: number;
        error_count: number;
        roll_enabled?: boolean;
    }>): Promise<{
        experimentId: string;
        rollVsBaseline: {
            roll_variant: any;
            baseline_variant: any;
            improvement: {
                success_rate: number;
                avg_reward: number;
                avg_latency: number;
            };
        };
        recommendation: string;
    }>;
}
