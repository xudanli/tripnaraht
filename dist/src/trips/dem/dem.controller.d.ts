import { DEMElevationService } from './services/dem-elevation.service';
import { DEMEffortMetadataService } from './services/dem-effort-metadata.service';
export declare class DemController {
    private readonly demElevationService;
    private readonly demEffortMetadataService;
    constructor(demElevationService: DEMElevationService, demEffortMetadataService: DEMEffortMetadataService);
    getElevation(lat: string, lng: string): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getProfile(body: {
        polyline: Array<{
            lat: number;
            lng: number;
        }>;
        samples?: number;
        activityType?: 'walking' | 'driving' | 'cycling';
    }): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getTripTerrain(tripId: string, samples?: string): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
}
