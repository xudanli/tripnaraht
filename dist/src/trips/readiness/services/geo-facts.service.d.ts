import { GeoFactsRiverService, RiverFeatures, Route } from './geo-facts-river.service';
import { GeoFactsMountainService, MountainFeatures } from './geo-facts-mountain.service';
import { GeoFactsRoadService, RoadFeatures } from './geo-facts-road.service';
import { GeoFactsCoastlineService, CoastlineFeatures } from './geo-facts-coastline.service';
import { GeoFactsPortService, PortFeatures } from './geo-facts-port.service';
import { GeoFactsAirlineService, AirlineFeatures } from './geo-facts-airline.service';
import { GeoFactsPOIService, POIFeatures } from './geo-facts-poi.service';
import { GeoFactsCacheService } from './geo-facts-cache.service';
import { PhysicalRealityRetrievalService, PhysicalRealityData } from './physical-reality-retrieval.service';
export interface GeoFeatures {
    rivers: RiverFeatures;
    mountains: MountainFeatures;
    roads: RoadFeatures;
    coastlines: CoastlineFeatures;
    ports: PortFeatures;
    airlines: AirlineFeatures;
    pois: POIFeatures;
    physicalReality?: PhysicalRealityData;
    terrainComplexity: number;
    riskScore: number;
    accessibilityScore: number;
}
export declare class GeoFactsService {
    private readonly riverService;
    private readonly mountainService;
    private readonly roadService;
    private readonly coastlineService;
    private readonly portService;
    private readonly airlineService;
    private readonly poiService;
    private readonly cacheService?;
    private readonly physicalRealityService?;
    private readonly logger;
    constructor(riverService: GeoFactsRiverService, mountainService: GeoFactsMountainService, roadService: GeoFactsRoadService, coastlineService: GeoFactsCoastlineService, portService: GeoFactsPortService, airlineService: GeoFactsAirlineService, poiService: GeoFactsPOIService, cacheService?: GeoFactsCacheService, physicalRealityService?: PhysicalRealityRetrievalService);
    getGeoFeaturesForPoint(lat: number, lng: number, options?: {
        nearRiverThresholdM?: number;
        densityBufferKm?: number;
        nearWaterThresholdM?: number;
        nearRoadThresholdM?: number;
        nearCoastlineThresholdKm?: number;
        coastalAreaThresholdKm?: number;
        nearPortThresholdKm?: number;
        nearAirportThresholdKm?: number;
        poiRadiusKm?: number;
        pickupLimit?: number;
        useCache?: boolean;
        month?: number;
    }): Promise<GeoFeatures>;
    getGeoFeaturesForRoute(route: Route, options?: {
        nearRiverThresholdM?: number;
        densityBufferKm?: number;
        nearRoadThresholdM?: number;
        nearCoastlineThresholdKm?: number;
        coastalAreaThresholdKm?: number;
        nearPortThresholdKm?: number;
        nearAirportThresholdKm?: number;
        poiRadiusKm?: number;
        pickupLimit?: number;
    }): Promise<GeoFeatures>;
    private calculateTerrainComplexity;
    private identifyRegion;
    private calculateRiskScore;
    private calculateAccessibilityScore;
}
