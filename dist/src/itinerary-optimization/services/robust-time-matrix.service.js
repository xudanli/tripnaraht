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
var RobustTimeMatrixService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RobustTimeMatrixService = void 0;
const common_1 = require("@nestjs/common");
const smart_routes_service_1 = require("../../transport/services/smart-routes.service");
const route_cache_service_1 = require("../../transport/services/route-cache.service");
let RobustTimeMatrixService = RobustTimeMatrixService_1 = class RobustTimeMatrixService {
    constructor(smartRoutesService, routeCacheService) {
        this.smartRoutesService = smartRoutesService;
        this.routeCacheService = routeCacheService;
        this.logger = new common_1.Logger(RobustTimeMatrixService_1.name);
    }
    async computeRobustTimeMatrix(nodes, transportPolicy = {}) {
        var _a, _b, _c;
        const bufferFactor = (_a = transportPolicy.buffer_factor) !== null && _a !== void 0 ? _a : 1.2;
        const fixedBuffer = (_b = transportPolicy.fixed_buffer_min) !== null && _b !== void 0 ? _b : 15;
        const crossRegionCost = (_c = transportPolicy.cross_region_cost_min) !== null && _c !== void 0 ? _c : 8;
        const n = nodes.length;
        const apiMatrix = [];
        const bufferMatrix = [];
        const switchMatrix = [];
        const crossRegionMatrix = [];
        const robustMatrix = [];
        this.logger.debug(`计算鲁棒时间矩阵：${n} 个节点`);
        for (let i = 0; i < n; i++) {
            apiMatrix[i] = [];
            bufferMatrix[i] = [];
            switchMatrix[i] = [];
            crossRegionMatrix[i] = [];
            robustMatrix[i] = [];
        }
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    apiMatrix[i][j] = 0;
                    bufferMatrix[i][j] = 0;
                    switchMatrix[i][j] = 0;
                    crossRegionMatrix[i][j] = 0;
                    robustMatrix[i][j] = 0;
                    continue;
                }
                const from = nodes[i];
                const to = nodes[j];
                const apiTime = await this.getApiTime(from.geo, to.geo, 'TRANSIT');
                apiMatrix[i][j] = apiTime;
                const bufferTime = Math.round(apiTime * bufferFactor) - apiTime;
                bufferMatrix[i][j] = bufferTime;
                const switchCost = this.calculateSwitchCost(from, to, transportPolicy.switch_cost_min);
                switchMatrix[i][j] = switchCost;
                const crossRegionPenalty = this.calculateCrossRegionPenalty(from, to, crossRegionCost);
                crossRegionMatrix[i][j] = crossRegionPenalty;
                robustMatrix[i][j] = Math.round(apiTime * bufferFactor + fixedBuffer + switchCost + crossRegionPenalty);
            }
        }
        return {
            unit: 'minute',
            base: 'api_duration',
            robust_policy: {
                buffer_factor: bufferFactor,
                fixed_buffer_min: fixedBuffer,
            },
            matrix: robustMatrix,
            components: {
                api: apiMatrix,
                buffer: bufferMatrix,
                fixed: fixedBuffer,
                switch: switchMatrix,
                cross_region: crossRegionMatrix,
            },
        };
    }
    async getApiTime(from, to, travelMode) {
        try {
            const cached = await this.routeCacheService.getCachedRoute(from.lat, from.lng, to.lat, to.lng, travelMode);
            if (cached) {
                return cached.durationMinutes;
            }
            const options = await this.smartRoutesService.getRoutes(from.lat, from.lng, to.lat, to.lng, travelMode);
            if (options.length > 0) {
                const duration = options[0].durationMinutes;
                await this.routeCacheService.saveCachedRoute(from.lat, from.lng, to.lat, to.lng, travelMode, options[0]);
                return duration;
            }
            return this.fallbackEstimateTime(from, to, travelMode);
        }
        catch (error) {
            this.logger.warn(`获取交通时间失败: ${error}`);
            return this.fallbackEstimateTime(from, to, travelMode);
        }
    }
    calculateSwitchCost(from, to, switchCostMap) {
        var _a;
        if (!switchCostMap) {
            return 0;
        }
        const fromMode = this.inferTravelMode(from);
        const toMode = this.inferTravelMode(to);
        if (fromMode === toMode) {
            return 0;
        }
        const key = `${fromMode}->${toMode}`;
        return (_a = switchCostMap[key]) !== null && _a !== void 0 ? _a : 0;
    }
    inferTravelMode(node) {
        var _a, _b, _c, _d;
        if (((_b = (_a = node.meta) === null || _a === void 0 ? void 0 : _a.tags) === null || _b === void 0 ? void 0 : _b.includes('metro')) || ((_d = (_c = node.meta) === null || _c === void 0 ? void 0 : _c.tags) === null || _d === void 0 ? void 0 : _d.includes('station'))) {
            return 'metro';
        }
        if (node.type === 'restaurant' || node.type === 'poi') {
            return 'walk';
        }
        return 'walk';
    }
    calculateCrossRegionPenalty(from, to, penalty) {
        var _a, _b;
        if (!((_a = from.meta) === null || _a === void 0 ? void 0 : _a.region_id) || !((_b = to.meta) === null || _b === void 0 ? void 0 : _b.region_id)) {
            return 0;
        }
        if (from.meta.region_id === to.meta.region_id) {
            return 0;
        }
        return penalty;
    }
    fallbackEstimateTime(from, to, travelMode) {
        const distance = this.calculateDistance(from, to);
        switch (travelMode) {
            case 'WALKING':
                return Math.round((distance / 1000 / 5) * 60);
            case 'DRIVING':
                return Math.round((distance / 1000 / 25) * 60);
            case 'TRANSIT':
            default:
                if (distance < 5000) {
                    return Math.round((distance / 1000 / 30) * 60);
                }
                else {
                    return Math.round((distance / 1000 / 40) * 60);
                }
        }
    }
    calculateDistance(point1, point2) {
        const R = 6371000;
        const dLat = this.toRadians(point2.lat - point1.lat);
        const dLng = this.toRadians(point2.lng - point1.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(point1.lat)) *
                Math.cos(this.toRadians(point2.lat)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
};
exports.RobustTimeMatrixService = RobustTimeMatrixService;
exports.RobustTimeMatrixService = RobustTimeMatrixService = RobustTimeMatrixService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [smart_routes_service_1.SmartRoutesService,
        route_cache_service_1.RouteCacheService])
], RobustTimeMatrixService);
//# sourceMappingURL=robust-time-matrix.service.js.map