"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DataQualityAdminController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataQualityAdminController = exports.UploadPhysicalRealityDataDto = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const geographic_data_validator_service_1 = require("../../data-quality/services/geographic-data-validator.service");
const geographic_data_assessment_service_1 = require("../../data-quality/services/geographic-data-assessment.service");
const data_quality_monitoring_service_1 = require("../../data-quality/services/data-quality-monitoring.service");
const geographic_data_quality_monitoring_service_1 = require("../../data-quality/services/geographic-data-quality-monitoring.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
class UploadPhysicalRealityDataDto {
}
exports.UploadPhysicalRealityDataDto = UploadPhysicalRealityDataDto;
let DataQualityAdminController = DataQualityAdminController_1 = class DataQualityAdminController {
    constructor(geographicDataValidator, geographicDataAssessment, dataQualityMonitoring, geographicDataQualityMonitoring, prisma) {
        this.geographicDataValidator = geographicDataValidator;
        this.geographicDataAssessment = geographicDataAssessment;
        this.dataQualityMonitoring = dataQualityMonitoring;
        this.geographicDataQualityMonitoring = geographicDataQualityMonitoring;
        this.prisma = prisma;
        this.logger = new common_1.Logger(DataQualityAdminController_1.name);
    }
    async uploadPhysicalRealityData(dto) {
        this.logger.log(`上传物理现实数据: ${dto.countryCode} - ${dto.dataType}`);
        const coordinates = this.geographicDataValidator.extractCoordinatesFromPhysicalRealityData(dto.data);
        if (coordinates.length === 0) {
            throw new common_1.BadRequestException('数据中未找到坐标信息');
        }
        const coordValidation = this.geographicDataValidator.validateCoordinatesBatch(coordinates);
        if (!coordValidation.valid) {
            this.logger.warn(`坐标验证失败: ${JSON.stringify(coordValidation.errors)}`);
            return {
                success: false,
                validationResult: {
                    valid: false,
                    errors: coordValidation.errors,
                    warnings: coordValidation.warnings,
                },
                message: '坐标格式验证失败',
            };
        }
        const spatialRangeValidation = this.geographicDataValidator.validateSpatialRange(coordinates, dto.countryCode);
        const coordSystemValidation = this.geographicDataValidator.validateCoordinateSystemConsistency(coordinates);
        const allErrors = [
            ...coordValidation.errors,
            ...spatialRangeValidation.errors,
            ...coordSystemValidation.errors,
        ];
        const allWarnings = [
            ...coordValidation.warnings,
            ...spatialRangeValidation.warnings,
            ...coordSystemValidation.warnings,
        ];
        if (allErrors.length > 0) {
            this.logger.warn(`地理数据验证失败: ${JSON.stringify(allErrors)}`);
            return {
                success: false,
                validationResult: {
                    valid: false,
                    errors: allErrors,
                    warnings: allWarnings,
                },
                message: '地理数据验证失败',
            };
        }
        this.logger.log(`地理数据验证通过: ${coordinates.length} 个坐标`);
        return {
            success: true,
            validationResult: {
                valid: true,
                errors: [],
                warnings: allWarnings,
            },
            message: '地理数据验证通过',
            coordinatesCount: coordinates.length,
        };
    }
    async validateCoordinates(body) {
        const { coordinates, countryCode } = body;
        if (!coordinates || !Array.isArray(coordinates)) {
            throw new common_1.BadRequestException('coordinates必须是数组');
        }
        const coordValidation = this.geographicDataValidator.validateCoordinatesBatch(coordinates);
        let spatialRangeValidation = null;
        if (countryCode) {
            spatialRangeValidation = this.geographicDataValidator.validateSpatialRange(coordinates, countryCode);
        }
        const coordSystemValidation = this.geographicDataValidator.validateCoordinateSystemConsistency(coordinates);
        const allErrors = [
            ...coordValidation.errors,
            ...((spatialRangeValidation === null || spatialRangeValidation === void 0 ? void 0 : spatialRangeValidation.errors) || []),
            ...coordSystemValidation.errors,
        ];
        const allWarnings = [
            ...coordValidation.warnings,
            ...((spatialRangeValidation === null || spatialRangeValidation === void 0 ? void 0 : spatialRangeValidation.warnings) || []),
            ...coordSystemValidation.warnings,
        ];
        return {
            valid: allErrors.length === 0,
            errors: allErrors,
            warnings: allWarnings,
            coordinatesCount: coordinates.length,
        };
    }
    async getDashboard() {
        const monitors = await this.prisma.dataQualityMonitor.findMany({
            orderBy: {
                overallScore: 'asc',
            },
            take: 100,
        });
        const pendingAlerts = await this.prisma.dataQualityAlert.findMany({
            where: {
                status: 'PENDING',
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 50,
            include: {
                monitor: true,
            },
        });
        const totalMonitors = monitors.length;
        const healthyCount = monitors.filter(m => m.status === 'HEALTHY').length;
        const warningCount = monitors.filter(m => m.status === 'WARNING').length;
        const criticalCount = monitors.filter(m => m.status === 'CRITICAL').length;
        const avgOverallScore = monitors.length > 0
            ? monitors.reduce((sum, m) => sum + m.overallScore, 0) / monitors.length
            : 1.0;
        return {
            summary: {
                totalMonitors,
                healthyCount,
                warningCount,
                criticalCount,
                avgOverallScore,
                pendingAlertsCount: pendingAlerts.length,
            },
            monitors: monitors.map(m => ({
                id: m.id,
                dataSource: m.dataSource,
                dataType: m.dataType,
                countryCode: m.countryCode,
                overallScore: m.overallScore,
                status: m.status,
                lastUpdated: m.lastUpdated,
                lastVerified: m.lastVerified,
            })),
            alerts: pendingAlerts.map(a => ({
                id: a.id,
                severity: a.severity,
                alertType: a.alertType,
                message: a.message,
                createdAt: a.createdAt,
                monitor: a.monitor ? {
                    dataSource: a.monitor.dataSource,
                    dataType: a.monitor.dataType,
                } : null,
            })),
        };
    }
    async getGeographicDashboard() {
        const monitors = await this.prisma.geographicDataQualityMonitor.findMany({
            orderBy: {
                overallScore: 'asc',
            },
            take: 100,
        });
        const pendingAlerts = await this.prisma.dataQualityAlert.findMany({
            where: {
                status: 'PENDING',
                geographicMonitorId: {
                    not: null,
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 50,
            include: {
                geographicMonitor: true,
            },
        });
        const totalMonitors = monitors.length;
        const healthyCount = monitors.filter(m => m.status === 'HEALTHY').length;
        const warningCount = monitors.filter(m => m.status === 'WARNING').length;
        const criticalCount = monitors.filter(m => m.status === 'CRITICAL').length;
        const avgOverallScore = monitors.length > 0
            ? monitors.reduce((sum, m) => sum + m.overallScore, 0) / monitors.length
            : 1.0;
        const monitorsWithLatency = monitors.filter(m => m.queryLatencyP95 !== null);
        const avgQueryLatencyP95 = monitorsWithLatency.length > 0
            ? monitorsWithLatency.reduce((sum, m) => sum + (m.queryLatencyP95 || 0), 0) /
                monitorsWithLatency.length
            : 0;
        return {
            summary: {
                totalMonitors,
                healthyCount,
                warningCount,
                criticalCount,
                avgOverallScore,
                avgQueryLatencyP95,
                pendingAlertsCount: pendingAlerts.length,
            },
            monitors: monitors.map(m => ({
                id: m.id,
                dataSource: m.dataSource,
                dataType: m.dataType,
                countryCode: m.countryCode,
                overallScore: m.overallScore,
                coverageRate: m.coverageRate,
                spatialAccuracy: m.spatialAccuracy,
                spatialCompleteness: m.spatialCompleteness,
                queryLatencyP95: m.queryLatencyP95,
                querySuccessRate: m.querySuccessRate,
                status: m.status,
                lastUpdated: m.lastUpdated,
                lastVerified: m.lastVerified,
            })),
            alerts: pendingAlerts.map(a => ({
                id: a.id,
                severity: a.severity,
                alertType: a.alertType,
                message: a.message,
                createdAt: a.createdAt,
                geographicMonitor: a.geographicMonitor
                    ? {
                        dataSource: a.geographicMonitor.dataSource,
                        dataType: a.geographicMonitor.dataType,
                    }
                    : null,
            })),
        };
    }
    async assessGeographicData(countryCode) {
        const assessment = await this.geographicDataAssessment.assessCountryGeographicData(countryCode.toUpperCase());
        return {
            countryCode: assessment.countryCode,
            demAssessment: {
                coverageRate: assessment.demAssessment.coverageRate,
                resolution: assessment.demAssessment.resolution,
                querySuccessRate: assessment.demAssessment.querySuccessRate,
                queryLatency: assessment.demAssessment.queryLatency,
                missingRegions: assessment.demAssessment.missingRegions,
            },
            geographicFeaturesAssessment: {
                rivers: {
                    coverageRate: assessment.geographicFeaturesAssessment.rivers.coverageRate,
                    featureCount: assessment.geographicFeaturesAssessment.rivers.featureCount,
                    missingRegions: assessment.geographicFeaturesAssessment.rivers.missingRegions,
                },
                mountains: {
                    coverageRate: assessment.geographicFeaturesAssessment.mountains.coverageRate,
                    featureCount: assessment.geographicFeaturesAssessment.mountains.featureCount,
                    missingRegions: assessment.geographicFeaturesAssessment.mountains.missingRegions,
                },
                roads: {
                    coverageRate: assessment.geographicFeaturesAssessment.roads.coverageRate,
                    featureCount: assessment.geographicFeaturesAssessment.roads.featureCount,
                    missingRegions: assessment.geographicFeaturesAssessment.roads.missingRegions,
                },
                coastlines: {
                    coverageRate: assessment.geographicFeaturesAssessment.coastlines.coverageRate,
                    featureCount: assessment.geographicFeaturesAssessment.coastlines.featureCount,
                    missingRegions: assessment.geographicFeaturesAssessment.coastlines.missingRegions,
                },
                ports: {
                    coverageRate: assessment.geographicFeaturesAssessment.ports.coverageRate,
                    featureCount: assessment.geographicFeaturesAssessment.ports.featureCount,
                    missingRegions: assessment.geographicFeaturesAssessment.ports.missingRegions,
                },
                railways: {
                    coverageRate: assessment.geographicFeaturesAssessment.railways.coverageRate,
                    featureCount: assessment.geographicFeaturesAssessment.railways.featureCount,
                    missingRegions: assessment.geographicFeaturesAssessment.railways.missingRegions,
                },
            },
            recommendations: assessment.recommendations,
        };
    }
};
exports.DataQualityAdminController = DataQualityAdminController;
__decorate([
    (0, common_1.Post)('physical-reality/upload'),
    (0, swagger_1.ApiOperation)({ summary: '上传物理现实数据（道路状态、渡轮时刻表、天气窗口）' }),
    (0, swagger_1.ApiBody)({ type: UploadPhysicalRealityDataDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '上传成功' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '验证失败' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [UploadPhysicalRealityDataDto]),
    __metadata("design:returntype", Promise)
], DataQualityAdminController.prototype, "uploadPhysicalRealityData", null);
__decorate([
    (0, common_1.Post)('validate/coordinates'),
    (0, swagger_1.ApiOperation)({ summary: '验证地理数据坐标' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                coordinates: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            lat: { type: 'number' },
                            lng: { type: 'number' },
                        },
                    },
                },
                countryCode: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DataQualityAdminController.prototype, "validateCoordinates", null);
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, swagger_1.ApiOperation)({ summary: '获取数据质量监控仪表板' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '监控仪表板数据' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DataQualityAdminController.prototype, "getDashboard", null);
__decorate([
    (0, common_1.Get)('geographic/dashboard'),
    (0, swagger_1.ApiOperation)({ summary: '获取地理数据质量监控仪表板' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '地理数据监控仪表板数据' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DataQualityAdminController.prototype, "getGeographicDashboard", null);
__decorate([
    (0, common_1.Get)('geographic/assess/:countryCode'),
    (0, swagger_1.ApiOperation)({ summary: '评估指定国家的地理数据质量' }),
    (0, swagger_1.ApiParam)({ name: 'countryCode', description: '国家代码（ISO 3166-1 alpha-2）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '地理数据评估结果' }),
    __param(0, (0, common_1.Param)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DataQualityAdminController.prototype, "assessGeographicData", null);
exports.DataQualityAdminController = DataQualityAdminController = DataQualityAdminController_1 = __decorate([
    (0, swagger_1.ApiTags)('Admin - Data Quality'),
    (0, common_1.Controller)('admin/data-quality'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [geographic_data_validator_service_1.GeographicDataValidatorService,
        geographic_data_assessment_service_1.GeographicDataAssessmentService,
        data_quality_monitoring_service_1.DataQualityMonitoringService,
        geographic_data_quality_monitoring_service_1.GeographicDataQualityMonitoringService,
        prisma_service_1.PrismaService])
], DataQualityAdminController);
//# sourceMappingURL=data-quality-admin.controller.js.map