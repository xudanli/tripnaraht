"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var WeatherDecisionEvidenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherDecisionEvidenceService = void 0;
const common_1 = require("@nestjs/common");
let WeatherDecisionEvidenceService = WeatherDecisionEvidenceService_1 = class WeatherDecisionEvidenceService {
    constructor() {
        this.logger = new common_1.Logger(WeatherDecisionEvidenceService_1.name);
    }
    async generateEvidencePipeline(plan, rules) {
        const segmentEvidences = [];
        for (const day of plan.days) {
            const evidence = await this.generateDayEvidence(day, rules);
            segmentEvidences.push(evidence);
        }
        const hasHardViolation = segmentEvidences.some(e => e.violation === 'HARD');
        const hasSoftViolation = segmentEvidences.some(e => e.violation === 'SOFT');
        const explainableFailure = this.generateExplainableFailure(segmentEvidences, hasHardViolation, hasSoftViolation);
        return {
            segmentEvidences,
            hasHardViolation,
            hasSoftViolation,
            canProceed: !hasHardViolation,
            explainableFailure,
        };
    }
    async generateDayEvidence(day, rules) {
        const mockWeather = this.getMockWeather(day.date);
        const evidence = {
            segmentId: `day_${day.day}_${day.date}`,
            date: day.date,
            windSpeed: mockWeather.windSpeed,
            windDirection: mockWeather.windDirection,
            precipitation: mockWeather.precipitation,
            visibility: mockWeather.visibility,
            temperatureDrop: mockWeather.temperatureDrop,
            crosswindRisk: this.calculateCrosswindRisk(mockWeather.windSpeed, mockWeather.windDirection),
            violation: this.checkViolations(mockWeather, rules),
            explanation: this.generateExplanation(mockWeather, rules),
            suggestedAction: this.suggestAction(mockWeather, rules),
            metadata: {
                weatherWindowAvailable: mockWeather.windSpeed < ((rules === null || rules === void 0 ? void 0 : rules.maxWindSpeed) || 15),
                forecastReliability: 'MEDIUM',
                historicalRiskLevel: 'MEDIUM',
            },
        };
        return evidence;
    }
    checkViolations(weather, rules) {
        const maxWindSpeed = (rules === null || rules === void 0 ? void 0 : rules.maxWindSpeed) || 15;
        const maxCrosswindSpeed = (rules === null || rules === void 0 ? void 0 : rules.maxCrosswindSpeed) || 12;
        const maxPrecipitation = (rules === null || rules === void 0 ? void 0 : rules.maxPrecipitation) || 50;
        const minVisibility = (rules === null || rules === void 0 ? void 0 : rules.minVisibility) || 1;
        if (weather.windSpeed > maxWindSpeed) {
            return 'HARD';
        }
        const crosswindRisk = this.calculateCrosswindRisk(weather.windSpeed, weather.windDirection);
        if (crosswindRisk === 'HIGH' && weather.windSpeed > maxCrosswindSpeed) {
            return 'HARD';
        }
        if (weather.precipitation > maxPrecipitation) {
            return 'HARD';
        }
        if (weather.visibility < minVisibility) {
            return 'HARD';
        }
        if (weather.windSpeed > maxWindSpeed * 0.8) {
            return 'SOFT';
        }
        if (weather.precipitation > maxPrecipitation * 0.7) {
            return 'SOFT';
        }
        return 'NONE';
    }
    calculateCrosswindRisk(windSpeed, windDirection) {
        const crosswindComponent = Math.abs(windSpeed * Math.sin((windDirection * Math.PI) / 180));
        if (crosswindComponent > 12) {
            return 'HIGH';
        }
        if (crosswindComponent > 8) {
            return 'MEDIUM';
        }
        if (crosswindComponent > 4) {
            return 'LOW';
        }
        return 'NONE';
    }
    generateExplanation(weather, rules) {
        const parts = [];
        if (weather.windSpeed > ((rules === null || rules === void 0 ? void 0 : rules.maxWindSpeed) || 15)) {
            parts.push(`风速 ${weather.windSpeed.toFixed(1)} m/s 超过安全阈值`);
        }
        const crosswindRisk = this.calculateCrosswindRisk(weather.windSpeed, weather.windDirection);
        if (crosswindRisk === 'HIGH') {
            parts.push('侧风风险高，不适合驾驶');
        }
        if (weather.precipitation > ((rules === null || rules === void 0 ? void 0 : rules.maxPrecipitation) || 50)) {
            parts.push(`降水量 ${weather.precipitation.toFixed(1)} mm 超过安全阈值`);
        }
        if (weather.visibility < ((rules === null || rules === void 0 ? void 0 : rules.minVisibility) || 1)) {
            parts.push(`能见度 ${weather.visibility.toFixed(1)} km 低于安全阈值`);
        }
        return parts.length > 0
            ? parts.join('；')
            : '天气条件在安全范围内';
    }
    suggestAction(weather, rules) {
        const violation = this.checkViolations(weather, rules);
        if (violation === 'HARD') {
            return 'CANCEL';
        }
        if (violation === 'SOFT') {
            return 'DELAY';
        }
        return 'PROCEED';
    }
    generateExplainableFailure(evidences, hasHardViolation, hasSoftViolation) {
        if (!hasHardViolation && !hasSoftViolation) {
            return undefined;
        }
        const hardViolations = evidences.filter(e => e.violation === 'HARD');
        const affectedDays = hardViolations.map(e => e.segmentId);
        if (hasHardViolation) {
            return {
                reason: '天气条件不符合安全要求',
                affectedDays: affectedDays.map((_, i) => i + 1),
                userImpact: '计划无法执行，需要调整日期或路线',
            };
        }
        if (hasSoftViolation) {
            return {
                reason: '天气条件存在风险',
                affectedDays: evidences
                    .filter(e => e.violation === 'SOFT')
                    .map((_, i) => i + 1),
                userImpact: '建议延迟或调整计划',
            };
        }
        return undefined;
    }
    validatePlanHasWeatherEvidence(plan, evidenceResult) {
        if (evidenceResult.segmentEvidences.length === 0) {
            return {
                valid: false,
                reason: '计划没有天气决策证据',
            };
        }
        if (evidenceResult.hasHardViolation) {
            return {
                valid: false,
                reason: '计划包含天气硬违规，不允许 finalize',
            };
        }
        return { valid: true };
    }
    getMockWeather(date) {
        return {
            windSpeed: 8 + Math.random() * 10,
            windDirection: Math.random() * 360,
            precipitation: Math.random() * 30,
            visibility: 5 + Math.random() * 10,
            temperatureDrop: Math.random() * 5,
        };
    }
};
exports.WeatherDecisionEvidenceService = WeatherDecisionEvidenceService;
exports.WeatherDecisionEvidenceService = WeatherDecisionEvidenceService = WeatherDecisionEvidenceService_1 = __decorate([
    (0, common_1.Injectable)()
], WeatherDecisionEvidenceService);
//# sourceMappingURL=weather-decision-evidence.service.js.map