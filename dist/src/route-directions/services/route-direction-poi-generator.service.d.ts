import { PrismaService } from '../../prisma/prisma.service';
import { ActivityCandidate } from '../../trips/decision/world-model';
import { RouteDirectionRecommendation } from './route-direction-selector.service';
import { RouteDirectionCacheService } from './route-direction-cache.service';
import { POILayerService } from '../../poi/services/poi-layer.service';
import { POIRouteAffinityService } from '../../poi/services/poi-route-affinity.service';
export declare class RouteDirectionPoiGeneratorService {
    private readonly prisma;
    private readonly cacheService?;
    private readonly poiLayerService?;
    private readonly poiAffinityService?;
    private readonly logger;
    constructor(prisma: PrismaService, cacheService?: RouteDirectionCacheService, poiLayerService?: POILayerService, poiAffinityService?: POIRouteAffinityService);
    generateCandidatePois(recommendation: RouteDirectionRecommendation, regions?: string[], bufferMeters?: number): Promise<ActivityCandidate[]>;
    private placeToActivityCandidate;
    private normalizeRating;
    private getMaxRatingForCountry;
    private extractLocation;
    private inferActivityType;
    private inferDuration;
    private inferRiskLevel;
    private inferWeatherSensitivity;
    private inferIndoorOutdoor;
    private extractIntentTags;
}
