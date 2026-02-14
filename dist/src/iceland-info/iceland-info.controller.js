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
exports.IcelandInfoController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const data_source_router_service_1 = require("../data-contracts/services/data-source-router.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const iceland_froad_service_1 = require("../data-contracts/services/iceland-froad.service");
const iceland_comprehensive_service_1 = require("../data-contracts/services/iceland-comprehensive.service");
const iceland_safety_adapter_1 = require("../data-contracts/adapters/iceland-safety.adapter");
const common_2 = require("@nestjs/common");
let IcelandInfoController = class IcelandInfoController {
    constructor(dataSourceRouter, icelandFRoadService, icelandComprehensive, icelandSafetyAdapter) {
        this.dataSourceRouter = dataSourceRouter;
        this.icelandFRoadService = icelandFRoadService;
        this.icelandComprehensive = icelandComprehensive;
        this.icelandSafetyAdapter = icelandSafetyAdapter;
    }
    async getRoadConditions(fRoads, status) {
        var _a, _b;
        try {
            if (!fRoads) {
                return (0, standard_response_dto_1.successResponse)({
                    fRoads: [],
                    lastUpdated: new Date().toISOString(),
                    source: 'road.is',
                    message: '请提供 fRoads 参数以查询特定 F-Road 的路况',
                });
            }
            const fRoadList = fRoads.split(',').map(f => f.trim().toUpperCase());
            const results = [];
            const icelandCenterLat = 64.5;
            const icelandCenterLng = -18.5;
            if (this.icelandComprehensive) {
                for (const fRoadNumber of fRoadList) {
                    try {
                        const roadStatus = await this.icelandComprehensive.getComprehensiveRoadStatus({
                            lat: icelandCenterLat,
                            lng: icelandCenterLng,
                            includeFRoadInfo: true,
                            radius: 200000,
                        });
                        const fRoadInfo = roadStatus.fRoadInfo;
                        if (fRoadInfo && fRoadInfo.roadNumber === fRoadNumber) {
                            const roadStatusStr = fRoadInfo.status === 'open' ? 'open' :
                                fRoadInfo.status === 'closed' ? 'closed' :
                                    fRoadInfo.status === 'restricted' ? 'caution' : 'unknown';
                            if (status && roadStatusStr !== status.toLowerCase()) {
                                continue;
                            }
                            results.push({
                                id: `f${fRoadNumber.toLowerCase()}`,
                                name: `F${fRoadNumber.substring(1)}`,
                                fRoadNumber: fRoadNumber,
                                status: roadStatusStr,
                                condition: ((_a = roadStatus.metadata) === null || _a === void 0 ? void 0 : _a.condition) || (fRoadInfo.isSlippery ? 'wet' : 'dry'),
                                isOpen: fRoadInfo.status === 'open',
                                description: roadStatus.reason || fRoadInfo.restrictionReason || `${fRoadNumber} 路况正常`,
                                lastUpdated: roadStatus.lastUpdated.toISOString(),
                            });
                        }
                        else {
                            const roadStatusStr = 'unknown';
                            if (status && roadStatusStr !== status.toLowerCase()) {
                                continue;
                            }
                            results.push({
                                id: `f${fRoadNumber.toLowerCase()}`,
                                name: `F${fRoadNumber.substring(1)}`,
                                fRoadNumber: fRoadNumber,
                                status: roadStatusStr,
                                condition: 'unknown',
                                isOpen: true,
                                description: `无法获取 ${fRoadNumber} 的实时路况信息`,
                                lastUpdated: new Date().toISOString(),
                            });
                        }
                    }
                    catch (error) {
                        const roadStatusStr = 'unknown';
                        if (status && roadStatusStr !== status.toLowerCase()) {
                            continue;
                        }
                        results.push({
                            id: `f${fRoadNumber.toLowerCase()}`,
                            name: `F${fRoadNumber.substring(1)}`,
                            fRoadNumber: fRoadNumber,
                            status: roadStatusStr,
                            condition: 'unknown',
                            isOpen: true,
                            description: `查询失败: ${error.message}`,
                            lastUpdated: new Date().toISOString(),
                        });
                    }
                }
            }
            else {
                for (const fRoadNumber of fRoadList) {
                    try {
                        const roadQuery = {
                            lat: icelandCenterLat,
                            lng: icelandCenterLng,
                            includeFRoadInfo: true,
                            radius: 200000,
                        };
                        const roadStatus = await this.dataSourceRouter.getRoadStatus(roadQuery);
                        const extendedStatus = roadStatus;
                        if (extendedStatus.fRoadInfo && extendedStatus.fRoadInfo.roadNumber === fRoadNumber) {
                            const fRoadInfo = extendedStatus.fRoadInfo;
                            const roadStatusStr = fRoadInfo.status === 'open' ? 'open' :
                                fRoadInfo.status === 'closed' ? 'closed' :
                                    fRoadInfo.status === 'restricted' ? 'caution' : 'unknown';
                            if (status && roadStatusStr !== status.toLowerCase()) {
                                continue;
                            }
                            results.push({
                                id: `f${fRoadNumber.toLowerCase()}`,
                                name: `F${fRoadNumber.substring(1)}`,
                                fRoadNumber: fRoadNumber,
                                status: roadStatusStr,
                                condition: ((_b = extendedStatus.metadata) === null || _b === void 0 ? void 0 : _b.condition) || (fRoadInfo.isSlippery ? 'wet' : 'dry'),
                                isOpen: fRoadInfo.status === 'open',
                                description: extendedStatus.reason || fRoadInfo.restrictionReason || `${fRoadNumber} 路况正常`,
                                lastUpdated: extendedStatus.lastUpdated.toISOString(),
                            });
                        }
                        else {
                            const roadStatusStr = 'unknown';
                            if (status && roadStatusStr !== status.toLowerCase()) {
                                continue;
                            }
                            results.push({
                                id: `f${fRoadNumber.toLowerCase()}`,
                                name: `F${fRoadNumber.substring(1)}`,
                                fRoadNumber: fRoadNumber,
                                status: roadStatusStr,
                                condition: 'unknown',
                                isOpen: true,
                                description: `无法获取 ${fRoadNumber} 的实时路况信息`,
                                lastUpdated: new Date().toISOString(),
                            });
                        }
                    }
                    catch (error) {
                        const roadStatusStr = 'unknown';
                        if (status && roadStatusStr !== status.toLowerCase()) {
                            continue;
                        }
                        results.push({
                            id: `f${fRoadNumber.toLowerCase()}`,
                            name: `F${fRoadNumber.substring(1)}`,
                            fRoadNumber: fRoadNumber,
                            status: roadStatusStr,
                            condition: 'unknown',
                            isOpen: true,
                            description: `查询失败: ${error.message}`,
                            lastUpdated: new Date().toISOString(),
                        });
                    }
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
    async getWeather(region, lat, lng, includeWindDetails) {
        var _a;
        try {
            const latNum = lat ? parseFloat(lat) : 64.5;
            const lngNum = lng ? parseFloat(lng) : -18.5;
            if (isNaN(latNum) || isNaN(lngNum)) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '经纬度必须是有效数字');
            }
            const weatherQuery = {
                lat: latNum,
                lng: lngNum,
                includeWindDetails: includeWindDetails === 'true',
            };
            let weatherData;
            if (this.icelandComprehensive) {
                weatherData = await this.icelandComprehensive.getComprehensiveWeather(weatherQuery);
            }
            else {
                weatherData = await this.dataSourceRouter.getWeather(weatherQuery);
            }
            return (0, standard_response_dto_1.successResponse)({
                station: {
                    id: region ? `highland-${region}` : 'iceland-center',
                    name: region || 'Iceland Center',
                    lat: latNum,
                    lng: lngNum,
                },
                current: {
                    datetime: weatherData.lastUpdated.toISOString(),
                    temperature: weatherData.temperature,
                    windSpeed: weatherData.windSpeed,
                    windDirection: weatherData.windDirection,
                    windSpeedKmh: weatherData.windSpeed ? weatherData.windSpeed * 3.6 : undefined,
                    precipitation: (_a = weatherData.metadata) === null || _a === void 0 ? void 0 : _a.precipitation,
                    condition: weatherData.condition,
                    visibility: weatherData.visibility,
                },
                forecast: [],
                lastUpdated: weatherData.lastUpdated.toISOString(),
                source: weatherData.source,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取天气数据失败: ${error.message}`);
        }
    }
    async getSafety(region, alertType) {
        try {
            if (this.icelandSafetyAdapter) {
                const alerts = await this.icelandSafetyAdapter.getSafetyAlerts();
                const criticalAlerts = await this.icelandSafetyAdapter.getCriticalSafetyAlerts();
                let filteredAlerts = alerts;
                if (region) {
                    filteredAlerts = filteredAlerts.filter(alert => {
                        var _a;
                        return (_a = alert.affectedAreas) === null || _a === void 0 ? void 0 : _a.some(area => { var _a; return (_a = area.name) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(region.toLowerCase()); });
                    });
                }
                if (alertType) {
                    filteredAlerts = filteredAlerts.filter(alert => { var _a; return ((_a = alert.type) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === alertType.toLowerCase(); });
                }
                return (0, standard_response_dto_1.successResponse)({
                    alerts: filteredAlerts.map(alert => {
                        var _a, _b, _c, _d;
                        return ({
                            id: alert.id,
                            title: alert.title,
                            description: alert.description,
                            type: alert.type,
                            severity: alert.severity,
                            effectiveTime: (_a = alert.effectiveTime) === null || _a === void 0 ? void 0 : _a.toISOString(),
                            expiryTime: (_b = alert.expiryTime) === null || _b === void 0 ? void 0 : _b.toISOString(),
                            regions: ((_c = alert.affectedAreas) === null || _c === void 0 ? void 0 : _c.map(area => area.name)) || [],
                            fRoads: ((_d = alert.metadata) === null || _d === void 0 ? void 0 : _d.fRoads) || [],
                        });
                    }),
                    travelConditions: [],
                    lastUpdated: new Date().toISOString(),
                });
            }
            else {
                return (0, standard_response_dto_1.successResponse)({
                    alerts: [],
                    travelConditions: [],
                    lastUpdated: new Date().toISOString(),
                    message: '安全信息服务暂不可用',
                });
            }
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取安全信息失败: ${error.message}`);
        }
    }
};
exports.IcelandInfoController = IcelandInfoController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('road-conditions'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 F-Road 路况信息',
        description: '根据 F-Road 编号列表获取路况状态。此接口使用新的数据契约服务（DataSourceRouterService）。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'fRoads', description: 'F-Road 编号列表（多个用逗号分隔）', example: 'F208,F225,F249,F26', type: String, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'status', description: '状态过滤（open/closed/caution/impassable）', type: String, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回路况数据',
    }),
    __param(0, (0, common_1.Query)('fRoads')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], IcelandInfoController.prototype, "getRoadConditions", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('weather'),
    (0, swagger_1.ApiOperation)({
        summary: '获取冰岛天气预报',
        description: '获取冰岛高地区域的天气预报数据。此接口使用新的数据契约服务（DataSourceRouterService）。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'region', description: '高地区域（centralhighlands/southhighlands/northhighlands）', type: String, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'lat', description: '纬度', type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'lng', description: '经度', type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'includeWindDetails', description: '是否包含详细风速信息', type: Boolean, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回天气数据',
    }),
    __param(0, (0, common_1.Query)('region')),
    __param(1, (0, common_1.Query)('lat')),
    __param(2, (0, common_1.Query)('lng')),
    __param(3, (0, common_1.Query)('includeWindDetails')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], IcelandInfoController.prototype, "getWeather", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('safety'),
    (0, swagger_1.ApiOperation)({
        summary: '获取安全信息和旅行条件',
        description: '获取冰岛安全警报和旅行条件信息。此接口使用新的数据契约服务。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'region', description: '区域过滤（highlands/central-highlands）', type: String, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'alertType', description: '警报类型过滤（weather/road/travel/general）', type: String, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回安全信息',
    }),
    __param(0, (0, common_1.Query)('region')),
    __param(1, (0, common_1.Query)('alertType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], IcelandInfoController.prototype, "getSafety", null);
exports.IcelandInfoController = IcelandInfoController = __decorate([
    (0, swagger_1.ApiTags)('Iceland Info'),
    (0, common_1.Controller)('iceland-info'),
    __param(1, (0, common_2.Optional)()),
    __param(2, (0, common_2.Optional)()),
    __param(3, (0, common_2.Optional)()),
    __metadata("design:paramtypes", [data_source_router_service_1.DataSourceRouterService,
        iceland_froad_service_1.IcelandFRoadService,
        iceland_comprehensive_service_1.IcelandComprehensiveService,
        iceland_safety_adapter_1.IcelandSafetyAdapter])
], IcelandInfoController);
//# sourceMappingURL=iceland-info.controller.js.map