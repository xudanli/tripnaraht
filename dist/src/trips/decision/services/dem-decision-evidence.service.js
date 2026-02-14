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
var DemDecisionEvidenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemDecisionEvidenceService = void 0;
const common_1 = require("@nestjs/common");
const dem_route_segmentation_service_1 = require("./dem-route-segmentation.service");
const dem_daily_energy_service_1 = require("./dem-daily-energy.service");
let DemDecisionEvidenceService = DemDecisionEvidenceService_1 = class DemDecisionEvidenceService {
    constructor(demRouteSegmentationService, demDailyEnergyService) {
        this.demRouteSegmentationService = demRouteSegmentationService;
        this.demDailyEnergyService = demDailyEnergyService;
        this.logger = new common_1.Logger(DemDecisionEvidenceService_1.name);
    }
    async generateEvidencePipeline(plan, routeDirection, routeSegmentation) {
        const segmentEvidences = await this.generateDecisionEvidence(plan, routeDirection, routeSegmentation);
        const hasHardViolation = segmentEvidences.some(e => e.violation === 'HARD');
        const hasSoftViolation = segmentEvidences.some(e => e.violation === 'SOFT');
        const rollingFatigue = this.detectRollingFatigue(plan, routeDirection);
        const corridorQuality = routeSegmentation
            ? await this.scoreCorridorQuality(routeSegmentation, routeDirection)
            : undefined;
        const explainableFailure = this.generateExplainableFailure(segmentEvidences, rollingFatigue, corridorQuality);
        return {
            segmentEvidences,
            hasHardViolation,
            hasSoftViolation,
            rollingFatigue,
            corridorQuality,
            explainableFailure,
            canProceed: !hasHardViolation,
        };
    }
    async generateDecisionEvidence(plan, routeDirection, routeSegmentation) {
        const evidences = [];
        for (let i = 0; i < plan.days.length; i++) {
            const day = plan.days[i];
            const evidence = await this.generateDayEvidence(day, i + 1, plan, routeDirection, routeSegmentation);
            evidences.push(evidence);
        }
        return evidences;
    }
    async generateDayEvidence(day, dayNumber, plan, routeDirection, routeSegmentation) {
        var _a, _b, _c;
        const segmentId = `day_${day.day}_${day.date}`;
        const elevationProfile = this.extractElevationProfileArray(day, routeSegmentation);
        const cumulativeAscent = ((_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.totalAscent) || 0;
        const maxSlopePct = this.calculateMaxSlopeFromProfile(elevationProfile);
        const rollingAscent3Days = this.calculateRollingAscent(plan, dayNumber, 3);
        const fatigueIndex = this.calculateFatigueIndex(cumulativeAscent, maxSlopePct, ((_b = day.terrainFacts) === null || _b === void 0 ? void 0 : _b.maxElevation) || 0);
        const violation = this.checkViolations(day, routeDirection, cumulativeAscent, maxSlopePct, ((_c = day.terrainFacts) === null || _c === void 0 ? void 0 : _c.maxElevation) || 0);
        const explanation = this.generateExplanation(day, violation, cumulativeAscent, maxSlopePct, rollingAscent3Days);
        const metadata = this.generateMetadata(day, elevationProfile);
        return {
            segmentId,
            elevationProfile,
            cumulativeAscent,
            maxSlopePct,
            rollingAscent3Days,
            fatigueIndex,
            violation,
            explanation,
            metadata,
        };
    }
    extractElevationProfileArray(day, routeSegmentation) {
        if ((routeSegmentation === null || routeSegmentation === void 0 ? void 0 : routeSegmentation.elevationProfile) && routeSegmentation.elevationProfile.length > 0) {
            return routeSegmentation.elevationProfile.map(p => p.elevation);
        }
        if (day.terrainFacts) {
            const minElevation = day.terrainFacts.minElevation || 0;
            const maxElevation = day.terrainFacts.maxElevation || minElevation;
            const profile = [];
            for (let i = 0; i < 10; i++) {
                const ratio = i / 9;
                profile.push(minElevation + (maxElevation - minElevation) * ratio);
            }
            return profile;
        }
        return [];
    }
    calculateMaxSlopeFromProfile(profile) {
        if (profile.length < 2) {
            return 0;
        }
        let maxSlope = 0;
        const distancePerPoint = 1000;
        for (let i = 1; i < profile.length; i++) {
            const elevationDiff = Math.abs(profile[i] - profile[i - 1]);
            const slope = (elevationDiff / distancePerPoint) * 100;
            if (slope > maxSlope) {
                maxSlope = slope;
            }
        }
        return maxSlope;
    }
    calculateRollingAscent(plan, currentDay, windowDays) {
        var _a;
        const startDay = Math.max(1, currentDay - windowDays + 1);
        let totalAscent = 0;
        for (let i = startDay; i <= currentDay && i <= plan.days.length; i++) {
            const day = plan.days[i - 1];
            totalAscent += ((_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.totalAscent) || 0;
        }
        return totalAscent;
    }
    calculateFatigueIndex(cumulativeAscent, maxSlope, maxElevation) {
        const ascentFatigue = Math.min(cumulativeAscent / 100, 50);
        const slopeFatigue = maxSlope <= 20
            ? maxSlope * 0.5
            : 10 + (maxSlope - 20) * 1.0;
        const altitudeFatigue = maxElevation > 3000
            ? Math.min((maxElevation - 3000) / 100, 30)
            : 0;
        return Math.min(ascentFatigue + slopeFatigue + altitudeFatigue, 100);
    }
    checkViolations(day, routeDirection, cumulativeAscent, maxSlope, maxElevation) {
        if (!(routeDirection === null || routeDirection === void 0 ? void 0 : routeDirection.constraints)) {
            return 'NONE';
        }
        const hardConstraints = routeDirection.constraints.hard || {};
        const softConstraints = routeDirection.constraints.soft || {};
        if (hardConstraints.maxElevationM && maxElevation > hardConstraints.maxElevationM) {
            return 'HARD';
        }
        if (hardConstraints.maxSlopePct && maxSlope > hardConstraints.maxSlopePct) {
            return 'HARD';
        }
        if (hardConstraints.rapidAscentForbidden) {
            const maxDailyRapidAscent = hardConstraints.maxDailyRapidAscentM || 600;
            if (cumulativeAscent > maxDailyRapidAscent) {
                return 'HARD';
            }
        }
        if (softConstraints.maxElevationM && maxElevation > softConstraints.maxElevationM) {
            return 'SOFT';
        }
        if (softConstraints.maxDailyAscentM && cumulativeAscent > softConstraints.maxDailyAscentM) {
            return 'SOFT';
        }
        return 'NONE';
    }
    generateExplanation(day, violation, cumulativeAscent, maxSlope, rollingAscent3Days) {
        if (violation === 'HARD') {
            return `第${day.day}天违反硬约束：累计爬升${cumulativeAscent}m，最大坡度${maxSlope.toFixed(1)}%，3天滚动累计${rollingAscent3Days}m`;
        }
        else if (violation === 'SOFT') {
            return `第${day.day}天违反软约束：累计爬升${cumulativeAscent}m，最大坡度${maxSlope.toFixed(1)}%`;
        }
        else {
            return `第${day.day}天：累计爬升${cumulativeAscent}m，最大坡度${maxSlope.toFixed(1)}%，3天滚动累计${rollingAscent3Days}m`;
        }
    }
    generateMetadata(day, elevationProfile) {
        var _a;
        const elevations = elevationProfile.length > 0 ? elevationProfile :
            (((_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.maxElevation) ? [day.terrainFacts.maxElevation] : []);
        if (elevations.length === 0) {
            return undefined;
        }
        const minElevation = Math.min(...elevations);
        const maxElevation = Math.max(...elevations);
        const avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length;
        let totalSlope = 0;
        let slopeCount = 0;
        for (let i = 1; i < elevations.length; i++) {
            const diff = Math.abs(elevations[i] - elevations[i - 1]);
            const distance = 1000;
            totalSlope += (diff / distance) * 100;
            slopeCount++;
        }
        const avgSlopePct = slopeCount > 0 ? totalSlope / slopeCount : 0;
        return {
            elevationRange: {
                min: minElevation,
                max: maxElevation,
            },
            avgSlopePct,
            distanceM: elevations.length * 1000,
        };
    }
    detectRollingFatigue(plan, routeDirection) {
        var _a;
        const windowDays = 3;
        const defaultThreshold = 2000;
        if (plan.days.length < windowDays) {
            return {
                detected: false,
                rollingAscent3Days: 0,
                userThreshold: defaultThreshold,
                suggestedAction: 'NONE',
                explanation: '行程天数不足3天，无法进行连续疲劳检测',
            };
        }
        for (let i = windowDays - 1; i < plan.days.length; i++) {
            const windowStart = i - windowDays + 1;
            const windowDaysList = plan.days.slice(windowStart, i + 1);
            let rollingAscent = 0;
            for (const day of windowDaysList) {
                rollingAscent += ((_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.totalAscent) || 0;
            }
            if (rollingAscent > defaultThreshold) {
                return {
                    detected: true,
                    startDay: windowStart + 1,
                    endDay: i + 1,
                    rollingAscent3Days: rollingAscent,
                    userThreshold: defaultThreshold,
                    suggestedAction: rollingAscent > defaultThreshold * 1.5 ? 'INSERT_REST_DAY' : 'SPLIT_DAYS',
                    explanation: `第${windowStart + 1}-${i + 1}天连续3天累计爬升${rollingAscent}m，超过阈值${defaultThreshold}m，建议${rollingAscent > defaultThreshold * 1.5 ? '插入休息日' : '拆分行程'}`,
                };
            }
        }
        return {
            detected: false,
            rollingAscent3Days: 0,
            userThreshold: defaultThreshold,
            suggestedAction: 'NONE',
            explanation: '未检测到连续疲劳',
        };
    }
    async scoreCorridorQuality(routeSegmentation, routeDirection) {
        const profile = routeSegmentation.elevationProfile;
        const viewExposureScore = this.calculateViewExposure(profile);
        const elevationVariance = this.calculateElevationVariance(profile);
        const slopePenalty = this.calculateSlopePenalty(routeSegmentation);
        const totalScore = Math.max(0, Math.min(100, viewExposureScore * 0.4 +
            elevationVariance * 0.3 +
            (100 - slopePenalty) * 0.3));
        const explanation = `走廊质量评分：${totalScore.toFixed(1)}/100。视野暴露度：${viewExposureScore.toFixed(1)}，海拔变化度：${elevationVariance.toFixed(1)}，坡度惩罚：${slopePenalty.toFixed(1)}`;
        return {
            totalScore,
            viewExposureScore,
            elevationVariance,
            slopePenalty,
            explanation,
        };
    }
    calculateViewExposure(profile) {
        if (profile.length < 2) {
            return 0;
        }
        let changeCount = 0;
        for (let i = 1; i < profile.length; i++) {
            if (Math.abs(profile[i].elevation - profile[i - 1].elevation) > 10) {
                changeCount++;
            }
        }
        const changeFrequency = changeCount / profile.length;
        const elevations = profile.map(p => p.elevation);
        const avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length;
        const variance = elevations.reduce((sum, e) => sum + Math.pow(e - avgElevation, 2), 0) / elevations.length;
        const stdDev = Math.sqrt(variance);
        const normalizedStdDev = Math.min(stdDev / 500, 1);
        return (changeFrequency * 0.5 + normalizedStdDev * 0.5) * 100;
    }
    calculateElevationVariance(profile) {
        if (profile.length < 2) {
            return 0;
        }
        const elevations = profile.map(p => p.elevation);
        const minElevation = Math.min(...elevations);
        const maxElevation = Math.max(...elevations);
        const elevationRange = maxElevation - minElevation;
        return Math.min(elevationRange / 2000, 1) * 100;
    }
    calculateSlopePenalty(routeSegmentation) {
        const avgSlope = routeSegmentation.avgSlope;
        const maxSlope = routeSegmentation.maxSlope;
        const avgSlopePenalty = Math.min(avgSlope / 30, 1) * 100;
        const maxSlopePenalty = Math.min(maxSlope / 30, 1) * 100;
        return avgSlopePenalty * 0.6 + maxSlopePenalty * 0.4;
    }
    generateExplainableFailure(evidences, rollingFatigue, corridorQuality) {
        const hardViolations = evidences.filter(e => e.violation === 'HARD');
        if (hardViolations.length > 0) {
            const affectedDays = hardViolations.map(e => {
                const match = e.segmentId.match(/day_(\d+)/);
                return match ? parseInt(match[1]) : 0;
            }).filter(d => d > 0);
            const reasons = hardViolations.map(e => {
                if (e.maxSlopePct > 20) {
                    return `第${affectedDays[0]}天出现${e.maxSlopePct.toFixed(1)}%的最大坡度`;
                }
                else if (e.cumulativeAscent > 1000) {
                    return `第${affectedDays[0]}天累计爬升${e.cumulativeAscent}m超过限制`;
                }
                else {
                    return e.explanation;
                }
            });
            return {
                reason: reasons.join('；'),
                affectedDays,
                userImpact: '路线因违反硬约束被淘汰，必须修复后才能继续',
            };
        }
        if (rollingFatigue === null || rollingFatigue === void 0 ? void 0 : rollingFatigue.detected) {
            return {
                reason: `第${rollingFatigue.startDay}-${rollingFatigue.endDay}天连续3天累计爬升${rollingFatigue.rollingAscent3Days}m，超过阈值${rollingFatigue.userThreshold}m`,
                affectedDays: rollingFatigue.startDay && rollingFatigue.endDay
                    ? Array.from({ length: rollingFatigue.endDay - rollingFatigue.startDay + 1 }, (_, i) => rollingFatigue.startDay + i)
                    : [],
                userImpact: '建议插入休息日或拆分行程以降低疲劳风险',
            };
        }
        if (corridorQuality && corridorQuality.totalScore < 40) {
            return {
                reason: `走廊质量评分过低（${corridorQuality.totalScore.toFixed(1)}/100），视野暴露度：${corridorQuality.viewExposureScore.toFixed(1)}，坡度惩罚：${corridorQuality.slopePenalty.toFixed(1)}`,
                affectedDays: [],
                userImpact: '路线质量不佳，建议选择其他路线',
            };
        }
        return undefined;
    }
    validatePlanHasEvidence(plan, evidences) {
        if (evidences.length === 0) {
            return {
                valid: false,
                reason: '计划缺少 DEM 决策证据，无法 finalize',
            };
        }
        if (evidences.length !== plan.days.length) {
            return {
                valid: false,
                reason: `DEM 证据数量（${evidences.length}）与计划天数（${plan.days.length}）不匹配`,
            };
        }
        const hasHardViolation = evidences.some(e => e.violation === 'HARD');
        if (hasHardViolation) {
            return {
                valid: false,
                reason: '计划存在硬约束违反，必须修复后才能 finalize',
            };
        }
        return { valid: true };
    }
};
exports.DemDecisionEvidenceService = DemDecisionEvidenceService;
exports.DemDecisionEvidenceService = DemDecisionEvidenceService = DemDecisionEvidenceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dem_route_segmentation_service_1.DEMRouteSegmentationService,
        dem_daily_energy_service_1.DEMDailyEnergyService])
], DemDecisionEvidenceService);
//# sourceMappingURL=dem-decision-evidence.service.js.map