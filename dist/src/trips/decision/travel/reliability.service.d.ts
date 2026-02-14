import { TravelLeg } from '../world-model';
export interface ReliableTravelLeg extends TravelLeg {
    reliability: number;
    worstCaseDurationMin: number;
    confidence: 'high' | 'medium' | 'low';
}
export interface ReliabilityConfig {
    bufferByReliability: {
        high: number;
        medium: number;
        low: number;
    };
    fixedBufferMin: number;
}
export declare const DEFAULT_RELIABILITY_CONFIG: ReliabilityConfig;
export declare class TravelReliabilityService {
    enhanceReliability(leg: TravelLeg, config?: ReliabilityConfig): ReliableTravelLeg;
    private assessReliability;
    private reliabilityToConfidence;
    private calculateWorstCase;
    getRecommendedBuffer(leg: TravelLeg, config?: ReliabilityConfig): number;
}
