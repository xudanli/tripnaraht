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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AmapRoutesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmapRoutesService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const transport_interface_1 = require("../interfaces/transport.interface");
let AmapRoutesService = AmapRoutesService_1 = class AmapRoutesService {
    constructor(configService) {
        var _a;
        this.configService = configService;
        this.logger = new common_1.Logger(AmapRoutesService_1.name);
        this.baseUrl = 'https://restapi.amap.com/v3/direction';
        this.apiKey = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('AMAP_API_KEY');
        this.axiosInstance = axios_1.default.create({
            timeout: 10000,
            params: {
                key: this.apiKey || '',
            },
        });
    }
    async getRoutes(fromLat, fromLng, toLat, toLng, travelMode = 'transit', preferences) {
        if (!this.apiKey) {
            this.logger.debug('高德地图 API Key 未配置，使用估算数据');
            return [];
        }
        try {
            let apiPath;
            let params = {
                origin: `${fromLng},${fromLat}`,
                destination: `${toLng},${toLat}`,
            };
            switch (travelMode) {
                case 'transit':
                    apiPath = '/transit/integrated';
                    params.extensions = 'all';
                    if (preferences === null || preferences === void 0 ? void 0 : preferences.lessWalking) {
                        params.strategy = '2';
                    }
                    break;
                case 'walking':
                    apiPath = '/walking';
                    break;
                case 'driving':
                    apiPath = '/driving';
                    if (preferences === null || preferences === void 0 ? void 0 : preferences.avoidHighways) {
                        params.strategy = '2';
                    }
                    if (preferences === null || preferences === void 0 ? void 0 : preferences.avoidTolls) {
                        params.strategy = '3';
                    }
                    break;
                default:
                    apiPath = '/transit/integrated';
            }
            const response = await this.axiosInstance.get(this.baseUrl + apiPath, { params });
            return this.parseAmapResponse(response.data, travelMode);
        }
        catch (error) {
            this.logger.error(`高德地图 API 调用失败: ${error.message}`, error.stack);
            return [];
        }
    }
    parseAmapResponse(data, travelMode) {
        var _a, _b, _c, _d;
        const options = [];
        if (!data || data.status !== '1') {
            this.logger.warn(`高德地图 API 返回错误: ${(data === null || data === void 0 ? void 0 : data.info) || '未知错误'}`);
            return options;
        }
        if (travelMode === 'transit' && ((_a = data.route) === null || _a === void 0 ? void 0 : _a.transits)) {
            for (const transit of data.route.transits.slice(0, 3)) {
                const durationSeconds = typeof transit.duration === 'string'
                    ? parseInt(transit.duration, 10)
                    : (transit.duration || 0);
                const duration = Math.round(durationSeconds / 60);
                const distance = typeof transit.distance === 'string'
                    ? parseInt(transit.distance, 10)
                    : (transit.distance || 0);
                const cost = typeof transit.cost === 'string'
                    ? parseFloat(transit.cost)
                    : (transit.cost || 0);
                let walkDistance = parseInt(transit.walking_distance || '0', 10);
                if (walkDistance === 0 && transit.segments) {
                    for (const segment of transit.segments) {
                        if (segment.walking) {
                            const segDistance = typeof segment.walking.distance === 'string'
                                ? parseInt(segment.walking.distance, 10)
                                : (segment.walking.distance || 0);
                            walkDistance += segDistance;
                        }
                    }
                }
                const transitSegments = ((_b = transit.segments) === null || _b === void 0 ? void 0 : _b.filter((seg) => seg.bus || seg.railway || seg.subway)) || [];
                const transfers = Math.max(0, transitSegments.length - 1);
                this.logger.debug(`高德公交路线: 时长=${duration}分钟, 费用=${cost}元, 步行=${walkDistance}米, 换乘=${transfers}次`);
                options.push({
                    mode: transport_interface_1.TransportMode.TRANSIT,
                    durationMinutes: duration,
                    cost: Math.round(cost * 100),
                    walkDistance,
                    transfers: transfers > 0 ? transfers : undefined,
                    description: this.generateTransitDescription(transit, transfers),
                });
            }
        }
        else if (travelMode === 'walking' && ((_c = data.route) === null || _c === void 0 ? void 0 : _c.paths)) {
            const path = data.route.paths[0];
            if (path) {
                const duration = Math.round((path.duration || 0) / 60);
                const distance = path.distance || 0;
                options.push({
                    mode: transport_interface_1.TransportMode.WALKING,
                    durationMinutes: duration,
                    cost: 0,
                    walkDistance: distance,
                    description: `步行：约 ${Math.round(distance / 1000 * 10) / 10} 公里`,
                });
            }
        }
        else if (travelMode === 'driving' && ((_d = data.route) === null || _d === void 0 ? void 0 : _d.paths)) {
            const path = data.route.paths[0];
            if (path) {
                const duration = Math.round((path.duration || 0) / 60);
                const distance = path.distance || 0;
                const tolls = path.tolls || 0;
                const tollDistance = path.toll_distance || 0;
                const estimatedCost = this.estimateTaxiCost(distance, duration);
                options.push({
                    mode: transport_interface_1.TransportMode.TAXI,
                    durationMinutes: duration,
                    cost: Math.round(estimatedCost * 100),
                    walkDistance: 0,
                    description: `打车：约 ${Math.round(distance / 1000 * 10) / 10} 公里，${tolls > 0 ? `过路费 ${tolls} 元` : '无过路费'}`,
                });
            }
        }
        return options;
    }
    generateTransitDescription(transit, transfers) {
        if (transfers === 0) {
            return '公共交通：直达，无需换乘';
        }
        else if (transfers === 1) {
            return '公共交通：需要换乘 1 次';
        }
        else {
            return `公共交通：需要换乘 ${transfers} 次`;
        }
    }
    estimateTaxiCost(distanceMeters, durationMinutes) {
        const distanceKm = distanceMeters / 1000;
        if (distanceKm <= 3) {
            return 13;
        }
        return 13 + (distanceKm - 3) * 2.5;
    }
};
exports.AmapRoutesService = AmapRoutesService;
exports.AmapRoutesService = AmapRoutesService = AmapRoutesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AmapRoutesService);
//# sourceMappingURL=amap-routes.service.js.map