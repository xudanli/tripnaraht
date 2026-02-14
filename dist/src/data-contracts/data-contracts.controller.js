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
exports.DataContractsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const data_source_router_service_1 = require("./services/data-source-router.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const iceland_froad_service_1 = require("./services/iceland-froad.service");
let DataContractsController = class DataContractsController {
    constructor(dataSourceRouter, icelandFRoadService) {
        this.dataSourceRouter = dataSourceRouter;
        this.icelandFRoadService = icelandFRoadService;
    }
    async getRoadStatus(lat, lng, radius, includeFRoadInfo, includeRiverCrossing) {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        if (isNaN(latNum) || isNaN(lngNum)) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '经纬度必须是有效数字');
        }
        if (latNum < -90 || latNum > 90) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '纬度必须在 -90 到 90 之间');
        }
        if (lngNum < -180 || lngNum > 180) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '经度必须在 -180 到 180 之间');
        }
        try {
            const query = {
                lat: latNum,
                lng: lngNum,
                radius: radius ? parseInt(radius, 10) : undefined,
                includeFRoadInfo: includeFRoadInfo === 'true',
                includeRiverCrossing: includeRiverCrossing === 'true',
            };
            const roadStatus = await this.dataSourceRouter.getRoadStatus(query);
            return (0, standard_response_dto_1.successResponse)(roadStatus);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取路况数据失败: ${error.message}`);
        }
    }
    async getRoadStatusByFRoads(fRoads) {
        var _a;
        if (!fRoads) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'fRoads 参数是必需的');
        }
        try {
            const fRoadList = fRoads.split(',').map(f => f.trim().toUpperCase());
            const results = [];
            if (this.icelandFRoadService) {
                for (const fRoadNumber of fRoadList) {
                    try {
                        const defaultLat = 64.5;
                        const defaultLng = -18.5;
                        const roadQuery = {
                            lat: defaultLat,
                            lng: defaultLng,
                            includeFRoadInfo: true,
                        };
                        const roadStatus = await this.dataSourceRouter.getRoadStatus(roadQuery);
                        const extendedStatus = roadStatus;
                        if (extendedStatus.fRoadInfo && extendedStatus.fRoadInfo.roadNumber === fRoadNumber) {
                            results.push({
                                roadNumber: fRoadNumber,
                                status: extendedStatus.fRoadInfo.status,
                                isOpen: extendedStatus.fRoadInfo.status === 'open',
                                riskLevel: extendedStatus.riskLevel,
                                requires4WD: extendedStatus.fRoadInfo.requires4WD,
                                condition: (_a = extendedStatus.metadata) === null || _a === void 0 ? void 0 : _a.condition,
                                lastUpdated: extendedStatus.lastUpdated.toISOString(),
                                reason: extendedStatus.reason,
                            });
                        }
                        else {
                            results.push({
                                roadNumber: fRoadNumber,
                                status: 'unknown',
                                isOpen: true,
                                riskLevel: 1,
                                requires4WD: true,
                                lastUpdated: new Date().toISOString(),
                                reason: '无法获取实时路况信息',
                            });
                        }
                    }
                    catch (error) {
                        results.push({
                            roadNumber: fRoadNumber,
                            status: 'unknown',
                            isOpen: true,
                            riskLevel: 1,
                            requires4WD: true,
                            lastUpdated: new Date().toISOString(),
                            reason: `查询失败: ${error.message}`,
                        });
                    }
                }
            }
            else {
                for (const fRoadNumber of fRoadList) {
                    results.push({
                        roadNumber: fRoadNumber,
                        status: 'unknown',
                        isOpen: true,
                        riskLevel: 1,
                        requires4WD: true,
                        lastUpdated: new Date().toISOString(),
                        reason: 'F-Road 服务不可用',
                    });
                }
            }
            return (0, standard_response_dto_1.successResponse)({
                fRoads: results,
                lastUpdated: new Date().toISOString(),
                source: 'road.is',
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取 F-Road 路况数据失败: ${error.message}`);
        }
    }
};
exports.DataContractsController = DataContractsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('road-status'),
    (0, swagger_1.ApiOperation)({
        summary: '获取路况状态',
        description: '根据经纬度获取路况状态。系统会自动选择合适的数据源适配器（冰岛使用 road.is，其他国家使用默认适配器）。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'lat', description: '纬度', example: 64.1466, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'lng', description: '经度', example: -21.9426, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'radius', description: '查询半径（米）', example: 50000, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'includeFRoadInfo', description: '是否包含 F-Road 信息（冰岛特定）', example: false, type: Boolean, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'includeRiverCrossing', description: '是否包含河流渡口信息（冰岛特定）', example: false, type: Boolean, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回路况数据',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'object',
                    properties: {
                        isOpen: { type: 'boolean', example: true },
                        riskLevel: { type: 'number', example: 1, description: '风险等级：0=安全, 1=轻微风险, 2=中等风险, 3=高风险' },
                        reason: { type: 'string', example: '部分路段湿滑' },
                        lastUpdated: { type: 'string', example: '2026-02-04T12:00:00Z' },
                        source: { type: 'string', example: 'road.is' },
                        fRoadInfo: {
                            type: 'object',
                            description: 'F-Road 信息（仅冰岛，可选）',
                            properties: {
                                roadNumber: { type: 'string', example: 'F208' },
                                status: { type: 'string', example: 'open' },
                                requires4WD: { type: 'boolean', example: true },
                                condition: { type: 'string', example: 'dry' },
                            },
                        },
                        riverCrossingInfo: {
                            type: 'object',
                            description: '河流渡口信息（仅冰岛，可选）',
                        },
                        metadata: { type: 'object' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Query)('lat')),
    __param(1, (0, common_1.Query)('lng')),
    __param(2, (0, common_1.Query)('radius')),
    __param(3, (0, common_1.Query)('includeFRoadInfo')),
    __param(4, (0, common_1.Query)('includeRiverCrossing')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], DataContractsController.prototype, "getRoadStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('road-status/by-froads'),
    (0, swagger_1.ApiOperation)({
        summary: '根据 F-Road 编号获取路况状态（冰岛特定）',
        description: '根据 F-Road 编号列表获取路况状态。这是 `/api/iceland-info/road-conditions` 的新接口，使用通用数据契约服务。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'fRoads', description: 'F-Road 编号列表（多个用逗号分隔）', example: 'F208,F225,F249,F26', type: String, required: true }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回路况数据',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'object',
                    properties: {
                        fRoads: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    roadNumber: { type: 'string', example: 'F208' },
                                    status: { type: 'string', example: 'open' },
                                    isOpen: { type: 'boolean', example: true },
                                    riskLevel: { type: 'number', example: 1 },
                                    requires4WD: { type: 'boolean', example: true },
                                    condition: { type: 'string', example: 'dry' },
                                    lastUpdated: { type: 'string', example: '2026-02-04T12:00:00Z' },
                                },
                            },
                        },
                        lastUpdated: { type: 'string', example: '2026-02-04T12:00:00Z' },
                        source: { type: 'string', example: 'road.is' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Query)('fRoads')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DataContractsController.prototype, "getRoadStatusByFRoads", null);
exports.DataContractsController = DataContractsController = __decorate([
    (0, swagger_1.ApiTags)('Data Contracts'),
    (0, common_1.Controller)('data-contracts'),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [data_source_router_service_1.DataSourceRouterService,
        iceland_froad_service_1.IcelandFRoadService])
], DataContractsController);
//# sourceMappingURL=data-contracts.controller.js.map