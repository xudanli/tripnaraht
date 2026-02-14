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
var IcelandWeatherAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IcelandWeatherAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const base_adapter_1 = require("./base.adapter");
const adapter_mapper_util_1 = require("../../common/utils/adapter-mapper.util");
let IcelandWeatherAdapter = IcelandWeatherAdapter_1 = class IcelandWeatherAdapter extends base_adapter_1.BaseAdapter {
    constructor(configService) {
        super(IcelandWeatherAdapter_1.name, {
            baseURL: 'http://apis.is',
            timeout: 15000,
        });
        this.configService = configService;
        this.majorStations = [
            { id: '1', name: 'Reykjavík', lat: 64.1470, lng: -21.9408 },
            { id: '422', name: 'Akureyri', lat: 65.6839, lng: -18.1105 },
            { id: '30', name: 'Egilsstaðir', lat: 65.2643, lng: -14.3948 },
            { id: '1480', name: 'Vestmannaeyjar', lat: 63.4427, lng: -20.2734 },
            { id: '1479', name: 'Höfn', lat: 64.2539, lng: -15.2083 },
        ];
        this.httpClient.defaults.proxy = false;
        if (this.httpClient.defaults.httpAgent) {
            delete this.httpClient.defaults.httpAgent;
        }
        if (this.httpClient.defaults.httpsAgent) {
            delete this.httpClient.defaults.httpsAgent;
        }
    }
    async getWeather(query) {
        var _a;
        try {
            const stationId = this.findNearestStation(query.lat, query.lng);
            const response = await this.httpClient.get('/weather/observations/en', {
                params: {
                    stations: stationId,
                    time: '1h',
                    anytime: '0',
                },
            });
            const data = response.data;
            if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
                throw new Error('未找到观测站数据');
            }
            const observation = data.results[0];
            const weatherData = await this.mapToWeatherData(observation, query);
            return weatherData;
        }
        catch (error) {
            if (error.code === 'CERT_HAS_EXPIRED' || ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('certificate'))) {
                this.logger.warn(`apis.is SSL 证书错误: ${error.message}，将降级到其他适配器`);
                throw new Error(`apis.is SSL 证书错误: ${error.message}`);
            }
            this.logger.error(`获取冰岛天气失败: ${error.message}`);
            throw error;
        }
    }
    getSupportedCountries() {
        return ['IS'];
    }
    getPriority() {
        return 10;
    }
    getName() {
        return 'Iceland apis.is (Vedur.is)';
    }
    findNearestStation(lat, lng) {
        let minDistance = Infinity;
        let nearestStation = this.majorStations[0];
        for (const station of this.majorStations) {
            const distance = this.calculateDistance(lat, lng, station.lat, station.lng);
            if (distance < minDistance) {
                minDistance = distance;
                nearestStation = station;
            }
        }
        this.logger.debug(`选择观测站: ${nearestStation.name} (${nearestStation.id}), 距离: ${minDistance.toFixed(2)} km`);
        return nearestStation.id;
    }
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(deg) {
        return deg * (Math.PI / 180);
    }
    async mapToWeatherData(observation, query) {
        const windDirection = this.parseWindDirection(observation.D);
        const weatherData = {
            temperature: parseFloat(observation.T) || 0,
            condition: this.mapWeatherCondition(observation.W),
            windSpeed: parseFloat(observation.F) || undefined,
            windDirection: windDirection,
            humidity: observation.RH ? parseFloat(observation.RH) : undefined,
            visibility: observation.V ? parseFloat(observation.V) * 1000 : undefined,
            alerts: this.extractAlerts(observation),
            lastUpdated: observation.time ? new Date(observation.time) : new Date(),
            source: 'apis.is',
            metadata: {
                stationName: observation.name,
                stationId: observation.id,
                windGust: observation.FG ? parseFloat(observation.FG) : undefined,
                maxWindSpeed: observation.FX ? parseFloat(observation.FX) : undefined,
                pressure: observation.P ? parseFloat(observation.P) : undefined,
                cloudCover: observation.N ? parseFloat(observation.N) : undefined,
                dewPoint: observation.TD ? parseFloat(observation.TD) : undefined,
                precipitation: observation.R ? parseFloat(observation.R) : undefined,
                rawData: observation,
                query: query,
            },
        };
        if (query.includeWindDetails || observation.FG) {
            weatherData.windGust = observation.FG ? parseFloat(observation.FG) : undefined;
            weatherData.cloudCover = observation.N ? parseFloat(observation.N) : undefined;
        }
        if (query.includeAuroraInfo) {
        }
        return weatherData;
    }
    parseWindDirection(direction) {
        var _a;
        if (!direction) {
            return undefined;
        }
        const directionMap = {
            'N': 0,
            'NNE': 22.5,
            'NE': 45,
            'ENE': 67.5,
            'E': 90,
            'ESE': 112.5,
            'SE': 135,
            'SSE': 157.5,
            'S': 180,
            'SSW': 202.5,
            'SW': 225,
            'WSW': 247.5,
            'W': 270,
            'WNW': 292.5,
            'NW': 315,
            'NNW': 337.5,
            'Calm': 0,
        };
        return (_a = directionMap[direction.toUpperCase()]) !== null && _a !== void 0 ? _a : undefined;
    }
    mapWeatherCondition(condition) {
        return adapter_mapper_util_1.AdapterMapper.mapWeatherCondition(condition);
    }
    extractAlerts(observation) {
        const alerts = [];
        const windGust = observation.FG ? parseFloat(observation.FG) : 0;
        if (windGust > 25) {
            alerts.push({
                type: 'wind',
                severity: 'critical',
                title: '极端强风警告',
                description: `阵风速度高达 ${windGust} m/s，请避免在户外活动，特别注意车门安全`,
                effectiveTime: observation.time ? new Date(observation.time) : new Date(),
            });
        }
        else if (windGust > 18) {
            alerts.push({
                type: 'wind',
                severity: 'warning',
                title: '强风警告',
                description: `阵风速度 ${windGust} m/s，请注意安全，小心车门被风吹开`,
                effectiveTime: observation.time ? new Date(observation.time) : new Date(),
            });
        }
        const visibility = observation.V ? parseFloat(observation.V) : undefined;
        if (visibility !== undefined && visibility < 1) {
            alerts.push({
                type: 'visibility',
                severity: 'warning',
                title: '低能见度警告',
                description: `能见度仅 ${visibility} km，请注意行车安全`,
                effectiveTime: observation.time ? new Date(observation.time) : new Date(),
            });
        }
        const temperature = parseFloat(observation.T) || 0;
        if (temperature < -10) {
            alerts.push({
                type: 'cold',
                severity: 'warning',
                title: '低温警告',
                description: `温度低至 ${temperature}°C，请注意保暖`,
                effectiveTime: observation.time ? new Date(observation.time) : new Date(),
            });
        }
        return alerts;
    }
    mapSeverity(severity) {
        return adapter_mapper_util_1.AdapterMapper.mapSeverity(severity);
    }
};
exports.IcelandWeatherAdapter = IcelandWeatherAdapter;
exports.IcelandWeatherAdapter = IcelandWeatherAdapter = IcelandWeatherAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], IcelandWeatherAdapter);
//# sourceMappingURL=iceland-weather.adapter.js.map