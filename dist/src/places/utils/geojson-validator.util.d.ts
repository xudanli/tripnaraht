export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export declare function validateGeoJSON(geojson: any): ValidationResult;
export declare function validateNaturePoiProperties(properties: any): ValidationResult;
