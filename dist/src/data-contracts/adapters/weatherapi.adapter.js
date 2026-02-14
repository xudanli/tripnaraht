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
var WeatherApiAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherApiAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const base_adapter_1 = require("./base.adapter");
const http_client_factory_1 = require("../../common/utils/http-client.factory");
const adapter_mapper_util_1 = require("../../common/utils/adapter-mapper.util");
let WeatherApiAdapter = WeatherApiAdapter_1 = class WeatherApiAdapter extends base_adapter_1.BaseAdapter {
    constructor(configService) {
        const apiKey = configService === null || configService === void 0 ? void 0 : configService.get('WEATHERAPI_API_KEY');
        super(WeatherApiAdapter_1.name, {
            baseURL: 'http://api.weatherapi.com/v1',
            timeout: 10000,
        });
        this.configService = configService;
        this.apiKey = apiKey;
        this.httpClient = http_client_factory_1.HttpClientFactory.create({
            baseURL: 'http://api.weatherapi.com/v1',
            timeout: 10000,
            params: {
                key: apiKey || '',
            },
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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
        try {
            if (!this.apiKey) {
                throw new Error('WEATHERAPI_API_KEY 未配置');
            }
            const q = `${query.lat},${query.lng}`;
            const response = await this.httpClient.get('/current.json', {
                params: {
                    q,
                    aqi: 'yes',
                },
            });
            const data = response.data;
            const weatherData = {
                temperature: ((_a = data.current) === null || _a === void 0 ? void 0 : _a.temp_c) || 0,
                feelsLikeTemperature: (_b = data.current) === null || _b === void 0 ? void 0 : _b.feelslike_c,
                condition: this.mapWeatherCondition((_d = (_c = data.current) === null || _c === void 0 ? void 0 : _c.condition) === null || _d === void 0 ? void 0 : _d.text),
                windSpeed: ((_e = data.current) === null || _e === void 0 ? void 0 : _e.wind_kph) ? data.current.wind_kph / 3.6 : undefined,
                windDirection: (_f = data.current) === null || _f === void 0 ? void 0 : _f.wind_degree,
                humidity: (_g = data.current) === null || _g === void 0 ? void 0 : _g.humidity,
                visibility: ((_h = data.current) === null || _h === void 0 ? void 0 : _h.vis_km) ? data.current.vis_km * 1000 : undefined,
                alerts: this.extractAlerts(data),
                lastUpdated: new Date(((_j = data.current) === null || _j === void 0 ? void 0 : _j.last_updated) || Date.now()),
                source: 'weatherapi',
                metadata: {
                    weatherapiLocation: data.location,
                    uv: (_k = data.current) === null || _k === void 0 ? void 0 : _k.uv,
                    pressure: (_l = data.current) === null || _l === void 0 ? void 0 : _l.pressure_mb,
                    airQuality: (_m = data.current) === null || _m === void 0 ? void 0 : _m.air_quality,
                    conditionCode: (_p = (_o = data.current) === null || _o === void 0 ? void 0 : _o.condition) === null || _p === void 0 ? void 0 : _p.code,
                    conditionIcon: (_r = (_q = data.current) === null || _q === void 0 ? void 0 : _q.condition) === null || _r === void 0 ? void 0 : _r.icon,
                },
            };
            return weatherData;
        }
        catch (error) {
            if (((_s = error.response) === null || _s === void 0 ? void 0 : _s.status) === 403 || ((_t = error.response) === null || _t === void 0 ? void 0 : _t.status) === 401) {
                this.logger.warn(`WeatherAPI 认证失败 (${(_u = error.response) === null || _u === void 0 ? void 0 : _u.status}): ${((_x = (_w = (_v = error.response) === null || _v === void 0 ? void 0 : _v.data) === null || _w === void 0 ? void 0 : _w.error) === null || _x === void 0 ? void 0 : _x.message) || error.message}，将降级到其他适配器`);
                throw new Error(`WeatherAPI 认证失败: ${((_0 = (_z = (_y = error.response) === null || _y === void 0 ? void 0 : _y.data) === null || _z === void 0 ? void 0 : _z.error) === null || _0 === void 0 ? void 0 : _0.message) || 'API Key 无效或配额用尽'}`);
            }
            this.logger.error(`获取 WeatherAPI 天气数据失败: ${error.message}`);
            throw error;
        }
    }
    getSupportedCountries() {
        return ['*'];
    }
    getPriority() {
        return 50;
    }
    getName() {
        return 'WeatherAPI.com';
    }
    mapWeatherCondition(conditionText) {
        if (!conditionText) {
            return 'unknown';
        }
        const text = conditionText.toLowerCase();
        const conditionMap = {
            'sunny': 'sunny',
            'clear': 'sunny',
            'partly cloudy': 'cloudy',
            'cloudy': 'cloudy',
            'overcast': 'cloudy',
            'mist': 'foggy',
            'fog': 'foggy',
            'patchy rain possible': 'rainy',
            'patchy light rain': 'rainy',
            'light rain': 'rainy',
            'moderate rain': 'rainy',
            'heavy rain': 'rainy',
            'moderate or heavy rain shower': 'rainy',
            'torrential rain shower': 'rainy',
            'patchy light snow': 'snowy',
            'light snow': 'snowy',
            'moderate snow': 'snowy',
            'heavy snow': 'snowy',
            'blizzard': 'snowy',
            'patchy light snow with thunder': 'stormy',
            'moderate or heavy snow with thunder': 'stormy',
            'thundery outbreaks possible': 'stormy',
            'moderate or heavy rain with thunder': 'stormy',
            'haze': 'hazy',
            'windy': 'windy',
        };
        if (conditionMap[text]) {
            return conditionMap[text];
        }
        if (text.includes('rain')) {
            return 'rainy';
        }
        if (text.includes('snow')) {
            return 'snowy';
        }
        if (text.includes('cloud')) {
            return 'cloudy';
        }
        if (text.includes('thunder') || text.includes('storm')) {
            return 'stormy';
        }
        if (text.includes('fog') || text.includes('mist')) {
            return 'foggy';
        }
        if (text.includes('sun') || text.includes('clear')) {
            return 'sunny';
        }
        if (text.includes('wind')) {
            return 'windy';
        }
        return adapter_mapper_util_1.AdapterMapper.mapWeatherCondition(conditionText);
    }
    extractAlerts(data) {
        const alerts = [];
        const current = data.current;
        if (!current) {
            return alerts;
        }
        if (current.temp_c > 35) {
            alerts.push({
                type: 'heat',
                severity: 'warning',
                title: '高温警告',
                description: `温度高达 ${current.temp_c}°C，请注意防暑降温`,
                effectiveTime: new Date(),
            });
        }
        if (current.temp_c < -10) {
            alerts.push({
                type: 'cold',
                severity: 'warning',
                title: '低温警告',
                description: `温度低至 ${current.temp_c}°C，请注意保暖`,
                effectiveTime: new Date(),
            });
        }
        const windSpeedMs = current.wind_kph ? current.wind_kph / 3.6 : 0;
        if (windSpeedMs > 15) {
            alerts.push({
                type: 'wind',
                severity: windSpeedMs > 25 ? 'critical' : 'warning',
                title: '强风警告',
                description: `风速 ${current.wind_kph} km/h，请注意安全`,
                effectiveTime: new Date(),
            });
        }
        if (current.vis_km && current.vis_km < 1) {
            alerts.push({
                type: 'visibility',
                severity: 'warning',
                title: '低能见度警告',
                description: `能见度仅 ${current.vis_km} km，请注意行车安全`,
                effectiveTime: new Date(),
            });
        }
        return alerts;
    }
};
exports.WeatherApiAdapter = WeatherApiAdapter;
exports.WeatherApiAdapter = WeatherApiAdapter = WeatherApiAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], WeatherApiAdapter);
//# sourceMappingURL=weatherapi.adapter.js.map