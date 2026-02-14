"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DynamicTransportTimeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicTransportTimeService = void 0;
const common_1 = require("@nestjs/common");
let DynamicTransportTimeService = DynamicTransportTimeService_1 = class DynamicTransportTimeService {
    constructor() {
        this.logger = new common_1.Logger(DynamicTransportTimeService_1.name);
        this.defaultConfig = {
            congestionFactor: 0.3,
            weatherFactor: 0.1,
            bufferPercentage: 20,
            rushHourMultiplier: 1.5,
        };
    }
    async estimateTransportTime(from, to, mode, baseTime, travelDateTime, config) {
        const fullConfig = {
            baseTime,
            mode,
            ...this.defaultConfig,
            ...config,
        };
        const isRushHour = this.isRushHour(travelDateTime, mode);
        const weatherCondition = await this.getWeatherCondition(from, travelDateTime);
        const roadCondition = await this.getRoadCondition(from, to, travelDateTime, mode);
        const isHoliday = await this.isHoliday(travelDateTime);
        const congestionFactor = this.calculateCongestionFactor(isRushHour, roadCondition, mode, fullConfig.congestionFactor);
        const weatherFactor = this.calculateWeatherFactor(weatherCondition, mode, fullConfig.weatherFactor);
        const rushHourMultiplier = isRushHour ? fullConfig.rushHourMultiplier : 1.0;
        const holidayMultiplier = isHoliday ? 1.2 : 1.0;
        const estimatedTime = Math.round(baseTime *
            (1 + congestionFactor) *
            (1 + weatherFactor) *
            rushHourMultiplier *
            holidayMultiplier);
        const bufferTime = Math.round(estimatedTime * (fullConfig.bufferPercentage / 100));
        const confidence = this.calculateConfidence(fullConfig, weatherCondition, roadCondition);
        const recommendations = this.generateRecommendations(isRushHour, weatherCondition, roadCondition, estimatedTime, mode);
        return {
            from,
            to,
            mode,
            baseTime,
            estimatedTime,
            congestionFactor,
            weatherFactor,
            bufferTime,
            confidence,
            factors: {
                isRushHour,
                weatherCondition,
                roadCondition,
                isHoliday,
            },
            recommendations,
        };
    }
    isRushHour(dateTime, mode) {
        const hour = dateTime.hour;
        if (mode === 'SUBWAY' || mode === 'BUS') {
            return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
        }
        if (mode === 'DRIVE' || mode === 'TAXI') {
            return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
        }
        return false;
    }
    async getWeatherCondition(location, dateTime) {
        const month = dateTime.month;
        if (month >= 6 && month <= 8) {
            return Math.random() > 0.8 ? 'STORM' : 'CLEAR';
        }
        else if (month >= 12 || month <= 2) {
            return Math.random() > 0.9 ? 'SNOW' : 'CLEAR';
        }
        else {
            return Math.random() > 0.7 ? 'RAIN' : 'CLEAR';
        }
    }
    async getRoadCondition(from, to, dateTime, mode) {
        const isRushHour = this.isRushHour(dateTime, mode);
        if (isRushHour) {
            return Math.random() > 0.5 ? 'SEVERELY_CONGESTED' : 'CONGESTED';
        }
        return 'NORMAL';
    }
    async isHoliday(dateTime) {
        return dateTime.weekday === 6 || dateTime.weekday === 7;
    }
    calculateCongestionFactor(isRushHour, roadCondition, mode, baseCongestionFactor) {
        let factor = baseCongestionFactor;
        if (isRushHour) {
            factor += 0.3;
        }
        if (roadCondition === 'CONGESTED') {
            factor += 0.2;
        }
        else if (roadCondition === 'SEVERELY_CONGESTED') {
            factor += 0.4;
        }
        if (mode === 'DRIVE' || mode === 'TAXI') {
            factor *= 1.2;
        }
        else if (mode === 'SUBWAY' || mode === 'BUS') {
            factor *= 0.8;
        }
        return Math.min(1.0, factor);
    }
    calculateWeatherFactor(weatherCondition, mode, baseWeatherFactor) {
        let factor = baseWeatherFactor;
        switch (weatherCondition) {
            case 'CLEAR':
                factor = 0;
                break;
            case 'RAIN':
                factor = 0.1;
                break;
            case 'FOG':
                factor = 0.2;
                break;
            case 'SNOW':
                factor = 0.3;
                break;
            case 'STORM':
                factor = 0.5;
                break;
        }
        if (mode === 'WALK' || mode === 'BIKE') {
            factor *= 1.5;
        }
        else if (mode === 'SUBWAY' || mode === 'BUS') {
            factor *= 0.5;
        }
        return Math.min(1.0, factor);
    }
    calculateConfidence(config, weatherCondition, roadCondition) {
        let confidence = 0.7;
        if (roadCondition !== 'NORMAL') {
            confidence += 0.1;
        }
        if (weatherCondition !== 'CLEAR') {
            confidence += 0.1;
        }
        return Math.min(1.0, confidence);
    }
    generateRecommendations(isRushHour, weatherCondition, roadCondition, estimatedTime, mode) {
        const recommendations = [];
        if (isRushHour) {
            recommendations.push('当前为高峰期，建议避开7:00-9:00或17:00-19:00');
        }
        if (weatherCondition === 'RAIN' || weatherCondition === 'SNOW' || weatherCondition === 'STORM') {
            recommendations.push(`天气条件不佳（${weatherCondition}），建议预留更多时间或选择公共交通`);
        }
        if (roadCondition === 'CONGESTED' || roadCondition === 'SEVERELY_CONGESTED') {
            recommendations.push(`路况拥堵（${roadCondition}），建议选择公共交通或预留更多时间`);
        }
        if (estimatedTime > 60) {
            recommendations.push(`预计交通时间较长（${estimatedTime}分钟），建议提前出发或选择其他交通方式`);
        }
        return recommendations;
    }
};
exports.DynamicTransportTimeService = DynamicTransportTimeService;
exports.DynamicTransportTimeService = DynamicTransportTimeService = DynamicTransportTimeService_1 = __decorate([
    (0, common_1.Injectable)()
], DynamicTransportTimeService);
//# sourceMappingURL=dynamic-transport-time.service.js.map