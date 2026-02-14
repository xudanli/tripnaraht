import { GeographicDataValidatorService } from '../../data-quality/services/geographic-data-validator.service';
import { GeographicDataAssessmentService } from '../../data-quality/services/geographic-data-assessment.service';
import { DataQualityMonitoringService } from '../../data-quality/services/data-quality-monitoring.service';
import { GeographicDataQualityMonitoringService } from '../../data-quality/services/geographic-data-quality-monitoring.service';
import { PrismaService } from '../../prisma/prisma.service';
export declare class UploadPhysicalRealityDataDto {
    countryCode: string;
    dataType: 'road-status' | 'ferry-schedules' | 'weather-windows';
    data: any;
}
export declare class DataQualityAdminController {
    private readonly geographicDataValidator;
    private readonly geographicDataAssessment;
    private readonly dataQualityMonitoring;
    private readonly geographicDataQualityMonitoring;
    private readonly prisma;
    private readonly logger;
    constructor(geographicDataValidator: GeographicDataValidatorService, geographicDataAssessment: GeographicDataAssessmentService, dataQualityMonitoring: DataQualityMonitoringService, geographicDataQualityMonitoring: GeographicDataQualityMonitoringService, prisma: PrismaService);
    uploadPhysicalRealityData(dto: UploadPhysicalRealityDataDto): Promise<{
        success: boolean;
        validationResult: {
            valid: boolean;
            errors: {
                field: string;
                message: string;
            }[];
            warnings: {
                field: string;
                message: string;
            }[];
        };
        message: string;
        coordinatesCount?: undefined;
    } | {
        success: boolean;
        validationResult: {
            valid: boolean;
            errors: any[];
            warnings: {
                field: string;
                message: string;
            }[];
        };
        message: string;
        coordinatesCount: number;
    }>;
    validateCoordinates(body: {
        coordinates: Array<{
            lat: number;
            lng: number;
        }>;
        countryCode?: string;
    }): Promise<{
        valid: boolean;
        errors: {
            field: string;
            message: string;
        }[];
        warnings: {
            field: string;
            message: string;
        }[];
        coordinatesCount: number;
    }>;
    getDashboard(): Promise<{
        summary: {
            totalMonitors: number;
            healthyCount: number;
            warningCount: number;
            criticalCount: number;
            avgOverallScore: number;
            pendingAlertsCount: number;
        };
        monitors: {
            id: string;
            dataSource: string;
            dataType: string;
            countryCode: string;
            overallScore: number;
            status: string;
            lastUpdated: Date;
            lastVerified: Date;
        }[];
        alerts: {
            id: string;
            severity: string;
            alertType: string;
            message: string;
            createdAt: Date;
            monitor: {
                dataSource: string;
                dataType: string;
            };
        }[];
    }>;
    getGeographicDashboard(): Promise<{
        summary: {
            totalMonitors: number;
            healthyCount: number;
            warningCount: number;
            criticalCount: number;
            avgOverallScore: number;
            avgQueryLatencyP95: number;
            pendingAlertsCount: number;
        };
        monitors: {
            id: string;
            dataSource: string;
            dataType: string;
            countryCode: string;
            overallScore: number;
            coverageRate: number;
            spatialAccuracy: number;
            spatialCompleteness: number;
            queryLatencyP95: number;
            querySuccessRate: number;
            status: string;
            lastUpdated: Date;
            lastVerified: Date;
        }[];
        alerts: {
            id: string;
            severity: string;
            alertType: string;
            message: string;
            createdAt: Date;
            geographicMonitor: {
                dataSource: string;
                dataType: string;
            };
        }[];
    }>;
    assessGeographicData(countryCode: string): Promise<{
        countryCode: string;
        demAssessment: {
            coverageRate: number;
            resolution: string;
            querySuccessRate: number;
            queryLatency: {
                p50: number;
                p95: number;
                p99: number;
            };
            missingRegions: {
                region: string;
                reason: string;
            }[];
        };
        geographicFeaturesAssessment: {
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
        };
        recommendations: {
            issue: string;
            impact: "LOW" | "MEDIUM" | "HIGH";
            recommendation: string;
            priority: "P0" | "P1" | "P2";
        }[];
    }>;
}
