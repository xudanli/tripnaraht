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
var DefaultWeatherAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultWeatherAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const base_adapter_1 = require("./base.adapter");
const http_client_factory_1 = require("../../common/utils/http-client.factory");
const adapter_mapper_util_1 = require("../../common/utils/adapter-mapper.util");
let DefaultWeatherAdapter = DefaultWeatherAdapter_1 = class DefaultWeatherAdapter extends base_adapter_1.BaseAdapter {
    constructor(configService) {
        const apiKey = configService === null || configService === void 0 ? void 0 : configService.get('OPENWEATHER_API_KEY');
        super(DefaultWeatherAdapter_1.name, {
            baseURL: 'https://api.openweathermap.org/data/2.5',
            timeout: 10000,
        });
        this.configService = configService;
        this.apiKey = apiKey;
        this.httpClient = http_client_factory_1.HttpClientFactory.createWithApiKey(apiKey, {
            baseURL: 'https://api.openweathermap.org/data/2.5',
            timeout: 10000,
            paramName: 'appid',
            additionalParams: { units: 'metric' },
        });
        this.httpClient.defaults.proxy = false;
        if (this.httpClient.defaults.httpAgent) {
            delete this.httpClient.defaults.httpAgent;
        }
        if (this.httpClient.defaults.httpsAgent) {
            delete this.httpClient.defaults.httpsAgent;
        }
    }
    async getWeather(query) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        try {
            const response = await this.httpClient.get('/weather', {
                params: {
                    lat: query.lat,
                    lon: query.lng,
                },
            });
            const data = response.data;
            const weatherData = {
                temperature: ((_a = data.main) === null || _a === void 0 ? void 0 : _a.temp) || 0,
                feelsLikeTemperature: (_b = data.main) === null || _b === void 0 ? void 0 : _b.feels_like,
                condition: this.mapWeatherCondition((_d = (_c = data.weather) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.main),
                windSpeed: (_e = data.wind) === null || _e === void 0 ? void 0 : _e.speed,
                windDirection: (_f = data.wind) === null || _f === void 0 ? void 0 : _f.deg,
                humidity: (_g = data.main) === null || _g === void 0 ? void 0 : _g.humidity,
                visibility: data.visibility ? data.visibility / 1000 : undefined,
                alerts: this.extractAlerts(data),
                lastUpdated: new Date(),
                source: 'openweather',
                metadata: {
                    openweatherId: data.id,
                    timezone: data.timezone,
                },
            };
            return weatherData;
        }
        catch (error) {
            if (((_h = error.response) === null || _h === void 0 ? void 0 : _h.status) === 403 || ((_j = error.response) === null || _j === void 0 ? void 0 : _j.status) === 401) {
                this.logger.warn(`OpenWeather 认证失败 (${(_k = error.response) === null || _k === void 0 ? void 0 : _k.status}): ${((_m = (_l = error.response) === null || _l === void 0 ? void 0 : _l.data) === null || _m === void 0 ? void 0 : _m.message) || error.message}，将降级到其他适配器`);
                throw new Error(`OpenWeather 认证失败: ${((_p = (_o = error.response) === null || _o === void 0 ? void 0 : _o.data) === null || _p === void 0 ? void 0 : _p.message) || 'API Key 无效或配额用尽'}`);
            }
            this.logger.error(`获取 OpenWeather 天气数据失败: ${error.message}`);
            throw error;
        }
    }
    getSupportedCountries() {
        return ['*'];
    }
    getPriority() {
        return 100;
    }
    getName() {
        return 'OpenWeather (Default)';
    }
    mapWeatherCondition(condition) {
        return adapter_mapper_util_1.AdapterMapper.mapWeatherCondition(condition);
    }
    extractAlerts(data) {
        return [];
    }
};
exports.DefaultWeatherAdapter = DefaultWeatherAdapter;
exports.DefaultWeatherAdapter = DefaultWeatherAdapter = DefaultWeatherAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DefaultWeatherAdapter);
//# sourceMappingURL=default-weather.adapter.js.map