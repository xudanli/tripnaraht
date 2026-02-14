import type { PoiCandidate } from '../../assist/dto/action.dto';
export type { PoiCandidate };
export interface PoiProvider {
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
}
