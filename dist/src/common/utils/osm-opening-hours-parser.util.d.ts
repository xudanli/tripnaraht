import { PlaceMetadata } from '../../places/interfaces/place-metadata.interface';
export declare class OsmOpeningHoursParser {
    static parse(osmHours: string): PlaceMetadata['openingHours'] | undefined;
    private static parsePeriod;
    private static parseDays;
    private static parseTimeRange;
}
