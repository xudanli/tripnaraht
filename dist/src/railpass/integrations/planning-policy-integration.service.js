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
var PlanningPolicyIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningPolicyIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const reservation_decision_engine_service_1 = require("../services/reservation-decision-engine.service");
const reservation_orchestration_service_1 = require("../services/reservation-orchestration.service");
let PlanningPolicyIntegrationService = PlanningPolicyIntegrationService_1 = class PlanningPolicyIntegrationService {
    constructor(reservationEngine, reservationOrchestrator) {
        this.reservationEngine = reservationEngine;
        this.reservationOrchestrator = reservationOrchestrator;
        this.logger = new common_1.Logger(PlanningPolicyIntegrationService_1.name);
    }
    async evaluateRailPassRobustness(args) {
        const { passProfile, segments, reservationTasks, travelDaysUsed, travelDaysTotal } = args;
        let reservationFailureRisk = 0;
        let quotaRiskSegmentsCount = 0;
        let mandatoryReservationMissingCount = 0;
        const feeEstimates = [];
        for (const segment of segments) {
            const requirement = this.reservationEngine.checkReservation(segment);
            const task = reservationTasks.find(t => t.segmentId === segment.segmentId);
            if (requirement.required) {
                if (!task || task.status !== 'BOOKED') {
                    mandatoryReservationMissingCount++;
                    switch (requirement.quotaRisk) {
                        case 'HIGH':
                            reservationFailureRisk += 0.4;
                            quotaRiskSegmentsCount++;
                            break;
                        case 'MEDIUM':
                            reservationFailureRisk += 0.2;
                            quotaRiskSegmentsCount++;
                            break;
                        case 'LOW':
                            reservationFailureRisk += 0.05;
                            break;
                    }
                }
                else {
                    if (requirement.quotaRisk === 'HIGH') {
                        reservationFailureRisk += 0.1;
                    }
                }
                if (requirement.feeEstimate) {
                    feeEstimates.push({
                        min: requirement.feeEstimate.min,
                        max: requirement.feeEstimate.max,
                    });
                }
            }
        }
        reservationFailureRisk = Math.min(1, reservationFailureRisk / Math.max(1, segments.length));
        const totalReservationFeeEstimate = {
            min: feeEstimates.reduce((sum, e) => sum + e.min, 0),
            max: feeEstimates.reduce((sum, e) => sum + e.max, 0),
            currency: 'EUR',
        };
        let travelDayRisk;
        if (passProfile.validityType === 'FLEXI' && travelDaysTotal && travelDaysUsed !== undefined) {
            const daysRemaining = travelDaysTotal - travelDaysUsed;
            const nearLimit = daysRemaining <= 2;
            travelDayRisk = {
                daysUsed: travelDaysUsed,
                daysRemaining,
                nearLimit,
            };
        }
        let overallRiskLevel = 'LOW';
        if (mandatoryReservationMissingCount > 0) {
            overallRiskLevel = 'HIGH';
        }
        else if (quotaRiskSegmentsCount > 0 || reservationFailureRisk > 0.3) {
            overallRiskLevel = 'MEDIUM';
        }
        else if (travelDayRisk === null || travelDayRisk === void 0 ? void 0 : travelDayRisk.nearLimit) {
            overallRiskLevel = 'MEDIUM';
        }
        return {
            reservationFailureRisk,
            quotaRiskSegmentsCount,
            mandatoryReservationMissingCount,
            totalReservationFeeEstimate,
            travelDayRisk,
            overallRiskLevel,
        };
    }
    convertToRiskPenalty(metrics) {
        var _a;
        let penalty = 0;
        penalty += metrics.reservationFailureRisk * 0.4;
        if (metrics.mandatoryReservationMissingCount > 0) {
            penalty += 0.3;
        }
        if ((_a = metrics.travelDayRisk) === null || _a === void 0 ? void 0 : _a.nearLimit) {
            penalty += 0.2;
        }
        if (metrics.quotaRiskSegmentsCount > 0) {
            penalty += Math.min(0.1, metrics.quotaRiskSegmentsCount * 0.05);
        }
        return Math.min(1, penalty);
    }
    generateRobustnessImprovements(metrics) {
        var _a;
        const suggestions = [];
        if (metrics.mandatoryReservationMissingCount > 0) {
            suggestions.push(`有 ${metrics.mandatoryReservationMissingCount} 个必须订座的段尚未订座，建议尽快订座`);
        }
        if (metrics.quotaRiskSegmentsCount > 0) {
            suggestions.push(`有 ${metrics.quotaRiskSegmentsCount} 个段订座配额紧张，建议提前订座或选择替代路线`);
        }
        if (metrics.reservationFailureRisk > 0.3) {
            suggestions.push(`订座失败风险较高（${(metrics.reservationFailureRisk * 100).toFixed(0)}%），建议准备备用方案`);
        }
        if ((_a = metrics.travelDayRisk) === null || _a === void 0 ? void 0 : _a.nearLimit) {
            suggestions.push(`Travel Days 剩余较少（${metrics.travelDayRisk.daysRemaining} 天），建议优化行程安排`);
        }
        if (metrics.totalReservationFeeEstimate.max > 100) {
            suggestions.push(`订座费用预估较高（最多 ${metrics.totalReservationFeeEstimate.max} EUR），建议考虑替代方案`);
        }
        return suggestions;
    }
};
exports.PlanningPolicyIntegrationService = PlanningPolicyIntegrationService;
exports.PlanningPolicyIntegrationService = PlanningPolicyIntegrationService = PlanningPolicyIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [reservation_decision_engine_service_1.ReservationDecisionEngineService,
        reservation_orchestration_service_1.ReservationOrchestrationService])
], PlanningPolicyIntegrationService);
//# sourceMappingURL=planning-policy-integration.service.js.map