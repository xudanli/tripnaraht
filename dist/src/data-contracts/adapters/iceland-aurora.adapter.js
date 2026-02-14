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
var IcelandAuroraAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IcelandAuroraAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const base_adapter_1 = require("./base.adapter");
const http_client_factory_1 = require("../../common/utils/http-client.factory");
let IcelandAuroraAdapter = IcelandAuroraAdapter_1 = class IcelandAuroraAdapter extends base_adapter_1.BaseAdapter {
    constructor(configService) {
        super(IcelandAuroraAdapter_1.name, {
            timeout: 10000,
        });
        this.configService = configService;
        this.auroraReachUrl = 'https://api.aurorareach.com';
        this.noaaUrl = 'https://services.swpc.noaa.gov';
        this.openWeatherClient = http_client_factory_1.HttpClientFactory.create({
            baseURL: 'https://api.openweathermap.org/data/2.5',
            timeout: 10000,
        });
    }
    async getAuroraKPIndex() {
        return this.safeRequest(async () => {
            try {
                const response = await this.httpClient.get(`${this.auroraReachUrl}/kp`, {
                    params: {
                        format: 'json',
                    },
                });
                if (response.data && response.data.kp !== undefined) {
                    return response.data.kp;
                }
            }
            catch (auroraError) {
                this.logger.debug('AuroraReach API 不可用，尝试 NOAA');
            }
            const noaaResponse = await this.httpClient.get(`${this.noaaUrl}/json/rtsw/rtsw_mag_1m.json`);
            const noaaData = noaaResponse.data;
            if (noaaData && noaaData.kp !== undefined) {
                return noaaData.kp;
            }
            return 3;
        }, '获取极光 KP 指数失败', 3);
    }
    async getCloudCover(lat, lng) {
        return this.safeRequest(async () => {
            var _a, _b;
            const apiKey = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('OPENWEATHER_API_KEY');
            if (!apiKey) {
                this.logger.warn('OPENWEATHER_API_KEY 未配置，无法获取云层覆盖');
                return 50;
            }
            const response = await this.openWeatherClient.get('/weather', {
                params: {
                    lat,
                    lon: lng,
                    appid: apiKey,
                    units: 'metric',
                },
            });
            const cloudCover = ((_b = response.data.clouds) === null || _b === void 0 ? void 0 : _b.all) || 0;
            return cloudCover;
        }, '获取云层覆盖失败', 50);
    }
    async calculateAuroraVisibility(lat, lng, kpIndex, cloudCover) {
        return this.safeRequest(async () => {
            const kp = kpIndex !== undefined ? kpIndex : await this.getAuroraKPIndex();
            const cloud = cloudCover !== undefined ? cloudCover : await this.getCloudCover(lat, lng);
            if (kp < 3) {
                return 'none';
            }
            if (cloud > 70) {
                return 'none';
            }
            if (kp >= 5 && cloud < 20) {
                return 'high';
            }
            if (kp >= 4 && cloud < 30) {
                return 'moderate';
            }
            return 'low';
        }, '计算极光可见性失败', 'none');
    }
    async getAuroraForecast(lat, lng, hours = 24) {
        return this.safeRequest(async () => {
            const forecast = [];
            const kpIndex = await this.getAuroraKPIndex();
            const cloudCover = await this.getCloudCover(lat, lng);
            const visibility = await this.calculateAuroraVisibility(lat, lng, kpIndex, cloudCover);
            forecast.push({
                time: new Date(),
                kpIndex,
                cloudCover,
                visibility,
            });
            return forecast;
        }, '获取极光预测失败', []);
    }
};
exports.IcelandAuroraAdapter = IcelandAuroraAdapter;
exports.IcelandAuroraAdapter = IcelandAuroraAdapter = IcelandAuroraAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], IcelandAuroraAdapter);
//# sourceMappingURL=iceland-aurora.adapter.js.map