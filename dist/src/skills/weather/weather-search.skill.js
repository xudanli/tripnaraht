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
var WeatherSearchSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherSearchSkill = void 0;
const common_1 = require("@nestjs/common");
const skill_decorator_1 = require("../decorators/skill.decorator");
const data_source_router_service_1 = require("../../data-contracts/services/data-source-router.service");
const iceland_comprehensive_service_1 = require("../../data-contracts/services/iceland-comprehensive.service");
let WeatherSearchSkill = WeatherSearchSkill_1 = class WeatherSearchSkill {
    constructor(dataSourceRouter, icelandComprehensiveService) {
        this.dataSourceRouter = dataSourceRouter;
        this.icelandComprehensiveService = icelandComprehensiveService;
        this.logger = new common_1.Logger(WeatherSearchSkill_1.name);
        this.metadata = {
            name: 'weather.search',
            description: '查询指定地点的天气预报信息（当前天气或未来预报）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['lat', 'lng'],
                typeChecks: {
                    lat: { type: 'number', min: -90, max: 90 },
                    lng: { type: 'number', min: -180, max: 180 },
                    date: { type: 'string', format: 'date' },
                },
            },
        };
        this.logger.log(`[WeatherSearchSkill] 已初始化`);
    }
    async execute(input) {
        this.logger.debug(`执行 weather.search: lat=${input.lat}, lng=${input.lng}, date=${input.date || 'current'}, location=${input.locationName || 'unknown'}`);
        try {
            if (input.lat == null || input.lng == null) {
                throw new Error('必须提供 lat 和 lng 坐标');
            }
            if (input.lat < -90 || input.lat > 90) {
                throw new Error(`纬度必须在 -90 到 90 之间，当前值: ${input.lat}`);
            }
            if (input.lng < -180 || input.lng > 180) {
                throw new Error(`经度必须在 -180 到 180 之间，当前值: ${input.lng}`);
            }
            const weatherQuery = {
                lat: input.lat,
                lng: input.lng,
                date: input.date,
                timezone: input.timezone,
                includeWindDetails: input.includeWindDetails,
                includeAuroraInfo: input.includeAuroraInfo,
            };
            let weatherData;
            if ((input.includeWindDetails || input.includeAuroraInfo) &&
                this.icelandComprehensiveService) {
                try {
                    weatherData = await this.icelandComprehensiveService.getComprehensiveWeather(weatherQuery);
                    this.logger.debug(`使用冰岛综合服务获取天气数据: ${weatherData.source}`);
                }
                catch (error) {
                    this.logger.warn(`冰岛综合服务失败: ${error === null || error === void 0 ? void 0 : error.message}，降级到标准天气服务`);
                    if (!this.dataSourceRouter) {
                        throw new Error('DataSourceRouterService 不可用');
                    }
                    weatherData = await this.dataSourceRouter.getWeather(weatherQuery);
                }
            }
            else {
                if (!this.dataSourceRouter) {
                    throw new Error('DataSourceRouterService 不可用');
                }
                weatherData = await this.dataSourceRouter.getWeather(weatherQuery);
            }
            const evidenceId = `weather_${input.lat}_${input.lng}_${input.date || 'current'}_${Date.now()}`;
            const impactAssessment = this.assessWeatherImpact(weatherData);
            const recommendations = this.generateRecommendations(weatherData, impactAssessment);
            const output = {
                weather: weatherData,
                evidence_id: evidenceId,
                source: weatherData.source,
                location: {
                    lat: input.lat,
                    lng: input.lng,
                    name: input.locationName,
                },
                query: {
                    date: input.date,
                    timezone: input.timezone,
                },
                impact_assessment: impactAssessment,
                recommendations,
            };
            this.logger.debug(`weather.search 成功: source=${weatherData.source}, temperature=${weatherData.temperature}°C, condition=${weatherData.condition}`);
            return output;
        }
        catch (error) {
            this.logger.error(`weather.search 失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    assessWeatherImpact(weather) {
        var _a;
        const assessment = {
            outdoor_activities: 'suitable',
            transportation: 'normal',
            safety_risks: [],
        };
        if (weather.condition === 'rainy' || weather.condition === 'snowy') {
            assessment.outdoor_activities = 'moderate';
        }
        else if (weather.condition === 'storm' || weather.condition === 'extreme') {
            assessment.outdoor_activities = 'unsuitable';
        }
        if (weather.windSpeed && weather.windSpeed > 15) {
            assessment.transportation = 'delayed';
        }
        if (weather.visibility && weather.visibility < 1) {
            assessment.transportation = 'disrupted';
        }
        if (weather.alerts && weather.alerts.length > 0) {
            assessment.safety_risks = weather.alerts.map((alert) => ({
                type: alert.type,
                severity: alert.severity,
                description: alert.description,
            }));
            const hasCriticalAlert = weather.alerts.some((a) => a.severity === 'critical');
            if (hasCriticalAlert) {
                assessment.outdoor_activities = 'unsuitable';
                assessment.transportation = 'disrupted';
            }
        }
        if ('windGust' in weather && weather.windGust && weather.windGust > 20) {
            (_a = assessment.safety_risks) === null || _a === void 0 ? void 0 : _a.push({
                type: 'wind',
                severity: 'warning',
                description: `强阵风警告：阵风速度 ${weather.windGust} m/s，可能影响户外活动安全`,
            });
            assessment.outdoor_activities = 'moderate';
        }
        return assessment;
    }
    generateRecommendations(weather, impact) {
        const recommendations = [];
        if (weather.condition === 'rainy' || weather.condition === 'snowy') {
            recommendations.push('建议携带雨具或防雪装备');
        }
        if (weather.condition === 'sunny' && weather.temperature > 25) {
            recommendations.push('天气炎热，建议携带防晒用品和充足饮水');
        }
        if (weather.condition === 'sunny' && weather.temperature < 5) {
            recommendations.push('天气寒冷，建议穿着保暖衣物');
        }
        if (weather.windSpeed && weather.windSpeed > 10) {
            recommendations.push('风速较大，建议注意防风保暖');
        }
        if ('windGust' in weather && weather.windGust && weather.windGust > 20) {
            recommendations.push('强阵风警告，户外活动需格外小心');
        }
        if (weather.visibility && weather.visibility < 2) {
            recommendations.push('能见度较低，自驾需谨慎，建议减速慢行');
        }
        if ((impact === null || impact === void 0 ? void 0 : impact.outdoor_activities) === 'unsuitable') {
            recommendations.push('当前天气不适合户外活动，建议改为室内活动或调整行程');
        }
        if ((impact === null || impact === void 0 ? void 0 : impact.transportation) === 'disrupted') {
            recommendations.push('天气可能影响交通，建议提前查询交通状况并预留充足时间');
        }
        if (weather.alerts && weather.alerts.length > 0) {
            const criticalAlerts = weather.alerts.filter((a) => a.severity === 'critical');
            if (criticalAlerts.length > 0) {
                recommendations.push(`严重天气警报：${criticalAlerts.map((a) => a.title).join('、')}，建议密切关注天气变化`);
            }
        }
        if ('auroraVisibility' in weather && weather.auroraVisibility === 'high') {
            recommendations.push('极光可见性高，适合观赏极光');
        }
        return recommendations;
    }
};
exports.WeatherSearchSkill = WeatherSearchSkill;
exports.WeatherSearchSkill = WeatherSearchSkill = WeatherSearchSkill_1 = __decorate([
    (0, skill_decorator_1.Skill)({
        name: 'weather.search',
        description: '查询指定地点的天气预报信息（当前天气或未来预报）',
        version: '1.0.0',
        category: 'trip',
        toolGroup: 'DOMAIN',
    }),
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [data_source_router_service_1.DataSourceRouterService,
        iceland_comprehensive_service_1.IcelandComprehensiveService])
], WeatherSearchSkill);
//# sourceMappingURL=weather-search.skill.js.map