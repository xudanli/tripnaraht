export type StrategyMode = 'SURVIVAL' | 'COMFORT' | 'PHOTOGRAPHY' | 'BUDGET' | 'TIME' | 'ADVENTURE';
export interface StrategyParams {
    mode: StrategyMode;
    weights: {
        abu: number;
        drDre: number;
        neptune: number;
        cost: number;
        experience: number;
        timeEfficiency: number;
    };
    metadata?: Record<string, any>;
}
export declare const STRATEGY_MODE_WEIGHTS: Record<StrategyMode, StrategyParams['weights']>;
export declare function extractStrategyModeFromKeywords(keywords: string[]): StrategyMode | null;
export declare function createStrategyParams(mode: StrategyMode, customWeights?: Partial<StrategyParams['weights']>): StrategyParams;
