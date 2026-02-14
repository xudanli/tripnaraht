import { PlanningPolicy } from '../interfaces/planning-policy.interface';
export interface HpState {
    hp: number;
    lastRestAtMin: number;
    lastBreakAtMin: number;
}
export interface FatigueParams {
    walkHpPerMin: number;
    standHpPerMin: number;
    stairsHpPerUnit: number;
    continuousWalkPenalty: number;
}
export declare class HpSimulatorService {
    defaultFatigueParams(policy: PlanningPolicy): FatigueParams;
    applyTravelFatigue(args: {
        policy: PlanningPolicy;
        hpState: HpState;
        travel: {
            walkMin: number;
            stairsCount?: number;
            queueMin?: number;
        };
        nowMin: number;
    }): HpState;
    applyRestRecovery(args: {
        policy: PlanningPolicy;
        hpState: HpState;
        restMin: number;
        nowMin: number;
        restBenefitHp?: number;
    }): HpState;
    restNeeded(policy: PlanningPolicy, hp: number, nowMin: number, hpState: {
        lastRestAtMin: number;
    }): boolean;
}
