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
var TripFeedbackService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripFeedbackService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let TripFeedbackService = TripFeedbackService_1 = class TripFeedbackService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TripFeedbackService_1.name);
    }
    async analyzeFeedback(feedback, decisionLogs) {
        var _a;
        this.logger.debug(`分析旅程反馈: ${feedback.tripId}`);
        const adjustments = [];
        if (feedback.overallIntensity === 'TOO_TIRED') {
            const highFatigueDays = this.detectHighFatigueDays(decisionLogs);
            if (highFatigueDays.length >= 2) {
                adjustments.push({
                    profileId: `user_${feedback.userId}`,
                    adjustmentType: 'REDUCE_ASCENT',
                    adjustmentPercentage: -15,
                    reason: `整体太累 + ${highFatigueDays.length} 天疲劳指数 > 1.2`,
                    confidence: 0.8,
                });
            }
            else {
                adjustments.push({
                    profileId: `user_${feedback.userId}`,
                    adjustmentType: 'REDUCE_PACE',
                    adjustmentPercentage: -10,
                    reason: '整体太累，但单日疲劳指数正常',
                    confidence: 0.6,
                });
            }
        }
        else if (feedback.overallIntensity === 'TOO_LIGHT') {
            if (!((_a = feedback.additionalFeedback) === null || _a === void 0 ? void 0 : _a.issues) || feedback.additionalFeedback.issues.length === 0) {
                adjustments.push({
                    profileId: `user_${feedback.userId}`,
                    adjustmentType: 'INCREASE_ASCENT',
                    adjustmentPercentage: 10,
                    reason: '整体太轻，且无负面体验',
                    confidence: 0.7,
                });
            }
        }
        if (feedback.altitudeDiscomfort === 'SEVERE') {
            adjustments.push({
                profileId: `user_${feedback.userId}`,
                adjustmentType: 'ADJUST_ALTITUDE',
                adjustmentPercentage: -20,
                reason: '高海拔不适严重',
                confidence: 0.9,
            });
        }
        else if (feedback.altitudeDiscomfort === 'MILD') {
            adjustments.push({
                profileId: `user_${feedback.userId}`,
                adjustmentType: 'ADJUST_ALTITUDE',
                adjustmentPercentage: -10,
                reason: '高海拔轻微不适',
                confidence: 0.7,
            });
        }
        if (feedback.mostTiredDay) {
            const dayLogs = decisionLogs.filter(log => {
                return true;
            });
            if (dayLogs.length > 0) {
                adjustments.push({
                    profileId: `user_${feedback.userId}`,
                    adjustmentType: 'REDUCE_ASCENT',
                    adjustmentPercentage: -5,
                    reason: `第 ${feedback.mostTiredDay} 天最累`,
                    confidence: 0.6,
                });
            }
        }
        const summary = this.generateSummary(feedback, adjustments);
        return {
            needsAdjustment: adjustments.length > 0,
            adjustments,
            summary,
        };
    }
    async applyAdjustments(profileId, adjustments) {
        this.logger.debug(`应用调整到 HumanCapabilityModel: ${profileId}`);
        const currentModel = {
            profileId,
            maxDailyAscentM: 800,
            rollingAscent3DaysM: 2000,
            maxSlopePct: 25,
            preferredPace: 'MEDIUM',
            riskTolerance: 'MEDIUM',
            highAltitudeExperience: 'NONE',
        };
        for (const adjustment of adjustments) {
            switch (adjustment.adjustmentType) {
                case 'REDUCE_ASCENT':
                    currentModel.maxDailyAscentM *= (1 + adjustment.adjustmentPercentage / 100);
                    currentModel.rollingAscent3DaysM *= (1 + adjustment.adjustmentPercentage / 100);
                    break;
                case 'INCREASE_ASCENT':
                    currentModel.maxDailyAscentM *= (1 + adjustment.adjustmentPercentage / 100);
                    currentModel.rollingAscent3DaysM *= (1 + adjustment.adjustmentPercentage / 100);
                    break;
                case 'REDUCE_PACE':
                    if (currentModel.preferredPace === 'FAST') {
                        currentModel.preferredPace = 'MEDIUM';
                    }
                    else if (currentModel.preferredPace === 'MEDIUM') {
                        currentModel.preferredPace = 'SLOW';
                    }
                    break;
                case 'INCREASE_PACE':
                    if (currentModel.preferredPace === 'SLOW') {
                        currentModel.preferredPace = 'MEDIUM';
                    }
                    else if (currentModel.preferredPace === 'MEDIUM') {
                        currentModel.preferredPace = 'FAST';
                    }
                    break;
                case 'ADJUST_ALTITUDE':
                    if (currentModel.maxElevationM) {
                        currentModel.maxElevationM *= (1 + adjustment.adjustmentPercentage / 100);
                    }
                    break;
            }
        }
        return currentModel;
    }
    calculateRealityAlignmentScore(decisionLogs, feedback) {
        const totalDecisions = decisionLogs.length;
        const realityBasedDecisions = decisionLogs.filter(log => log.decisionSource === 'PHYSICAL' || log.decisionSource === 'HUMAN').length;
        const baseScore = realityBasedDecisions / totalDecisions;
        let satisfactionWeight = 1.0;
        if (feedback.overallIntensity === 'JUST_RIGHT') {
            satisfactionWeight = 1.2;
        }
        else if (feedback.overallIntensity === 'TOO_TIRED' || feedback.overallIntensity === 'TOO_LIGHT') {
            satisfactionWeight = 0.8;
        }
        const finalScore = Math.min(1.0, baseScore * satisfactionWeight);
        return finalScore;
    }
    detectHighFatigueDays(decisionLogs) {
        return [];
    }
    generateSummary(feedback, adjustments) {
        if (adjustments.length === 0) {
            return '反馈分析完成，无需调整 HumanCapabilityModel。';
        }
        const adjustmentTypes = adjustments.map(a => a.adjustmentType).join('、');
        return `反馈分析完成，建议进行以下调整：${adjustmentTypes}。共 ${adjustments.length} 项调整建议。`;
    }
};
exports.TripFeedbackService = TripFeedbackService;
exports.TripFeedbackService = TripFeedbackService = TripFeedbackService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TripFeedbackService);
//# sourceMappingURL=trip-feedback.service.js.map