import { PhysicalMetadata } from '../interfaces/physical-metadata.interface';
export interface GPXPoint {
    lat: number;
    lng: number;
    elevation?: number;
    time?: Date;
}
export interface GPXAnalysis {
    totalDistance: number;
    elevationGain: number;
    elevationLoss: number;
    maxElevation: number;
    minElevation: number;
    averageSlope: number;
    equivalentDistance: number;
    fatigueScore: number;
}
export declare class GPXFatigueCalculator {
    static analyzeGPX(points: GPXPoint[]): GPXAnalysis;
    static generateFatigueMetadata(analysis: GPXAnalysis): Partial<PhysicalMetadata>;
    private static haversineDistance;
    private static toRadians;
    static mapToFatigueLevel(equivalentDistance: number): {
        level: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
        description: string;
    };
}
