export interface ValidationResult {
    valid: boolean;
    errors: Array<{
        field: string;
        message: string;
    }>;
    warnings: Array<{
        field: string;
        message: string;
    }>;
}
export declare class GeographicDataValidatorService {
    private readonly logger;
    validateCoordinates(lat: number, lng: number): ValidationResult;
    validateSpatialRange(coordinates: Array<{
        lat: number;
        lng: number;
    }>, targetCountryCode: string): ValidationResult;
    validateCoordinateSystemConsistency(data: Array<{
        lat: number;
        lng: number;
    }>): ValidationResult;
    validateSpatialTopology(features: Array<{
        type: string;
        geometry: any;
    }>): ValidationResult;
    validateCoordinatesBatch(coordinates: Array<{
        lat: number;
        lng: number;
    }>): ValidationResult;
    extractCoordinatesFromPhysicalRealityData(data: any): Array<{
        lat: number;
        lng: number;
    }>;
    private getDecimalPlaces;
    private getCountryBounds;
}
