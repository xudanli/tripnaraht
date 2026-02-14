"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EnhancedRestTimeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedRestTimeService = void 0;
const common_1 = require("@nestjs/common");
let EnhancedRestTimeService = EnhancedRestTimeService_1 = class EnhancedRestTimeService {
    constructor() {
        this.logger = new common_1.Logger(EnhancedRestTimeService_1.name);
        this.defaultConfig = {
            baseRestTime: 15,
            shortBreakTime: 10,
            mealBreakTime: 60,
            longRestTime: 120,
            hpRecoveryRate: 0.5,
            fatigueReductionRate: 0.3,
        };
    }
    async recommendRestTime(fatigueState, config) {
        var _a;
        const fullConfig = {
            ...this.defaultConfig,
            ...config,
        };
        const currentFatigueLevel = this.determineFatigueLevel(fatigueState);
        const restType = this.determineRestType(fatigueState, currentFatigueLevel, fullConfig);
        const { recommendedRestTime, minimumRestTime, optimalRestTime } = this.calculateRestTime(fatigueState, restType, fullConfig);
        const hpRecovery = Math.min(fatigueState.maxHP - fatigueState.currentHP, recommendedRestTime * fullConfig.hpRecoveryRate);
        const fatigueReduction = Math.min(fatigueState.accumulatedFatigue, recommendedRestTime * fullConfig.fatigueReductionRate);
        const confidence = this.calculateConfidence(fatigueState, fullConfig);
        const recommendations = this.generateRecommendations(fatigueState, currentFatigueLevel, restType, recommendedRestTime, hpRecovery);
        return {
            recommendedRestTime,
            minimumRestTime,
            optimalRestTime,
            hpRecovery,
            fatigueReduction,
            confidence,
            factors: {
                currentFatigueLevel,
                timeSinceLastRest: fatigueState.timeSinceLastRest,
                activityIntensity: fatigueState.activityIntensity,
                userFitnessLevel: (_a = fatigueState.userProfile) === null || _a === void 0 ? void 0 : _a.fitnessLevel,
            },
            restType,
            recommendations,
        };
    }
    determineFatigueLevel(fatigueState) {
        const hpPercentage = fatigueState.currentHP / fatigueState.maxHP;
        const fatiguePercentage = fatigueState.accumulatedFatigue / 100;
        if (hpPercentage < 0.2 || fatiguePercentage > 0.8) {
            return 'CRITICAL';
        }
        if (hpPercentage < 0.4 || fatiguePercentage > 0.6) {
            return 'HIGH';
        }
        if (hpPercentage < 0.6 || fatiguePercentage > 0.4) {
            return 'MEDIUM';
        }
        return 'LOW';
    }
    determineRestType(fatigueState, fatigueLevel, config) {
        if (fatigueState.timeSinceLastRest > 240) {
            return 'MEAL_BREAK';
        }
        if (fatigueLevel === 'CRITICAL') {
            return 'LONG_REST';
        }
        if (fatigueLevel === 'HIGH') {
            return fatigueState.timeSinceLastRest > 180 ? 'MEAL_BREAK' : 'LONG_REST';
        }
        if (fatigueState.timeSinceLastRest > 120) {
            return 'MEAL_BREAK';
        }
        return 'SHORT_BREAK';
    }
    calculateRestTime(fatigueState, restType, config) {
        var _a, _b;
        let baseTime;
        let minimumTime;
        let optimalTime;
        switch (restType) {
            case 'SHORT_BREAK':
                baseTime = config.shortBreakTime;
                minimumTime = Math.max(5, baseTime * 0.5);
                optimalTime = baseTime * 1.2;
                break;
            case 'MEAL_BREAK':
                baseTime = config.mealBreakTime;
                minimumTime = Math.max(30, baseTime * 0.7);
                optimalTime = baseTime * 1.3;
                break;
            case 'LONG_REST':
                baseTime = config.longRestTime;
                minimumTime = Math.max(60, baseTime * 0.8);
                optimalTime = baseTime * 1.5;
                break;
            case 'OVERNIGHT':
                baseTime = 480;
                minimumTime = 360;
                optimalTime = 600;
                break;
        }
        const hpPercentage = fatigueState.currentHP / fatigueState.maxHP;
        const fatiguePercentage = fatigueState.accumulatedFatigue / 100;
        if (hpPercentage < 0.3 || fatiguePercentage > 0.7) {
            baseTime *= 1.3;
            optimalTime *= 1.2;
        }
        if (((_a = fatigueState.userProfile) === null || _a === void 0 ? void 0 : _a.fitnessLevel) === 'LOW') {
            baseTime *= 1.2;
            optimalTime *= 1.1;
        }
        else if (((_b = fatigueState.userProfile) === null || _b === void 0 ? void 0 : _b.fitnessLevel) === 'HIGH') {
            baseTime *= 0.9;
            optimalTime *= 0.95;
        }
        if (fatigueState.activityIntensity === 'HIGH') {
            baseTime *= 1.2;
            optimalTime *= 1.1;
        }
        else if (fatigueState.activityIntensity === 'LOW') {
            baseTime *= 0.9;
            optimalTime *= 0.95;
        }
        return {
            recommendedRestTime: Math.round(baseTime),
            minimumRestTime: Math.round(minimumTime),
            optimalRestTime: Math.round(optimalTime),
        };
    }
    calculateConfidence(fatigueState, config) {
        var _a, _b;
        let confidence = 0.7;
        if ((_a = fatigueState.userProfile) === null || _a === void 0 ? void 0 : _a.fitnessLevel) {
            confidence += 0.1;
        }
        if ((_b = fatigueState.userProfile) === null || _b === void 0 ? void 0 : _b.age) {
            confidence += 0.1;
        }
        return Math.min(1.0, confidence);
    }
    generateRecommendations(fatigueState, fatigueLevel, restType, recommendedRestTime, hpRecovery) {
        const recommendations = [];
        if (fatigueLevel === 'CRITICAL') {
            recommendations.push('⚠️ 疲劳等级为临界，强烈建议立即休息');
        }
        else if (fatigueLevel === 'HIGH') {
            recommendations.push('疲劳等级较高，建议充分休息');
        }
        if (restType === 'MEAL_BREAK') {
            recommendations.push('建议用餐休息，补充能量');
        }
        else if (restType === 'LONG_REST') {
            recommendations.push('建议长休息，充分恢复体力');
        }
        recommendations.push(`建议休息 ${recommendedRestTime} 分钟，预计恢复 ${hpRecovery.toFixed(1)} HP`);
        if (fatigueState.timeSinceLastRest > 180) {
            recommendations.push('距离上次休息时间较长，建议适当延长休息时间');
        }
        return recommendations;
    }
};
exports.EnhancedRestTimeService = EnhancedRestTimeService;
exports.EnhancedRestTimeService = EnhancedRestTimeService = EnhancedRestTimeService_1 = __decorate([
    (0, common_1.Injectable)()
], EnhancedRestTimeService);
//# sourceMappingURL=enhanced-rest-time.service.js.map