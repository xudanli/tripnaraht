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
var DemDecisionEvidencePipelineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemDecisionEvidencePipelineService = void 0;
const common_1 = require("@nestjs/common");
const dem_elevation_service_1 = require("../../dem/services/dem-elevation.service");
const dem_effort_metadata_service_1 = require("../../dem/services/dem-effort-metadata.service");
let DemDecisionEvidencePipelineService = DemDecisionEvidencePipelineService_1 = class DemDecisionEvidencePipelineService {
    constructor(demElevationService, demEffortService) {
        this.demElevationService = demElevationService;
        this.demEffortService = demEffortService;
        this.logger = new common_1.Logger(DemDecisionEvidencePipelineService_1.name);
        if (!demElevationService || !demEffortService) {
            this.logger.warn('DEMElevationService or DEMEffortMetadataService not available. DEM features will be disabled.');
        }
    }
    async generateEvidenceForPlan(plan, userConstraints) {
        const segmentEvidences = [];
        let hasHardViolation = false;
        let hasSoftViolation = false;
        for (const day of plan.days) {
            const dayEvidence = await this.generateEvidenceForDay(day, userConstraints);
            segmentEvidences.push(...dayEvidence);
            for (const evidence of dayEvidence) {
                if (evidence.violation === 'HARD') {
                    hasHardViolation = true;
                }
                else if (evidence.violation === 'SOFT') {
                    hasSoftViolation = true;
                }
            }
        }
        const rollingFatigue = this.detectRollingFatigue(plan.days, userConstraints);
        const corridorQuality = await this.calculateCorridorQuality(plan);
        const explainableFailure = this.generateExplainableFailure(segmentEvidences, rollingFatigue, userConstraints);
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
    async generateEvidenceForDay(day, userConstraints) {
        var _a, _b, _c;
        const evidences = [];
        if (!day.terrainFacts) {
            this.logger.warn(`Day ${day.day} has no terrainFacts, attempting to compute from slots`);
            return [];
        }
        const maxElevation = (_a = day.terrainFacts.maxElevation) !== null && _a !== void 0 ? _a : 0;
        const totalAscent = (_b = day.terrainFacts.totalAscent) !== null && _b !== void 0 ? _b : 0;
        const maxSlope = day.terrainFacts.maxElevation ? 0 : 0;
        const elevationProfile = this.inferElevationProfile(day);
        const fatigueIndex = this.calculateFatigueIndex(totalAscent, maxElevation);
        let violation = 'NONE';
        let explanation = '';
        if (userConstraints) {
            if (userConstraints.maxElevationM && maxElevation > userConstraints.maxElevationM) {
                violation = 'HARD';
                explanation = `海拔 ${maxElevation}m 超过用户限制 ${userConstraints.maxElevationM}m`;
            }
            else if (userConstraints.maxDailyAscentM && totalAscent > userConstraints.maxDailyAscentM) {
                violation = 'SOFT';
                explanation = `累计爬升 ${totalAscent}m 超过建议限制 ${userConstraints.maxDailyAscentM}m`;
            }
            else if (userConstraints.maxSlopePct && maxSlope > userConstraints.maxSlopePct) {
                violation = 'HARD';
                explanation = `坡度 ${maxSlope}% 超过用户限制 ${userConstraints.maxSlopePct}%`;
            }
        }
        if (violation === 'NONE' && fatigueIndex > 70) {
            violation = 'SOFT';
            explanation = `疲劳指数 ${fatigueIndex.toFixed(1)} 较高，建议调整节奏`;
        }
        const evidence = {
            segmentId: `day-${day.day}`,
            elevationProfile,
            cumulativeAscent: totalAscent,
            maxSlopePct: maxSlope,
            rollingAscent3Days: 0,
            fatigueIndex,
            violation,
            explanation: explanation || '无违规',
            metadata: {
                avgSlopePct: maxSlope,
                elevationRange: {
                    min: (_c = day.terrainFacts.minElevation) !== null && _c !== void 0 ? _c : 0,
                    max: maxElevation,
                },
            },
        };
        evidences.push(evidence);
        return evidences;
    }
    inferElevationProfile(day) {
        var _a, _b, _c, _d;
        if (((_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.maxElevation) && ((_b = day.terrainFacts) === null || _b === void 0 ? void 0 : _b.minElevation)) {
            const min = (_c = day.terrainFacts.minElevation) !== null && _c !== void 0 ? _c : 0;
            const max = (_d = day.terrainFacts.maxElevation) !== null && _d !== void 0 ? _d : 0;
            return [min, (min + max) / 2, max];
        }
        return [];
    }
    calculateFatigueIndex(totalAscent, maxElevation) {
        const ascentFactor = Math.min(totalAscent / 1000, 1) * 50;
        const elevationFactor = Math.min(maxElevation / 5000, 1) * 50;
        return Math.min(ascentFactor + elevationFactor, 100);
    }
    detectRollingFatigue(days, userConstraints) {
        var _a;
        if (days.length < 3) {
            return undefined;
        }
        const threshold = (_a = userConstraints === null || userConstraints === void 0 ? void 0 : userConstraints.rollingAscent3DaysThreshold) !== null && _a !== void 0 ? _a : 2000;
        const dailyAscents = days.map(day => { var _a, _b; return (_b = (_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.totalAscent) !== null && _b !== void 0 ? _b : 0; });
        for (let i = 0; i <= days.length - 3; i++) {
            const rollingAscent = dailyAscents[i] + dailyAscents[i + 1] + dailyAscents[i + 2];
            if (rollingAscent > threshold) {
                return {
                    detected: true,
                    startDay: i + 1,
                    endDay: i + 3,
                    rollingAscent3Days: rollingAscent,
                    userThreshold: threshold,
                    suggestedAction: 'INSERT_REST_DAY',
                    explanation: `第 ${i + 1}-${i + 3} 天连续累计爬升 ${rollingAscent.toFixed(0)}m，超过阈值 ${threshold}m，建议在第 ${i + 2} 或 ${i + 3} 天插入休息日`,
                };
            }
        }
        return {
            detected: false,
            suggestedAction: 'NONE',
            explanation: '未检测到连续疲劳',
            rollingAscent3Days: 0,
            userThreshold: threshold,
        };
    }
    async calculateCorridorQuality(plan) {
        var _a;
        if (plan.days.length === 0) {
            return undefined;
        }
        const elevations = [];
        const slopes = [];
        for (const day of plan.days) {
            if ((_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.maxElevation) {
                elevations.push(day.terrainFacts.maxElevation);
            }
        }
        if (elevations.length === 0) {
            return undefined;
        }
        const elevationVariance = this.calculateElevationVariance(elevations);
        const viewExposureScore = this.calculateViewExposureScore(elevations);
        const slopePenalty = this.calculateSlopePenalty(plan.days);
        const totalScore = Math.max(0, Math.min(100, viewExposureScore * 0.4 +
            elevationVariance * 0.3 -
            slopePenalty * 0.3));
        return {
            totalScore,
            viewExposureScore,
            elevationVariance,
            slopePenalty,
            explanation: `走廊质量评分：${totalScore.toFixed(1)}/100。观景暴露度 ${viewExposureScore.toFixed(1)}，海拔变化 ${elevationVariance.toFixed(1)}，坡度惩罚 ${slopePenalty.toFixed(1)}`,
        };
    }
    calculateElevationVariance(elevations) {
        if (elevations.length < 2) {
            return 50;
        }
        const mean = elevations.reduce((a, b) => a + b, 0) / elevations.length;
        const variance = elevations.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / elevations.length;
        const stdDev = Math.sqrt(variance);
        return Math.min(100, (stdDev / 1000) * 100);
    }
    calculateViewExposureScore(elevations) {
        if (elevations.length === 0) {
            return 50;
        }
        const maxElevation = Math.max(...elevations);
        const minElevation = Math.min(...elevations);
        const range = maxElevation - minElevation;
        const rangeScore = Math.min(100, (range / 3000) * 100);
        const peakScore = Math.min(100, (maxElevation / 4000) * 100);
        return (rangeScore + peakScore) / 2;
    }
    calculateSlopePenalty(days) {
        var _a, _b;
        let totalAscent = 0;
        let totalDistance = 0;
        for (const day of days) {
            totalAscent += (_b = (_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.totalAscent) !== null && _b !== void 0 ? _b : 0;
            totalDistance += 20;
        }
        if (totalDistance === 0) {
            return 0;
        }
        const avgSlope = (totalAscent / totalDistance) * 100;
        return Math.min(100, (avgSlope / 20) * 100);
    }
    generateExplainableFailure(evidences, rollingFatigue, userConstraints) {
        const hardViolations = evidences.filter(e => e.violation === 'HARD');
        const softViolations = evidences.filter(e => e.violation === 'SOFT');
        if (hardViolations.length === 0 && softViolations.length === 0 && !(rollingFatigue === null || rollingFatigue === void 0 ? void 0 : rollingFatigue.detected)) {
            return undefined;
        }
        const affectedDays = [];
        const reasons = [];
        for (const evidence of hardViolations) {
            const dayMatch = evidence.segmentId.match(/day-(\d+)/);
            if (dayMatch) {
                const day = parseInt(dayMatch[1], 10);
                affectedDays.push(day);
                reasons.push(`第 ${day} 天：${evidence.explanation}`);
            }
        }
        if (rollingFatigue === null || rollingFatigue === void 0 ? void 0 : rollingFatigue.detected) {
            for (let day = rollingFatigue.startDay; day <= rollingFatigue.endDay; day++) {
                if (!affectedDays.includes(day)) {
                    affectedDays.push(day);
                }
            }
            reasons.push(rollingFatigue.explanation);
        }
        let userImpact = '不是因为你不行，而是因为：\n';
        if (hardViolations.length > 0) {
            userImpact += `- 路线地形与你的体力模型存在冲突\n`;
        }
        if (rollingFatigue === null || rollingFatigue === void 0 ? void 0 : rollingFatigue.detected) {
            userImpact += `- 连续高强度活动可能导致过度疲劳\n`;
        }
        if (softViolations.length > 0) {
            userImpact += `- 建议调整节奏以提升体验\n`;
        }
        return {
            reason: reasons.join('；'),
            affectedDays: [...new Set(affectedDays)].sort((a, b) => a - b),
            userImpact,
        };
    }
    validatePlanHasEvidence(plan, evidenceResult) {
        if (evidenceResult.segmentEvidences.length === 0) {
            return {
                isValid: false,
                reason: '计划缺少 DEM 证据，无法验证地形约束',
            };
        }
        if (evidenceResult.hasHardViolation) {
            return {
                isValid: false,
                reason: '计划存在硬约束违规，必须修复后才能继续',
            };
        }
        return { isValid: true };
    }
};
exports.DemDecisionEvidencePipelineService = DemDecisionEvidencePipelineService;
exports.DemDecisionEvidencePipelineService = DemDecisionEvidencePipelineService = DemDecisionEvidencePipelineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [dem_elevation_service_1.DEMElevationService,
        dem_effort_metadata_service_1.DEMEffortMetadataService])
], DemDecisionEvidencePipelineService);
//# sourceMappingURL=dem-decision-evidence-pipeline.service.js.map