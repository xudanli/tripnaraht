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
var WeatherAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherAgentService = void 0;
const common_1 = require("@nestjs/common");
const data_source_router_service_1 = require("../../../data-contracts/services/data-source-router.service");
let WeatherAgentService = WeatherAgentService_1 = class WeatherAgentService {
    constructor(dataRouter) {
        this.dataRouter = dataRouter;
        this.logger = new common_1.Logger(WeatherAgentService_1.name);
        this.logger.log('[WeatherAgent] Initialized');
    }
    async getForecast(location, dateRange) {
        var _a, _b, _c, _d, _e;
        const evidence = [];
        const forecasts = [];
        try {
            if (this.dataRouter) {
                const weatherData = await this.dataRouter.getWeather({
                    lat: location.lat,
                    lng: location.lng,
                    date: dateRange.start,
                });
                if (weatherData) {
                    const startDate = new Date(dateRange.start);
                    const endDate = new Date(dateRange.end);
                    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    const temp = (_a = weatherData.temperature) !== null && _a !== void 0 ? _a : 10;
                    const windSpeedMs = (_b = weatherData.windSpeed) !== null && _b !== void 0 ? _b : 5;
                    const windSpeedKmh = windSpeedMs * 3.6;
                    const visibilityM = (_c = weatherData.visibility) !== null && _c !== void 0 ? _c : 10000;
                    const condition = (_d = weatherData.condition) !== null && _d !== void 0 ? _d : 'cloudy';
                    for (let i = 0; i < Math.min(days, 7); i++) {
                        const date = new Date(startDate);
                        date.setDate(date.getDate() + i);
                        const dateStr = date.toISOString().split('T')[0];
                        forecasts.push({
                            date: dateStr,
                            temperature: {
                                min: temp - 5,
                                max: temp + 5,
                            },
                            precipitation: {
                                probability: condition.includes('rain') || condition.includes('snow') ? 0.7 : 0.3,
                                type: condition.includes('snow') ? 'snow' : 'rain',
                                amount_mm: condition.includes('rain') ? 5 : condition.includes('snow') ? 3 : 0,
                            },
                            wind: {
                                speed_kmh: Math.round(windSpeedKmh),
                                gust_kmh: Math.round(windSpeedKmh * 1.5),
                                direction: this.degreeToDirection((_e = weatherData.windDirection) !== null && _e !== void 0 ? _e : 225),
                            },
                            visibility_km: Math.round(visibilityM / 1000),
                            travel_suitability: this.assessTravelSuitabilityFromData(weatherData),
                        });
                    }
                    evidence.push({
                        evidence_id: `weather_forecast_${Date.now()}`,
                        source: 'WeatherAgent.getForecast',
                        timestamp: new Date().toISOString(),
                        data: { location, days_requested: days, source: 'DATA_ROUTER' },
                    });
                }
            }
            if (forecasts.length === 0) {
                const startDate = new Date(dateRange.start);
                const endDate = new Date(dateRange.end);
                const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                for (let i = 0; i < Math.min(days, 7); i++) {
                    const date = new Date(startDate);
                    date.setDate(date.getDate() + i);
                    forecasts.push({
                        date: date.toISOString().split('T')[0],
                        temperature: { min: 5, max: 15 },
                        precipitation: { probability: 0.3, type: 'rain', amount_mm: 5 },
                        wind: { speed_kmh: 20, gust_kmh: 35, direction: 'W' },
                        visibility_km: 15,
                        travel_suitability: 'GOOD',
                    });
                }
                evidence.push({
                    evidence_id: `weather_fallback_${Date.now()}`,
                    source: 'WeatherAgent.getForecast',
                    timestamp: new Date().toISOString(),
                    data: { location, fallback: true, reason: 'NO_DATA_ROUTER' },
                });
            }
        }
        catch (e) {
            this.logger.warn(`[WeatherAgent] Failed to get forecast: ${e === null || e === void 0 ? void 0 : e.message}`);
            evidence.push({
                evidence_id: `weather_error_${Date.now()}`,
                source: 'WeatherAgent.getForecast',
                timestamp: new Date().toISOString(),
                data: { error: e === null || e === void 0 ? void 0 : e.message },
            });
        }
        const daysAhead = Math.ceil((new Date(dateRange.start).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const confidence = daysAhead <= 3 ? 0.85 : daysAhead <= 7 ? 0.7 : daysAhead <= 14 ? 0.5 : 0.3;
        const hasRealData = this.dataRouter && evidence.some(e => { var _a; return ((_a = e.data) === null || _a === void 0 ? void 0 : _a.source) === 'DATA_ROUTER'; });
        return {
            forecasts,
            overall_confidence: confidence,
            data_freshness: {
                last_update: new Date().toISOString(),
                reliability: this.dataRouter ? 0.9 : 0.5,
            },
            evidence,
            data_quality: this.createDataQuality({
                sourceType: hasRealData ? 'REALTIME_API' : 'ESTIMATED',
                confidence,
                coverage: forecasts.length > 0 ? 1.0 : 0.0,
                fallbackInfo: !hasRealData ? {
                    original_source: 'DataSourceRouter',
                    fallback_reason: 'Weather data unavailable',
                    quality_impact: 'MODERATE',
                } : undefined,
            }),
        };
    }
    async assessRoadClosureProbability(route, date) {
        const evidence = [];
        const closureFactors = [];
        let totalProbability = 0;
        try {
            if (this.dataRouter && route.length > 0) {
                const midPoint = route[Math.floor(route.length / 2)];
                const roadStatus = await this.dataRouter.getRoadStatus({
                    lat: midPoint.lat,
                    lng: midPoint.lng,
                });
                if (roadStatus) {
                    if (!roadStatus.isOpen) {
                        totalProbability = 0.95;
                        closureFactors.push({
                            factor: 'OTHER',
                            probability: 0.95,
                            impact: roadStatus.reason || 'Road currently closed',
                        });
                    }
                    else if (roadStatus.riskLevel >= 2) {
                        totalProbability = 0.4 + roadStatus.riskLevel * 0.15;
                        closureFactors.push({
                            factor: 'OTHER',
                            probability: totalProbability,
                            impact: roadStatus.reason || 'Road has restrictions or hazards',
                        });
                    }
                    evidence.push({
                        evidence_id: `road_status_${Date.now()}`,
                        source: 'WeatherAgent.assessRoadClosureProbability',
                        timestamp: new Date().toISOString(),
                        data: { route_points: route.length, road_status: roadStatus },
                    });
                }
            }
            const forecast = await this.getForecast(route[0] || { lat: 64, lng: -20 }, { start: date, end: date });
            if (forecast.forecasts.length > 0) {
                const weather = forecast.forecasts[0];
                if (weather.precipitation.probability > 0.7 && weather.temperature.min < 0) {
                    closureFactors.push({ factor: 'SNOW', probability: 0.6, impact: 'High snow probability' });
                    totalProbability = Math.max(totalProbability, 0.6);
                }
                if (weather.temperature.min < -5 && weather.precipitation.probability > 0.3) {
                    closureFactors.push({ factor: 'ICE', probability: 0.5, impact: 'Icing conditions likely' });
                    totalProbability = Math.max(totalProbability, 0.5);
                }
                if (weather.wind.gust_kmh > 80) {
                    closureFactors.push({ factor: 'WIND', probability: 0.7, impact: 'High winds may close roads' });
                    totalProbability = Math.max(totalProbability, 0.7);
                }
                if (weather.visibility_km < 1) {
                    closureFactors.push({ factor: 'VISIBILITY', probability: 0.6, impact: 'Very low visibility' });
                    totalProbability = Math.max(totalProbability, 0.6);
                }
            }
        }
        catch (e) {
            this.logger.warn(`[WeatherAgent] Failed to assess road closure: ${e === null || e === void 0 ? void 0 : e.message}`);
            evidence.push({
                evidence_id: `road_closure_error_${Date.now()}`,
                source: 'WeatherAgent.assessRoadClosureProbability',
                timestamp: new Date().toISOString(),
                data: { error: e === null || e === void 0 ? void 0 : e.message },
            });
        }
        const riskLevel = totalProbability > 0.8 ? 'CRITICAL' :
            totalProbability > 0.5 ? 'HIGH' :
                totalProbability > 0.2 ? 'MEDIUM' : 'LOW';
        const hasRealData = this.dataRouter && closureFactors.length > 0;
        return {
            overall_closure_probability: Math.round(totalProbability * 100) / 100,
            risk_level: riskLevel,
            closure_factors: closureFactors,
            evidence,
            data_quality: this.createDataQuality({
                sourceType: hasRealData ? 'REALTIME_API' : 'ESTIMATED',
                confidence: hasRealData ? 0.8 : 0.5,
                coverage: route.length > 0 ? 1.0 : 0.0,
            }),
        };
    }
    async quantifyWeatherRisk(location, date, activityType) {
        const evidence = [];
        const riskFactors = [];
        let riskScore = 0;
        try {
            const forecast = await this.getForecast(location, { start: date, end: date });
            if (forecast.forecasts.length > 0) {
                const weather = forecast.forecasts[0];
                if (activityType === 'DRIVING') {
                    if (weather.wind.gust_kmh > 60) {
                        riskFactors.push({ type: 'WIND', severity: 'HIGH', description: 'Strong wind gusts', mitigation: 'Use larger vehicle, drive slowly' });
                        riskScore += 30;
                    }
                    if (weather.visibility_km < 5) {
                        riskFactors.push({ type: 'VISIBILITY', severity: 'MEDIUM', description: 'Reduced visibility', mitigation: 'Use fog lights, increase following distance' });
                        riskScore += 20;
                    }
                    if (weather.temperature.min < 0) {
                        riskFactors.push({ type: 'ICE', severity: 'MEDIUM', description: 'Potential road ice', mitigation: 'Ensure winter tires, drive cautiously' });
                        riskScore += 15;
                    }
                }
                else if (activityType === 'HIKING') {
                    if (weather.wind.gust_kmh > 40) {
                        riskFactors.push({ type: 'WIND', severity: 'HIGH', description: 'Strong winds on exposed trails', mitigation: 'Choose sheltered routes' });
                        riskScore += 35;
                    }
                    if (weather.precipitation.probability > 0.6) {
                        riskFactors.push({ type: 'RAIN', severity: 'MEDIUM', description: 'High rain probability', mitigation: 'Waterproof gear essential' });
                        riskScore += 20;
                    }
                    if (weather.temperature.max < 5) {
                        riskFactors.push({ type: 'COLD', severity: 'MEDIUM', description: 'Cold conditions', mitigation: 'Layer up, bring warm drinks' });
                        riskScore += 15;
                    }
                }
                evidence.push({
                    evidence_id: `weather_risk_${Date.now()}`,
                    source: 'WeatherAgent.quantifyWeatherRisk',
                    timestamp: new Date().toISOString(),
                    data: { location, date, activity: activityType, weather_summary: weather },
                });
            }
        }
        catch (e) {
            this.logger.warn(`[WeatherAgent] Failed to quantify risk: ${e === null || e === void 0 ? void 0 : e.message}`);
            evidence.push({
                evidence_id: `weather_risk_error_${Date.now()}`,
                source: 'WeatherAgent.quantifyWeatherRisk',
                timestamp: new Date().toISOString(),
                data: { error: e === null || e === void 0 ? void 0 : e.message },
            });
        }
        const riskLevel = riskScore > 60 ? 'CRITICAL' :
            riskScore > 40 ? 'HIGH' :
                riskScore > 20 ? 'MEDIUM' : 'LOW';
        const tradeoffMessages = {
            LOW: 'Good conditions - minimal weather impact expected',
            MEDIUM: 'Some weather challenges - flexibility recommended',
            HIGH: 'Significant weather risks - backup plans needed',
            CRITICAL: 'Severe conditions - consider postponing activity',
        };
        return {
            risk_level: riskLevel,
            risk_score: Math.min(100, riskScore),
            risk_factors: riskFactors,
            what_you_pay_for: tradeoffMessages[riskLevel],
            evidence,
            data_quality: this.createDataQuality({
                sourceType: this.dataRouter ? 'REALTIME_API' : 'ESTIMATED',
                confidence: this.dataRouter ? 0.75 : 0.5,
                coverage: 1.0,
            }),
        };
    }
    degreeToDirection(degrees) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(degrees / 45) % 8;
        return directions[index];
    }
    assessTravelSuitabilityFromData(weather) {
        var _a, _b, _c, _d;
        let score = 100;
        const windSpeedKmh = ((_a = weather.windSpeed) !== null && _a !== void 0 ? _a : 5) * 3.6;
        const visibilityKm = ((_b = weather.visibility) !== null && _b !== void 0 ? _b : 10000) / 1000;
        const temp = (_c = weather.temperature) !== null && _c !== void 0 ? _c : 10;
        const condition = (_d = weather.condition) !== null && _d !== void 0 ? _d : '';
        if (windSpeedKmh > 80)
            score -= 40;
        else if (windSpeedKmh > 50)
            score -= 20;
        if (visibilityKm < 1)
            score -= 40;
        else if (visibilityKm < 5)
            score -= 20;
        if (condition.includes('rain') || condition.includes('snow'))
            score -= 20;
        if (temp < -10)
            score -= 20;
        else if (temp < 0)
            score -= 10;
        if (score >= 80)
            return 'EXCELLENT';
        if (score >= 60)
            return 'GOOD';
        if (score >= 40)
            return 'FAIR';
        if (score >= 20)
            return 'POOR';
        return 'DANGEROUS';
    }
    createDataQuality(options) {
        const now = new Date().toISOString();
        return {
            source_type: options.sourceType,
            freshness_seconds: 0,
            confidence: options.confidence,
            coverage: options.coverage,
            retrieved_at: now,
            expires_at: new Date(Date.now() + 1800000).toISOString(),
            fallback_info: options.fallbackInfo,
        };
    }
};
exports.WeatherAgentService = WeatherAgentService;
exports.WeatherAgentService = WeatherAgentService = WeatherAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [data_source_router_service_1.DataSourceRouterService])
], WeatherAgentService);
//# sourceMappingURL=weather-agent.service.js.map