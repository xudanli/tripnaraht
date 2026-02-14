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
var ComplianceValidatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceValidatorService = void 0;
const common_1 = require("@nestjs/common");
const eligibility_engine_service_1 = require("./eligibility-engine.service");
const travel_day_calculation_engine_service_1 = require("./travel-day-calculation-engine.service");
const reservation_orchestration_service_1 = require("./reservation-orchestration.service");
let ComplianceValidatorService = ComplianceValidatorService_1 = class ComplianceValidatorService {
    constructor(eligibilityEngine, travelDayCalculator, reservationOrchestrator) {
        this.eligibilityEngine = eligibilityEngine;
        this.travelDayCalculator = travelDayCalculator;
        this.reservationOrchestrator = reservationOrchestrator;
        this.logger = new common_1.Logger(ComplianceValidatorService_1.name);
    }
    validateCompliance(input) {
        const violations = [];
        const warnings = [];
        const { passProfile, segments, reservationTasks } = input;
        if (passProfile.passFamily === 'INTERRAIL') {
            const homeCountryValidation = this.eligibilityEngine.validateHomeCountryUsage({
                passFamily: passProfile.passFamily,
                residencyCountry: passProfile.residencyCountry,
                outboundUsed: passProfile.homeCountryOutboundUsed,
                inboundUsed: passProfile.homeCountryInboundUsed,
            });
            if (!homeCountryValidation.valid) {
                homeCountryValidation.violations.forEach(msg => {
                    violations.push({
                        code: 'HOME_COUNTRY_USAGE_EXCEEDED',
                        severity: 'error',
                        message: msg,
                    });
                });
            }
        }
        if (passProfile.validityType === 'FLEXI' && passProfile.travelDaysTotal) {
            const travelDayResult = this.travelDayCalculator.calculateTravelDays({
                segments,
                passProfile,
            });
            if (travelDayResult.violations && travelDayResult.violations.length > 0) {
                travelDayResult.violations.forEach(v => {
                    violations.push({
                        code: 'TRAVEL_DAY_BUDGET_EXCEEDED',
                        severity: 'error',
                        message: v.message,
                        details: {
                            date: v.date,
                        },
                    });
                });
            }
            if (travelDayResult.remainingDays !== undefined && travelDayResult.remainingDays < 2) {
                warnings.push({
                    code: 'TRAVEL_DAY_BUDGET_LOW',
                    severity: 'warning',
                    message: `Travel Days 剩余较少（${travelDayResult.remainingDays} 天），建议检查行程安排`,
                });
            }
        }
        if (reservationTasks) {
            const pendingTasks = this.reservationOrchestrator.getPendingTasks(reservationTasks);
            const neededTasks = pendingTasks.filter(t => t.status === 'NEEDED');
            if (neededTasks.length > 0) {
                neededTasks.forEach(task => {
                    const segment = segments.find(s => s.segmentId === task.segmentId);
                    if (segment) {
                        violations.push({
                            code: 'RESERVATION_MANDATORY_NOT_BOOKED',
                            severity: 'error',
                            message: `Segment ${task.segmentId} 必须订座但尚未订座`,
                            segmentId: task.segmentId,
                            details: {
                                isNightTrain: segment.isNightTrain,
                                isHighSpeed: segment.isHighSpeed,
                                isInternational: segment.isInternational,
                            },
                        });
                    }
                });
            }
        }
        for (const segment of segments) {
            const segmentDate = segment.departureDate;
            if (segmentDate < passProfile.validityStartDate || segmentDate > passProfile.validityEndDate) {
                violations.push({
                    code: 'PASS_VALIDITY_EXCEEDED',
                    severity: 'error',
                    message: `Segment ${segment.segmentId} 的日期超出 Pass 有效期`,
                    segmentId: segment.segmentId,
                    details: {
                        segmentDate,
                        validityStart: passProfile.validityStartDate,
                        validityEnd: passProfile.validityEndDate,
                    },
                });
            }
        }
        return {
            valid: violations.length === 0,
            violations,
            warnings,
        };
    }
    generateUserExplanation(result) {
        const parts = [];
        if (result.valid) {
            parts.push('✅ 行程符合 RailPass 规则');
        }
        else {
            parts.push('❌ 发现以下合规问题：');
            result.violations.forEach((v, idx) => {
                parts.push(`${idx + 1}. ${v.message}`);
            });
        }
        if (result.warnings.length > 0) {
            parts.push('\n⚠️ 警告：');
            result.warnings.forEach((w, idx) => {
                parts.push(`${idx + 1}. ${w.message}`);
            });
        }
        return parts.join('\n');
    }
};
exports.ComplianceValidatorService = ComplianceValidatorService;
exports.ComplianceValidatorService = ComplianceValidatorService = ComplianceValidatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [eligibility_engine_service_1.EligibilityEngineService,
        travel_day_calculation_engine_service_1.TravelDayCalculationEngineService,
        reservation_orchestration_service_1.ReservationOrchestrationService])
], ComplianceValidatorService);
//# sourceMappingURL=compliance-validator.service.js.map