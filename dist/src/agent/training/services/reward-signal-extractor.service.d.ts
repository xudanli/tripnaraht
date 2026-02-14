import { ApprovalStatus } from '@prisma/client';
import { RewardSignal, ExecutionResult } from '../interfaces/trajectory.interface';
import { TripNARAApprovalSignals, GatedRewardMetrics } from '../interfaces/product.interface';
export interface TripNARARewardSignal extends RewardSignal {
    source: 'SYSTEM' | 'USER' | 'HYBRID';
    is_gate_signal: boolean;
}
export declare class RewardSignalExtractorService {
    private readonly logger;
    extractFromTripNARAApproval(signals: TripNARAApprovalSignals): TripNARARewardSignal[];
    extractFromGateMetrics(metrics: GatedRewardMetrics): TripNARARewardSignal[];
    calculateTripNARATotalReward(signals: TripNARARewardSignal[]): {
        total_reward: number;
        gate_passed: boolean;
        trainable: boolean;
    };
    extractFromApproval(approval: ApprovalStatus): RewardSignal[];
    extractFromExecution(executionResult: ExecutionResult): RewardSignal[];
    extractFromPlanCommit(success: boolean): RewardSignal[];
    extractFromAlignmentScore(alignmentScore: number): RewardSignal[];
    calculateTotalReward(signals: RewardSignal[]): number;
    mergeSignals(...signalArrays: RewardSignal[][]): RewardSignal[];
}
