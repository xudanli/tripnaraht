"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FatigueCalculatorService = void 0;
const common_1 = require("@nestjs/common");
let FatigueCalculatorService = class FatigueCalculatorService {
    computeFatigueIndex(day, pace) {
        return this.computeFatigueIndexEnhanced(day, pace);
    }
    computeFatigueIndexEnhanced(day, pace, context) {
        const ascentRatio = day.totalAscentM / pace.maxDailyAscentM;
        const distRatio = day.totalDistanceKm / pace.maxDailyDistanceKm;
        const hoursRatio = day.estMovingHours / pace.maxMovingHours;
        let baseFatigue = Math.max(ascentRatio, distRatio, hoursRatio);
        const slopePenalty = this.calculateSlopePenalty(day.maxSlopePct);
        baseFatigue += slopePenalty;
        if ((context === null || context === void 0 ? void 0 : context.dayOfTrip) !== undefined && context.dayOfTrip >= 4) {
            const cumulativeFactor = this.calculateCumulativeFatigue(context.dayOfTrip);
            baseFatigue *= cumulativeFactor;
        }
        if ((context === null || context === void 0 ? void 0 : context.averageElevationM) && context.averageElevationM > 3000) {
            const altitudeFactor = this.calculateAltitudeFactor(context.averageElevationM);
            baseFatigue *= altitudeFactor;
        }
        if (context === null || context === void 0 ? void 0 : context.terrainType) {
            const terrainFactor = this.calculateTerrainFactor(context.terrainType);
            baseFatigue *= terrainFactor;
        }
        return baseFatigue;
    }
    estimateMovingHours(distanceKm, ascentM) {
        return this.estimateMovingHoursEnhanced(distanceKm, ascentM);
    }
    estimateMovingHoursEnhanced(distanceKm, ascentM, options) {
        let flatSpeedKmH = 4.0;
        let ascentSpeedMH = 600;
        let descentSpeedMH = 900;
        if (options === null || options === void 0 ? void 0 : options.terrainType) {
            const terrainMultiplier = this.getTerrainSpeedMultiplier(options.terrainType);
            flatSpeedKmH *= terrainMultiplier;
            ascentSpeedMH *= terrainMultiplier;
            descentSpeedMH *= terrainMultiplier;
        }
        if ((options === null || options === void 0 ? void 0 : options.averageElevationM) && options.averageElevationM > 3000) {
            const altitudeMultiplier = this.getAltitudeSpeedMultiplier(options.averageElevationM);
            flatSpeedKmH *= altitudeMultiplier;
            ascentSpeedMH *= altitudeMultiplier;
        }
        const flatTime = distanceKm / flatSpeedKmH;
        const ascentTime = ascentM / ascentSpeedMH;
        const descentTime = ((options === null || options === void 0 ? void 0 : options.descentM) || 0) / descentSpeedMH;
        return flatTime + ascentTime + descentTime;
    }
    getFatigueLevel(fatigueIndex) {
        if (fatigueIndex <= 0.8) {
            return {
                level: 'easy',
                description: 'Easy pace, plenty of energy reserve',
                descriptionZh: '轻松，有充足的体能余量',
                emoji: '😊',
            };
        }
        if (fatigueIndex <= 1.1) {
            return {
                level: 'moderate',
                description: 'Reasonable pace, sustainable',
                descriptionZh: '合理，可持续的节奏',
                emoji: '🙂',
            };
        }
        if (fatigueIndex <= 1.4) {
            return {
                level: 'challenging',
                description: 'Challenging, consider optimization',
                descriptionZh: '偏紧张，建议优化',
                emoji: '😓',
            };
        }
        return {
            level: 'extreme',
            description: 'Very demanding, adjustment required',
            descriptionZh: '高负荷，需要调整',
            emoji: '🥵',
        };
    }
    calculateSlopePenalty(maxSlopePct) {
        if (maxSlopePct <= 15) {
            return 0;
        }
        if (maxSlopePct >= 30) {
            return 0.2;
        }
        return ((maxSlopePct - 15) / 15) * 0.2;
    }
    calculateCumulativeFatigue(dayOfTrip) {
        if (dayOfTrip < 4) {
            return 1.0;
        }
        let cumulativeFactor = 1.0;
        if (dayOfTrip >= 4) {
            const phase1Days = Math.min(dayOfTrip - 4, 8);
            cumulativeFactor += phase1Days * 0.03;
        }
        if (dayOfTrip >= 12) {
            const phase2Days = Math.min(dayOfTrip - 12, 8);
            cumulativeFactor += phase2Days * 0.02;
        }
        if (dayOfTrip >= 20) {
            const phase3Days = dayOfTrip - 20;
            cumulativeFactor += phase3Days * 0.01;
        }
        return Math.min(cumulativeFactor, 1.45);
    }
    calculateAltitudeFactor(elevationM) {
        if (elevationM <= 3000) {
            return 1.0;
        }
        const extraElevation = elevationM - 3000;
        const factor = 1 + (extraElevation / 500) * 0.05;
        return Math.min(factor, 1.4);
    }
    calculateTerrainFactor(terrainType) {
        const factors = {
            'easy': 1.0,
            'moderate': 1.1,
            'technical': 1.25,
            'extreme': 1.4,
            'alpine': 1.2,
            'glacier': 1.35,
            'desert': 1.3,
            'jungle': 1.25,
            'coastal': 1.1,
            'scree': 1.35,
        };
        return factors[terrainType] || 1.0;
    }
    getTerrainSpeedMultiplier(terrainType) {
        const multipliers = {
            'easy': 1.0,
            'moderate': 0.85,
            'technical': 0.7,
            'extreme': 0.5,
            'alpine': 0.8,
            'glacier': 0.55,
            'desert': 0.65,
            'jungle': 0.6,
            'coastal': 0.9,
            'scree': 0.55,
        };
        return multipliers[terrainType] || 1.0;
    }
    getTerrainCharacteristics(terrainType) {
        const characteristics = {
            'easy': {
                type: 'easy',
                fatigueFactor: 1.0,
                speedMultiplier: 1.0,
                riskLevel: 'LOW',
                description: 'Well-maintained trails or paved roads',
                descriptionZh: '维护良好的步道或铺装路面',
            },
            'moderate': {
                type: 'moderate',
                fatigueFactor: 1.1,
                speedMultiplier: 0.85,
                riskLevel: 'LOW',
                description: 'Standard mountain trails, gravel paths',
                descriptionZh: '普通山地步道、碎石路',
            },
            'technical': {
                type: 'technical',
                fatigueFactor: 1.25,
                speedMultiplier: 0.7,
                riskLevel: 'MEDIUM',
                description: 'Rocky terrain, scrambling sections',
                descriptionZh: '技术路段、岩石路面、需要手脚并用',
                requiredGear: ['trekking poles', 'sturdy boots'],
            },
            'extreme': {
                type: 'extreme',
                fatigueFactor: 1.4,
                speedMultiplier: 0.5,
                riskLevel: 'HIGH',
                description: 'Dangerous terrain, exposed sections',
                descriptionZh: '极端路况、悬崖、危险路段',
                requiredGear: ['helmet', 'rope', 'harness'],
            },
            'alpine': {
                type: 'alpine',
                fatigueFactor: 1.2,
                speedMultiplier: 0.8,
                riskLevel: 'MEDIUM',
                description: 'High mountain meadows, above treeline',
                descriptionZh: '高山草甸、雪线以上',
                requiredGear: ['warm layers', 'sun protection'],
                bestSeasons: [6, 7, 8, 9],
            },
            'glacier': {
                type: 'glacier',
                fatigueFactor: 1.35,
                speedMultiplier: 0.55,
                riskLevel: 'HIGH',
                description: 'Glacial terrain, crevasse risk',
                descriptionZh: '冰川地形、需要冰爪',
                requiredGear: ['crampons', 'ice axe', 'rope', 'harness'],
                bestSeasons: [5, 6, 7, 8, 9],
            },
            'desert': {
                type: 'desert',
                fatigueFactor: 1.3,
                speedMultiplier: 0.65,
                riskLevel: 'MEDIUM',
                description: 'Desert terrain, soft sand',
                descriptionZh: '沙漠地形、软沙路面',
                requiredGear: ['sun protection', 'extra water', 'gaiters'],
                bestSeasons: [3, 4, 10, 11],
            },
            'jungle': {
                type: 'jungle',
                fatigueFactor: 1.25,
                speedMultiplier: 0.6,
                riskLevel: 'MEDIUM',
                description: 'Tropical rainforest, humid and muddy',
                descriptionZh: '热带丛林、潮湿泥泞',
                requiredGear: ['rain gear', 'insect repellent', 'machete'],
                bestSeasons: [12, 1, 2],
            },
            'coastal': {
                type: 'coastal',
                fatigueFactor: 1.1,
                speedMultiplier: 0.9,
                riskLevel: 'LOW',
                description: 'Coastal paths, beaches, rocky shores',
                descriptionZh: '海岸线、沙滩、礁石',
                requiredGear: ['water shoes'],
            },
            'scree': {
                type: 'scree',
                fatigueFactor: 1.35,
                speedMultiplier: 0.55,
                riskLevel: 'MEDIUM',
                description: 'Loose rock slopes, unstable footing',
                descriptionZh: '碎石坡、流石滩',
                requiredGear: ['gaiters', 'sturdy boots', 'trekking poles'],
            },
        };
        return characteristics[terrainType];
    }
    getAltitudeSpeedMultiplier(elevationM) {
        if (elevationM <= 3000)
            return 1.0;
        if (elevationM <= 4000)
            return 0.9;
        if (elevationM <= 5000)
            return 0.75;
        return 0.6;
    }
    calculateRecoveryFactor(context) {
        var _a, _b, _c, _d, _e, _f, _g;
        let baseRecovery = context.isRestDay ? 0.40 : 0.15;
        const sleepQuality = (_a = context.sleepQuality) !== null && _a !== void 0 ? _a : 0.7;
        baseRecovery *= 0.7 + sleepQuality * 0.5;
        if ((_b = context.recoveryConditions) === null || _b === void 0 ? void 0 : _b.accommodationType) {
            const accommodationModifier = {
                'camping': 0.8,
                'basic': 0.9,
                'comfortable': 1.0,
                'luxury': 1.1,
            };
            baseRecovery *= accommodationModifier[context.recoveryConditions.accommodationType] || 1.0;
        }
        if ((_c = context.recoveryConditions) === null || _c === void 0 ? void 0 : _c.hasHotShower) {
            baseRecovery *= 1.1;
        }
        if (((_d = context.recoveryConditions) === null || _d === void 0 ? void 0 : _d.nutritionQuality) !== undefined) {
            baseRecovery *= 0.8 + context.recoveryConditions.nutritionQuality * 0.3;
        }
        if ((_e = context.recoveryConditions) === null || _e === void 0 ? void 0 : _e.sleepingAltitudeM) {
            const altitude = context.recoveryConditions.sleepingAltitudeM;
            if (altitude > 3000) {
                const altitudePenalty = Math.min(0.3, (altitude - 3000) / 5000 * 0.3);
                baseRecovery *= 1 - altitudePenalty;
            }
        }
        if ((_f = context.humanModel) === null || _f === void 0 ? void 0 : _f.ageModifier) {
            baseRecovery *= 0.8 + context.humanModel.ageModifier * 0.3;
        }
        if ((_g = context.humanModel) === null || _g === void 0 ? void 0 : _g.fitnessLevel) {
            const fitnessModifier = {
                'LOW': 0.85,
                'MEDIUM_LOW': 0.92,
                'MEDIUM': 1.0,
                'MEDIUM_HIGH': 1.08,
                'HIGH': 1.15,
            };
            baseRecovery *= fitnessModifier[context.humanModel.fitnessLevel] || 1.0;
        }
        if (context.fatigueHistory && context.fatigueHistory.length > 0) {
            const lastDay = context.fatigueHistory[context.fatigueHistory.length - 1];
            if (lastDay.isRestDay && context.isRestDay) {
                baseRecovery *= 1.1;
            }
        }
        return Math.min(0.50, Math.max(0.10, baseRecovery));
    }
    calculateCumulativeFatigueWithRecovery(currentDayFatigue, context) {
        var _a;
        const history = context.fatigueHistory || [];
        if (history.length === 0) {
            return currentDayFatigue;
        }
        const previousDay = history[history.length - 1];
        const previousCumulative = previousDay.cumulativeFatigue;
        const recoveryFactor = this.calculateRecoveryFactor({
            isRestDay: context.isRestDay || false,
            sleepQuality: (_a = context.recoveryConditions) === null || _a === void 0 ? void 0 : _a.nutritionQuality,
            recoveryConditions: context.recoveryConditions,
            humanModel: context.humanModel,
            fatigueHistory: history,
        });
        const todayAddition = context.isRestDay ? 0.2 : currentDayFatigue;
        const cumulativeFatigue = previousCumulative * (1 - recoveryFactor) + todayAddition;
        return cumulativeFatigue;
    }
    computeFatigueIndexUltimate(day, pace, context) {
        var _a, _b;
        const warnings = [];
        const dailyFatigue = this.computeFatigueIndexEnhanced(day, pace, context);
        const recoveryFactor = this.calculateRecoveryFactor({
            isRestDay: context.isRestDay || false,
            sleepQuality: (_a = context.recoveryConditions) === null || _a === void 0 ? void 0 : _a.nutritionQuality,
            recoveryConditions: context.recoveryConditions,
            humanModel: context.humanModel,
            fatigueHistory: context.fatigueHistory,
        });
        const cumulativeFatigue = this.calculateCumulativeFatigueWithRecovery(dailyFatigue, context);
        const cumulativeImpact = Math.max(0, (cumulativeFatigue - 1.0) * 0.05);
        const effectiveFatigue = dailyFatigue * (1 + cumulativeImpact);
        if (cumulativeFatigue > 3.0) {
            warnings.push('累积疲劳过高，强烈建议增加休息日');
        }
        else if (cumulativeFatigue > 2.0) {
            warnings.push('累积疲劳较高，建议安排休息日');
        }
        if (dailyFatigue > 1.4) {
            warnings.push('当日负荷过高，建议减少行程强度');
        }
        if (((_b = context.recoveryConditions) === null || _b === void 0 ? void 0 : _b.sleepingAltitudeM) &&
            context.recoveryConditions.sleepingAltitudeM > 4000 &&
            cumulativeFatigue > 1.5) {
            warnings.push('高海拔+疲劳叠加，高反风险增加');
        }
        return {
            dailyFatigue,
            cumulativeFatigue,
            recoveryFactor,
            effectiveFatigue,
            warnings,
        };
    }
    suggestRestDays(dayProfiles, pace, humanModel) {
        const suggestedRestDayIndices = [];
        let cumulativeFatigue = 0;
        let maxCumulativeFatigue = 0;
        const fatigueHistory = [];
        for (let i = 0; i < dayProfiles.length; i++) {
            const dayFatigue = this.computeFatigueIndexEnhanced(dayProfiles[i], pace, {
                dayOfTrip: i,
                humanModel,
            });
            const recoveryFactor = this.calculateRecoveryFactor({
                isRestDay: false,
                humanModel,
                fatigueHistory,
            });
            cumulativeFatigue = cumulativeFatigue * (1 - recoveryFactor) + dayFatigue;
            maxCumulativeFatigue = Math.max(maxCumulativeFatigue, cumulativeFatigue);
            fatigueHistory.push({
                dayIndex: i,
                fatigueIndex: dayFatigue,
                isRestDay: false,
                cumulativeFatigue,
            });
            if (cumulativeFatigue > 2.0 && !suggestedRestDayIndices.includes(i)) {
                suggestedRestDayIndices.push(i);
                cumulativeFatigue *= 0.6;
            }
        }
        let reason = '';
        if (suggestedRestDayIndices.length === 0) {
            reason = '行程强度适中，无需额外休息日';
        }
        else if (suggestedRestDayIndices.length <= 2) {
            reason = `建议在第${suggestedRestDayIndices.map(i => i + 1).join('、')}天前插入休息日，以控制累积疲劳`;
        }
        else {
            reason = `行程强度较高，建议多个休息日以确保安全和舒适`;
        }
        return {
            suggestedRestDayIndices,
            reason,
            projectedMaxCumulativeFatigue: maxCumulativeFatigue,
        };
    }
    calculateRestDaysNeeded(currentCumulativeFatigue, targetFatigue, context) {
        if (currentCumulativeFatigue <= targetFatigue) {
            return 0;
        }
        const recoveryFactor = this.calculateRecoveryFactor({
            isRestDay: true,
            recoveryConditions: context === null || context === void 0 ? void 0 : context.recoveryConditions,
            humanModel: context === null || context === void 0 ? void 0 : context.humanModel,
        });
        let fatigue = currentCumulativeFatigue;
        let days = 0;
        const maxDays = 7;
        while (fatigue > targetFatigue && days < maxDays) {
            fatigue = fatigue * (1 - recoveryFactor) + 0.2;
            days++;
        }
        return days;
    }
};
exports.FatigueCalculatorService = FatigueCalculatorService;
exports.FatigueCalculatorService = FatigueCalculatorService = __decorate([
    (0, common_1.Injectable)()
], FatigueCalculatorService);
//# sourceMappingURL=fatigue-calculator.service.js.map