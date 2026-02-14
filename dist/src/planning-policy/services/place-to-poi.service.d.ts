import { Place } from '@prisma/client';
import { Poi } from '../interfaces/poi.interface';
export declare class PlaceToPoiService {
    private extractLatLng;
    convert(place: Place & {
        lat?: number;
        lng?: number;
    }): Poi;
    private convertOpeningHours;
    private parseWeatherSensitivity;
    convertBatch(places: (Place & {
        lat?: number;
        lng?: number;
    })[]): Poi[];
}
export declare function createPlaceQueryWithLatLng(placeIds: number[]): string;
