"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var QueueTimeModelService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueTimeModelService = void 0;
const common_1 = require("@nestjs/common");
let QueueTimeModelService = QueueTimeModelService_1 = class QueueTimeModelService {
    constructor() {
        this.logger = new common_1.Logger(QueueTimeModelService_1.name);
        this.defaultConfig = {
            peakMultiplier: 1.5,
            seasonMultiplier: 1.2,
            dayOfWeekMultiplier: {
                0: 1.3,
                1: 1.0,
                2: 1.0,
                3: 1.0,
                4: 1.0,
                5: 1.1,
                6: 1.4,
            },
            timeOfDayMultiplier: {
                '09:00-11:00': 1.2,
                '11:00-13:00': 1.5,
                '13:00-15:00': 1.1,
                '15:00-17:00': 1.3,
                '17:00-19:00': 1.4,
                '19:00-21:00': 1.2,
            },
            popularityScore: 0.5,
        };
    }
    async estimateQueueTime(poiId, poiName, poiType, visitDateTime, config) {
        const fullConfig = {
            poiId,
            poiType,
            baseWaitTime: this.getBaseWaitTime(poiType),
            ...this.defaultConfig,
            ...config,
        };
        const timePeriod = this.determineTimePeriod(visitDateTime);
        const isPeakHour = timePeriod === 'PEAK';
        const isPeakSeason = this.isPeakSeason(visitDateTime);
        const isWeekend = visitDateTime.weekday === 6 || visitDateTime.weekday === 7;
        const isHoliday = await this.isHoliday(visitDateTime);
        const peakMultiplier = isPeakHour ? fullConfig.peakMultiplier : 1.0;
        const seasonMultiplier = isPeakSeason ? fullConfig.seasonMultiplier : 1.0;
        const dayOfWeekMultiplier = fullConfig.dayOfWeekMultiplier[visitDateTime.weekday % 7] || 1.0;
        const timeOfDayMultiplier = this.getTimeOfDayMultiplier(visitDateTime, fullConfig.timeOfDayMultiplier);
        const holidayMultiplier = isHoliday ? 1.3 : 1.0;
        const popularityMultiplier = 1.0 + (fullConfig.popularityScore || 0.5) * 0.5;
        const estimatedWaitTime = Math.round(fullConfig.baseWaitTime *
            peakMultiplier *
            seasonMultiplier *
            dayOfWeekMultiplier *
            timeOfDayMultiplier *
            holidayMultiplier *
            popularityMultiplier);
        const confidence = this.calculateConfidence(fullConfig, visitDateTime);
        const recommendations = this.generateRecommendations(isPeakHour, isPeakSeason, isWeekend, isHoliday, estimatedWaitTime);
        return {
            poiId,
            poiName,
            poiType,
            baseWaitTime: fullConfig.baseWaitTime,
            estimatedWaitTime,
            peakMultiplier,
            seasonMultiplier,
            dayOfWeekMultiplier,
            timeOfDayMultiplier,
            confidence,
            factors: {
                isPeakHour,
                isPeakSeason,
                isWeekend,
                isHoliday,
            },
            recommendations,
        };
    }
    getBaseWaitTime(poiType) {
        const baseWaitTimes = {
            ATTRACTION: 30,
            RESTAURANT: 20,
            MUSEUM: 15,
            THEME_PARK: 60,
            SHOPPING: 10,
            ENTERTAINMENT: 25,
            OTHER: 15,
        };
        return baseWaitTimes[poiType] || 15;
    }
    determineTimePeriod(dateTime) {
        const hour = dateTime.hour;
        if ((hour >= 11 && hour < 13) || (hour >= 17 && hour < 19)) {
            return 'PEAK';
        }
        if ((hour >= 9 && hour < 11) || (hour >= 13 && hour < 15) || (hour >= 19 && hour < 21)) {
            return 'SHOULDER';
        }
        return 'OFF_PEAK';
    }
    isPeakSeason(dateTime) {
        const month = dateTime.month;
        return month >= 4 && month <= 5 || month >= 7 && month <= 8 || month === 10;
    }
    async isHoliday(dateTime) {
        return dateTime.weekday === 6 || dateTime.weekday === 7;
    }
    getTimeOfDayMultiplier(dateTime, timeOfDayMultiplier) {
        const hour = dateTime.hour;
        const minute = dateTime.minute;
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        for (const [range, multiplier] of Object.entries(timeOfDayMultiplier)) {
            const [start, end] = range.split('-');
            const [startHour, startMin] = start.split(':').map(Number);
            const [endHour, endMin] = end.split(':').map(Number);
            const currentMinutes = hour * 60 + minute;
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                return multiplier;
            }
        }
        return 1.0;
    }
    calculateConfidence(config, dateTime) {
        let confidence = 0.7;
        if (config.popularityScore !== undefined) {
            confidence += 0.1;
        }
        confidence += 0.1;
        return Math.min(1.0, confidence);
    }
    generateRecommendations(isPeakHour, isPeakSeason, isWeekend, isHoliday, estimatedWaitTime) {
        const recommendations = [];
        if (isPeakHour) {
            recommendations.push('当前为高峰期，建议避开11:00-13:00或17:00-19:00');
        }
        if (isPeakSeason) {
            recommendations.push('当前为旅游旺季，排队时间可能较长');
        }
        if (isWeekend || isHoliday) {
            recommendations.push('周末或节假日排队时间通常更长，建议工作日前往');
        }
        if (estimatedWaitTime > 60) {
            recommendations.push(`预计排队时间较长（${estimatedWaitTime}分钟），建议提前预约或选择其他时间段`);
        }
        else if (estimatedWaitTime > 30) {
            recommendations.push(`预计排队时间中等（${estimatedWaitTime}分钟），建议预留充足时间`);
        }
        return recommendations;
    }
};
exports.QueueTimeModelService = QueueTimeModelService;
exports.QueueTimeModelService = QueueTimeModelService = QueueTimeModelService_1 = __decorate([
    (0, common_1.Injectable)()
], QueueTimeModelService);
//# sourceMappingURL=queue-time-model.service.js.map