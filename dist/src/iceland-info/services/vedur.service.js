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
var VedurService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VedurService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const http_client_factory_1 = require("../../common/utils/http-client.factory");
const vedur_weather_dto_1 = require("../dto/vedur-weather.dto");
let VedurService = VedurService_1 = class VedurService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(VedurService_1.name);
        this.baseURL = 'https://api.vedur.is';
        this.httpClient = http_client_factory_1.HttpClientFactory.create({
            baseURL: this.baseURL,
            timeout: 10000,
        });
    }
    async getHighlandWeather(query) {
        try {
            const region = query.region || vedur_weather_dto_1.HighlandRegion.CENTRAL_HIGHLANDS;
            try {
                const response = await this.httpClient.get('/weather/forecasts/areas', {
                    params: {
                        area: region,
                    },
                });
                return this.parseVedurResponse(response.data, query);
            }
            catch (apiError) {
                this.logger.warn(`vedur.is API调用失败: ${apiError.message}，使用模拟数据`);
                return this.getMockWeatherData(query);
            }
        }
        catch (error) {
            this.logger.error(`获取vedur.is天气数据失败: ${error.message}`);
            throw error;
        }
    }
    parseVedurResponse(data, query) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        return {
            station: {
                id: ((_a = data.station) === null || _a === void 0 ? void 0 : _a.id) || 'highland-central',
                name: ((_b = data.station) === null || _b === void 0 ? void 0 : _b.name) || 'Central Highlands',
                lat: ((_c = data.station) === null || _c === void 0 ? void 0 : _c.lat) || 64.5,
                lng: ((_d = data.station) === null || _d === void 0 ? void 0 : _d.lng) || -18.5,
                elevation: ((_e = data.station) === null || _e === void 0 ? void 0 : _e.elevation) || 800,
            },
            current: {
                datetime: new Date().toISOString(),
                temperature: ((_f = data.current) === null || _f === void 0 ? void 0 : _f.temperature) || 5,
                windSpeed: ((_g = data.current) === null || _g === void 0 ? void 0 : _g.windSpeed) || 8,
                windDirection: ((_h = data.current) === null || _h === void 0 ? void 0 : _h.windDirection) || 180,
                windSpeedKmh: (((_j = data.current) === null || _j === void 0 ? void 0 : _j.windSpeed) || 8) * 3.6,
                precipitation: ((_k = data.current) === null || _k === void 0 ? void 0 : _k.precipitation) || 0,
                condition: ((_l = data.current) === null || _l === void 0 ? void 0 : _l.condition) || 'cloudy',
                visibility: ((_m = data.current) === null || _m === void 0 ? void 0 : _m.visibility) || 10000,
            },
            forecast: (data.forecast || []).map((item) => ({
                datetime: item.datetime || new Date().toISOString(),
                temperature: item.temperature || 5,
                windSpeed: item.windSpeed || 8,
                windDirection: item.windDirection || 180,
                windSpeedKmh: (item.windSpeed || 8) * 3.6,
                precipitation: item.precipitation || 0,
                condition: item.condition || 'cloudy',
                visibility: item.visibility || 10000,
            })),
            lastUpdated: data.lastUpdated || new Date().toISOString(),
            source: 'vedur.is',
        };
    }
    getMockWeatherData(query) {
        const region = query.region || vedur_weather_dto_1.HighlandRegion.CENTRAL_HIGHLANDS;
        const regionNames = {
            [vedur_weather_dto_1.HighlandRegion.CENTRAL_HIGHLANDS]: 'Central Highlands',
            [vedur_weather_dto_1.HighlandRegion.SOUTH_HIGHLANDS]: 'South Highlands',
            [vedur_weather_dto_1.HighlandRegion.NORTH_HIGHLANDS]: 'North Highlands',
        };
        const forecast = Array.from({ length: 6 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() + i);
            return {
                datetime: date.toISOString(),
                temperature: 5 + Math.random() * 10 - 5,
                windSpeed: 8 + Math.random() * 10,
                windDirection: Math.random() * 360,
                windSpeedKmh: (8 + Math.random() * 10) * 3.6,
                precipitation: Math.random() * 50,
                condition: ['sunny', 'cloudy', 'rainy', 'windy'][Math.floor(Math.random() * 4)],
                visibility: 5000 + Math.random() * 15000,
            };
        });
        return {
            station: {
                id: `highland-${region}`,
                name: regionNames[region],
                lat: query.lat || 64.5,
                lng: query.lng || -18.5,
                elevation: 800,
            },
            current: forecast[0],
            forecast: forecast,
            lastUpdated: new Date().toISOString(),
            source: 'vedur.is (mock)',
        };
    }
};
exports.VedurService = VedurService;
exports.VedurService = VedurService = VedurService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], VedurService);
//# sourceMappingURL=vedur.service.js.map