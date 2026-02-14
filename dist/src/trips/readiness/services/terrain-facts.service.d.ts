import { DEMElevationService } from '../../dem/services/dem-elevation.service';
import { DEMEffortMetadataService } from '../../dem/services/dem-effort-metadata.service';
import { TerrainFacts, RouteSegmentId } from '../types/terrain-facts.types';
export interface LineString {
    type: 'LineString';
    coordinates: Array<[number, number]>;
}
export declare class TerrainFactsService {
    private readonly demElevationService;
    private readonly demEffortMetadataService;
    private readonly logger;
    constructor(demElevationService: DEMElevationService, demEffortMetadataService: DEMEffortMetadataService);
    getTerrainFactsForSegment(segmentId: RouteSegmentId, lineString: LineString, stepM?: number): Promise<TerrainFacts>;
    private profileLine;
    private computeTerrainStats;
    private inferSource;
    private generateProfileId;
    private mapEffortLevel;
    private calculateDistance;
    private toRadians;
}
