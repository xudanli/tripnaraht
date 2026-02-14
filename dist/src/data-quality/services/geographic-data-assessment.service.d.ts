import { PrismaService } from '../../prisma/prisma.service';
import { DEMResolutionCacheService } from './dem-resolution-cache.service';
export interface DEMCoverageAssessment {
    coverageRate: number;
    resolution: string;
    querySuccessRate: number;
    queryLatency: {
        p50: number;
        p95: number;
        p99: number;
    };
    missingRegions: Array<{
        region: string;
        reason: string;
    }>;
}
export interface GeographicFeaturesCoverageAssessment {
    rivers: {
        coverageRate: number;
        featureCount: number;
        missingRegions: string[];
    };
    mountains: {
        coverageRate: number;
        featureCount: number;
        missingRegions: string[];
    };
    roads: {
        coverageRate: number;
        featureCount: number;
        missingRegions: string[];
    };
    coastlines: {
        coverageRate: number;
        featureCount: number;
        missingRegions: string[];
    };
    ports: {
        coverageRate: number;
        featureCount: number;
        missingRegions: string[];
    };
    railways: {
        coverageRate: number;
        featureCount: number;
        missingRegions: string[];
    };
}
export interface GeographicDataAssessment {
    countryCode: string;
    demAssessment: DEMCoverageAssessment;
    geographicFeaturesAssessment: GeographicFeaturesCoverageAssessment;
    recommendations: Array<{
        issue: string;
        impact: 'LOW' | 'MEDIUM' | 'HIGH';
        recommendation: string;
        priority: 'P0' | 'P1' | 'P2';
    }>;
}
export declare class GeographicDataAssessmentService {
    private readonly prisma;
    private readonly resolutionCache;
    private readonly logger;
    constructor(prisma: PrismaService, resolutionCache: DEMResolutionCacheService);
    private readonly testCoordinates;
    assessCountryGeographicData(countryCode: string): Promise<GeographicDataAssessment>;
    assessDEMCoverage(countryCode: string): Promise<DEMCoverageAssessment>;
    assessGeographicFeaturesCoverage(countryCode: string): Promise<GeographicFeaturesCoverageAssessment>;
    private assessFeatureCoverage;
    private generateRecommendations;
    generateQualityReport(countryCode: string): Promise<GeographicDataAssessment>;
    private checkDEMTableExists;
    private checkTableExists;
    private queryDEMElevation;
    private getDEMResolution;
    private calculateResolutionFromScale;
    private getCountryBounds;
}
