import { PoiProvider } from './poi.provider.interface';
import { PoiCandidate } from '../../assist/dto/action.dto';
export declare class GooglePoiProvider implements PoiProvider {
    private readonly logger;
    private readonly apiKey;
    private readonly enabled;
    constructor();
    textSearch(args: {
        query: string;
        lat: number;
        lng: number;
        radiusM?: number;
        language?: string;
        types?: string[];
    }): Promise<PoiCandidate[]>;
    nearbySearch?(args: {
        lat: number;
        lng: number;
        radiusM?: number;
        type?: string;
        keyword?: string;
        language?: string;
    }): Promise<PoiCandidate[]>;
    private calculateDistance;
    private toRad;
    private calculateMatchScore;
}
