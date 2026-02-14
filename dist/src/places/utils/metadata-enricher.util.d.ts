import { PlaceMetadata } from '../interfaces/place-metadata.interface';
export declare class MetadataEnricher {
    static enrich(metadata: PlaceMetadata | any): PlaceMetadata;
    private static extractOsmOpeningHours;
    static merge(oldMetadata: PlaceMetadata | any, newMetadata: PlaceMetadata | any): PlaceMetadata;
}
