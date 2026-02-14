import { MobilityTag } from '../dto/create-trip.dto';
import { PacingConfig } from '../interfaces/pacing-config.interface';
export declare class PacingCalculator {
    static calculateShortestStave(travelers: Array<{
        type: string;
        mobilityTag: MobilityTag;
    }>): PacingConfig;
    private static getProfileConfig;
    private static getDefaultConfig;
    private static getStricterTerrain;
    private static generateDescription;
}
