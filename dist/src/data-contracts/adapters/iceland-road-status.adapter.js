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
var IcelandRoadStatusAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IcelandRoadStatusAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const base_adapter_1 = require("./base.adapter");
const adapter_mapper_util_1 = require("../../common/utils/adapter-mapper.util");
let IcelandRoadStatusAdapter = IcelandRoadStatusAdapter_1 = class IcelandRoadStatusAdapter extends base_adapter_1.BaseAdapter {
    constructor(configService) {
        super(IcelandRoadStatusAdapter_1.name, {
            baseURL: 'https://www.road.is',
            timeout: 5000,
        });
        this.configService = configService;
        this.baseUrl = 'https://www.road.is';
        this.datexUrl = 'https://www.road.is/travel-info/road-conditions-and-weather/road-conditions-api/';
    }
    async getRoadStatus(query) {
        try {
            let data = null;
            try {
                const datexResponse = await this.httpClient.get('/api/datex2/roadconditions', {
                    params: {
                        lat: query.lat,
                        lon: query.lng,
                        radius: query.radius || 50000,
                    },
                });
                data = datexResponse.data;
                this.logger.debug('使用 DATEX II API');
            }
            catch (datexError) {
                const errorMsg = adapter_mapper_util_1.AdapterMapper.extractErrorMessage(datexError);
                if (errorMsg.includes('EAI_AGAIN') || errorMsg.includes('timeout') || errorMsg.includes('超时') || errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED')) {
                    this.logger.warn(`网络错误，无法连接到 road.is: ${errorMsg}`);
                    throw datexError;
                }
                this.logger.debug('DATEX II API 不可用，尝试标准 API');
            }
            if (!data) {
                try {
                    const response = await this.httpClient.get('/api/roadconditions', {
                        params: {
                            lat: query.lat,
                            lon: query.lng,
                            radius: query.radius || 50000,
                        },
                    });
                    data = response.data;
                }
                catch (apiError) {
                    const errorMsg = adapter_mapper_util_1.AdapterMapper.extractErrorMessage(apiError);
                    if (errorMsg.includes('EAI_AGAIN') || errorMsg.includes('timeout') || errorMsg.includes('超时') || errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED')) {
                        this.logger.warn(`网络错误，无法连接到 road.is: ${errorMsg}`);
                        throw apiError;
                    }
                    throw apiError;
                }
            }
            const status = await this.mapToRoadStatus(data, query);
            if (query.includeFRoadInfo) {
                const fRoadInfo = await this.getFRoadInfo(query);
                if (fRoadInfo) {
                    status.fRoadInfo = fRoadInfo;
                }
            }
            if (query.includeRiverCrossing) {
                const riverCrossingInfo = await this.getRiverCrossingInfo(query);
                if (riverCrossingInfo) {
                    status.riverCrossingInfo = riverCrossingInfo;
                }
            }
            return status;
        }
        catch (error) {
            const errorMsg = adapter_mapper_util_1.AdapterMapper.extractErrorMessage(error);
            const isNetworkError = errorMsg.includes('EAI_AGAIN') ||
                errorMsg.includes('timeout') ||
                errorMsg.includes('超时') ||
                errorMsg.includes('ENOTFOUND') ||
                errorMsg.includes('ECONNREFUSED');
            if (isNetworkError) {
                this.logger.warn(`网络错误，无法连接到 road.is，返回保守估计: ${errorMsg}`);
            }
            else {
                this.logger.error(`获取冰岛路况失败: ${errorMsg}`);
            }
            return adapter_mapper_util_1.AdapterMapper.createDefaultErrorResponse('road.is', error, {
                isOpen: true,
                riskLevel: isNetworkError ? 1 : 2,
                reason: isNetworkError
                    ? '无法连接到路况服务，请稍后重试或查询官方 Road.is 网站'
                    : '无法获取实时路况数据，建议查询官方 Road.is 网站',
                metadata: {
                    note: 'API 调用失败，返回保守估计',
                    networkError: isNetworkError,
                },
            });
        }
    }
    async getRoadStatuses(query) {
        if (!query.segments || query.segments.length === 0) {
            return [await this.getRoadStatus(query)];
        }
        const statuses = [];
        for (const segment of query.segments) {
            const segmentQuery = {
                lat: segment.from.lat,
                lng: segment.from.lng,
                segments: [{ from: segment.from, to: segment.to }],
            };
            const status = await this.getRoadStatus(segmentQuery);
            statuses.push(status);
        }
        return statuses;
    }
    getSupportedCountries() {
        return ['IS'];
    }
    getPriority() {
        return 10;
    }
    getName() {
        return 'Iceland Road.is';
    }
    async mapToRoadStatus(data, query) {
        let isOpen = true;
        let riskLevel = 0;
        let reason;
        const reasons = [];
        const extendedStatus = {
            isOpen: true,
            riskLevel: 0,
            lastUpdated: new Date(),
            source: 'road.is',
            metadata: {
                rawData: data,
                query: query,
            },
        };
        if (data.situationRecords) {
            for (const record of data.situationRecords) {
                if (record.roadClosure || record.roadClosed) {
                    isOpen = false;
                    riskLevel = 3;
                    reasons.push(`路段封闭: ${record.roadName || '未知路段'}`);
                }
                if (record.slippery) {
                    riskLevel = Math.max(riskLevel, 2);
                    reasons.push('路面湿滑');
                    extendedStatus.metadata = { ...extendedStatus.metadata, isSlippery: true };
                }
                if (record.snowDepth !== undefined && record.snowDepth > 0) {
                    extendedStatus.snowDepth = record.snowDepth;
                    if (record.snowDepth > 20) {
                        riskLevel = Math.max(riskLevel, 3);
                        reasons.push(`积雪深度: ${record.snowDepth}cm`);
                    }
                    else if (record.snowDepth > 10) {
                        riskLevel = Math.max(riskLevel, 2);
                        reasons.push(`积雪深度: ${record.snowDepth}cm`);
                    }
                }
                if (record.windGusts !== undefined && record.windGusts > 0) {
                    extendedStatus.windGusts = record.windGusts;
                    if (record.windGusts > 25) {
                        riskLevel = Math.max(riskLevel, 3);
                        reasons.push(`瞬时强风: ${record.windGusts} m/s`);
                    }
                    else if (record.windGusts > 15) {
                        riskLevel = Math.max(riskLevel, 2);
                        reasons.push(`瞬时强风: ${record.windGusts} m/s`);
                    }
                }
            }
        }
        if (data.closedRoads && data.closedRoads.length > 0) {
            isOpen = false;
            riskLevel = 3;
            reasons.push(`路段封闭: ${data.closedRoads.map((r) => r.name || r.roadNumber).join(', ')}`);
        }
        if (data.alerts && data.alerts.length > 0) {
            const criticalAlerts = data.alerts.filter((a) => a.severity === 'critical' || a.severity === 'warning');
            if (criticalAlerts.length > 0) {
                riskLevel = Math.max(riskLevel, criticalAlerts.some((a) => a.severity === 'critical') ? 3 : 2);
                reasons.push(`天气警报: ${criticalAlerts.map((a) => a.title).join(', ')}`);
            }
        }
        if (data.fRoads && data.fRoads.length > 0) {
            const closedFRoads = data.fRoads.filter((r) => !r.isOpen);
            if (closedFRoads.length > 0) {
                riskLevel = Math.max(riskLevel, 2);
                reasons.push(`F-Road 封闭: ${closedFRoads.map((r) => r.name || r.roadNumber).join(', ')}`);
            }
        }
        extendedStatus.isOpen = isOpen;
        extendedStatus.riskLevel = riskLevel;
        extendedStatus.reason = reasons.length > 0 ? reasons.join('; ') : undefined;
        return extendedStatus;
    }
    async getFRoadInfo(query) {
        return this.safeRequestOrNull(async () => {
            const response = await this.httpClient.get('/api/froads', {
                params: {
                    lat: query.lat,
                    lon: query.lng,
                    radius: query.radius || 50000,
                },
            });
            const fRoadData = response.data;
            if (!fRoadData || fRoadData.length === 0) {
                return null;
            }
            const nearestFRoad = fRoadData[0];
            return {
                roadNumber: nearestFRoad.roadNumber || nearestFRoad.name,
                isFRoad: true,
                status: nearestFRoad.isOpen ? 'open' : 'closed',
                restrictionReason: nearestFRoad.restrictionReason,
                requires4WD: nearestFRoad.requires4WD !== false,
                difficultyLevel: nearestFRoad.difficultyLevel || 3,
                snowDepth: nearestFRoad.snowDepth,
                isSlippery: nearestFRoad.isSlippery,
                lastUpdated: new Date(nearestFRoad.lastUpdated || Date.now()),
            };
        }, '获取 F-Road 信息失败');
    }
    async getRiverCrossingInfo(query) {
        return null;
    }
};
exports.IcelandRoadStatusAdapter = IcelandRoadStatusAdapter;
exports.IcelandRoadStatusAdapter = IcelandRoadStatusAdapter = IcelandRoadStatusAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], IcelandRoadStatusAdapter);
//# sourceMappingURL=iceland-road-status.adapter.js.map