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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const dem_elevation_service_1 = require("./services/dem-elevation.service");
const dem_effort_metadata_service_1 = require("./services/dem-effort-metadata.service");
const standard_response_dto_1 = require("../../common/dto/standard-response.dto");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
let DemController = class DemController {
    constructor(demElevationService, demEffortMetadataService) {
        this.demElevationService = demElevationService;
        this.demEffortMetadataService = demEffortMetadataService;
    }
    async getElevation(lat, lng) {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        if (isNaN(latNum) || isNaN(lngNum)) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '经纬度必须是有效数字');
        }
        try {
            const elevation = await this.demElevationService.getElevation(latNum, lngNum);
            return (0, standard_response_dto_1.successResponse)({
                lat: latNum,
                lng: lngNum,
                elevation: elevation,
                unit: 'meters',
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取海拔数据失败: ${error.message}`);
        }
    }
    async getProfile(body) {
        try {
            if (!body.polyline || body.polyline.length < 2) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'polyline 至少需要 2 个点');
            }
            const samplingInterval = body.samples || 100;
            const activityType = body.activityType || 'walking';
            const routePoints = body.polyline.map((p) => ({
                lat: p.lat,
                lng: p.lng,
            }));
            const effortMetadata = await this.demEffortMetadataService.calculateEffortMetadata(routePoints, {
                activityType,
                samplingInterval,
                includeElevationProfile: true,
            });
            let cumulativeAscent = 0;
            const elevationProfile = [];
            if (routePoints.length > 0) {
                const startElevation = await this.demElevationService.getElevation(routePoints[0].lat, routePoints[0].lng) || 0;
                elevationProfile.push({
                    distance: 0,
                    lat: routePoints[0].lat,
                    lng: routePoints[0].lng,
                    elevation: startElevation,
                    slope: 0,
                    cumulativeAscent: 0,
                });
            }
            if (effortMetadata.elevationProfile) {
                for (let i = 0; i < effortMetadata.elevationProfile.length; i++) {
                    const point = effortMetadata.elevationProfile[i];
                    const prevElevation = i === 0
                        ? elevationProfile[0].elevation
                        : effortMetadata.elevationProfile[i - 1].elevation;
                    const elevationDiff = point.elevation - prevElevation;
                    if (elevationDiff > 0) {
                        cumulativeAscent += elevationDiff;
                    }
                    const pointIndex = Math.min(Math.floor((point.distance / (effortMetadata.totalDistance || 1)) * routePoints.length), routePoints.length - 1);
                    elevationProfile.push({
                        distance: point.distance,
                        lat: routePoints[pointIndex].lat,
                        lng: routePoints[pointIndex].lng,
                        elevation: point.elevation,
                        slope: point.slope,
                        cumulativeAscent,
                    });
                }
            }
            const maxSlope = Math.max(...elevationProfile.map(p => Math.abs(p.slope)), 0);
            const totalDistance = effortMetadata.totalDistance || 0;
            const totalAscent = effortMetadata.totalAscent || 0;
            const fatigueIndex = Math.min(100, (totalAscent / 1000) * 10 + (totalDistance / 1000) * 2);
            return (0, standard_response_dto_1.successResponse)({
                elevationProfile,
                cumulativeAscent: totalAscent,
                totalDescent: effortMetadata.totalDescent || 0,
                maxSlope,
                minSlope: Math.min(...elevationProfile.map(p => p.slope), 0),
                maxElevation: elevationProfile.length > 0 ? Math.max(...elevationProfile.map(p => p.elevation)) : 0,
                minElevation: elevationProfile.length > 0 ? Math.min(...elevationProfile.map(p => p.elevation)) : 0,
                totalDistance,
                fatigueIndex,
                difficulty: effortMetadata.difficulty,
                effortScore: effortMetadata.effortScore,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取海拔剖面失败: ${error.message}`);
        }
    }
    async getTripTerrain(tripId, samples) {
        try {
            return (0, standard_response_dto_1.successResponse)({
                message: '请使用 POST /api/dem/profile 接口，提供 polyline 数据',
                tripId,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取行程地形数据失败: ${error.message}`);
        }
    }
};
exports.DemController = DemController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('elevation'),
    (0, swagger_1.ApiOperation)({
        summary: '获取单个坐标点的海拔',
        description: '根据经纬度获取指定点的海拔高度（米）',
    }),
    (0, swagger_1.ApiQuery)({ name: 'lat', description: '纬度', example: 64.1466, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'lng', description: '经度', example: -21.9426, type: Number, required: true }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回海拔数据',
    }),
    __param(0, (0, common_1.Query)('lat')),
    __param(1, (0, common_1.Query)('lng')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DemController.prototype, "getElevation", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('profile'),
    (0, swagger_1.ApiOperation)({
        summary: '获取路线海拔剖面',
        description: '根据路线点数组（polyline）生成详细的海拔剖面，包括累计爬升、坡度、体力消耗等信息',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['polyline'],
            properties: {
                polyline: {
                    type: 'array',
                    description: '路线点数组',
                    items: {
                        type: 'object',
                        properties: {
                            lat: { type: 'number', example: 64.1466 },
                            lng: { type: 'number', example: -21.9426 },
                        },
                    },
                },
                samples: {
                    type: 'number',
                    description: '采样间隔（米），默认 100',
                    example: 100,
                },
                activityType: {
                    type: 'string',
                    description: '活动类型（walking/driving/cycling），默认 walking',
                    example: 'walking',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回海拔剖面数据',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DemController.prototype, "getProfile", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/terrain'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程的地形数据',
        description: '根据行程 ID 获取行程的地形数据（海拔剖面、累计爬升等）',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'samples', description: '采样间隔（米）', type: Number, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回地形数据',
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Query)('samples')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DemController.prototype, "getTripTerrain", null);
exports.DemController = DemController = __decorate([
    (0, swagger_1.ApiTags)('DEM'),
    (0, common_1.Controller)('dem'),
    __metadata("design:paramtypes", [dem_elevation_service_1.DEMElevationService,
        dem_effort_metadata_service_1.DEMEffortMetadataService])
], DemController);
//# sourceMappingURL=dem.controller.js.map