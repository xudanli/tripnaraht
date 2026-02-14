import { WorldModelContext } from './world-model.types';
import { TripPlan } from '../plan-model';
import { StrategyMode, StrategyParams } from '../strategy/types/strategy-mode.types';
import { PlanningPhase } from '../orchestration/langgraph-orchestrator.interface';
import { TravelReadinessResult } from '../readiness/types/readiness-checklist.types';
export interface DecisionLogEntry {
    timestamp: string;
    agent: string;
    action: 'ALLOW' | 'ADJUST' | 'REJECT' | 'REPLACE';
    reasonCode: string;
    explanation: string;
    payload?: Record<string, any>;
}
export interface TripState {
    user_intent: string;
    strategy_mode?: StrategyMode;
    strategy_params?: StrategyParams;
    world: WorldModelContext;
    planning_phase: PlanningPhase;
    decision_log: DecisionLogEntry[];
    rejection_log: string[];
    plan: TripPlan | null;
    readiness?: TravelReadinessResult;
    metadata?: Record<string, any>;
}
export declare function createInitialTripState(userIntent: string, world: WorldModelContext, strategyMode?: StrategyMode): TripState;
export declare function canTransitionToPhase(currentPhase: PlanningPhase, targetPhase: PlanningPhase): boolean;
