import { PrismaService } from '../../prisma/prisma.service';
import { DataQualityAlertService } from './data-quality-alert.service';
import { DEMResolutionCacheService } from './dem-resolution-cache.service';
export declare class GeographicDataQualityMonitoringService {
    private readonly prisma;
    private readonly alertService;
    private readonly resolutionCache;
    private readonly logger;
    private readonly testCoordinates;
    constructor(prisma: PrismaService, alertService: DataQualityAlertService, resolutionCache: DEMResolutionCacheService);
    runGeographicMonitoringTask(): Promise<void>;
    private monitorDEMData;
    private monitorGeographicFeatures;
    private assessDEMSpatialAccuracy;
    private assessDEMCoordinateSystemConsistency;
    private assessDEMSpatialCompleteness;
    private monitorDEMQueryPerformance;
    private assessFeatureSpatialCompleteness;
    private assessFeatureCoordinateSystemConsistency;
    private monitorFeatureQueryPerformance;
    private checkGeographicAlertRules;
    private upsertGeographicMonitor;
    private queryDEMElevation;
    private getDEMResolution;
    private calculateResolutionFromScale;
    private getFeatureTableName;
    private getCountryBounds;
}
