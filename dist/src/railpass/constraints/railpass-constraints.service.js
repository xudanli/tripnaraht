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
var RailPassConstraintsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailPassConstraintsService = void 0;
const common_1 = require("@nestjs/common");
const compliance_validator_service_1 = require("../services/compliance-validator.service");
const pass_coverage_checker_service_1 = require("../services/pass-coverage-checker.service");
let RailPassConstraintsService = RailPassConstraintsService_1 = class RailPassConstraintsService {
    constructor(complianceValidator, coverageChecker) {
        this.complianceValidator = complianceValidator;
        this.coverageChecker = coverageChecker;
        this.logger = new common_1.Logger(RailPassConstraintsService_1.name);
    }
    checkReservationMandatory(segments, reservationTasks) {
        const violations = [];
        for (const task of reservationTasks) {
            if (task.status === 'NEEDED') {
                const segment = segments.find(s => s.segmentId === task.segmentId);
                if (segment) {
                    violations.push({
                        code: 'RAILPASS_RESERVATION_MANDATORY',
                        severity: 'error',
                        message: `Rail segment ${task.segmentId} 必须订座但尚未订座`,
                        slotId: task.segmentId,
                        details: {
                            segmentId: task.segmentId,
                            isNightTrain: segment.isNightTrain,
                            isHighSpeed: segment.isHighSpeed,
                            isInternational: segment.isInternational,
                        },
                        suggestions: [
                            '立即订座',
                            '选择备用路线（慢车）',
                            '调整出发时间',
                        ],
                    });
                }
            }
        }
        return violations;
    }
    checkHomeCountryRule(passProfile) {
        const violations = [];
        if (passProfile.passFamily !== 'INTERRAIL') {
            return violations;
        }
        if (passProfile.homeCountryOutboundUsed > 1) {
            violations.push({
                code: 'RAILPASS_HOME_COUNTRY_OUTBOUND_EXCEEDED',
                severity: 'error',
                message: `Interrail 在居住国 ${passProfile.residencyCountry} 的 outbound 使用次数超限（已用 ${passProfile.homeCountryOutboundUsed}，最多 1 次）`,
                details: {
                    residencyCountry: passProfile.residencyCountry,
                    outboundUsed: passProfile.homeCountryOutboundUsed,
                    maxAllowed: 1,
                },
                suggestions: [
                    '移除多余的居住国 outbound 段',
                    '改用其他交通方式（飞机/巴士）',
                ],
            });
        }
        if (passProfile.homeCountryInboundUsed > 1) {
            violations.push({
                code: 'RAILPASS_HOME_COUNTRY_INBOUND_EXCEEDED',
                severity: 'error',
                message: `Interrail 在居住国 ${passProfile.residencyCountry} 的 inbound 使用次数超限（已用 ${passProfile.homeCountryInboundUsed}，最多 1 次）`,
                details: {
                    residencyCountry: passProfile.residencyCountry,
                    inboundUsed: passProfile.homeCountryInboundUsed,
                    maxAllowed: 1,
                },
                suggestions: [
                    '移除多余的居住国 inbound 段',
                    '改用其他交通方式（飞机/巴士）',
                ],
            });
        }
        return violations;
    }
    checkTravelDayBudget(passProfile, segments, travelDayResult) {
        const violations = [];
        if (passProfile.validityType !== 'FLEXI' || !passProfile.travelDaysTotal) {
            return violations;
        }
        if (travelDayResult.totalDaysUsed > passProfile.travelDaysTotal) {
            violations.push({
                code: 'RAILPASS_TRAVEL_DAY_BUDGET_EXCEEDED',
                severity: 'error',
                message: `Travel Days 超限：已用 ${travelDayResult.totalDaysUsed} 天，Pass 仅 ${passProfile.travelDaysTotal} 天`,
                details: {
                    totalDaysUsed: travelDayResult.totalDaysUsed,
                    travelDaysTotal: passProfile.travelDaysTotal,
                    overage: travelDayResult.totalDaysUsed - passProfile.travelDaysTotal,
                },
                suggestions: [
                    '减少 rail segments',
                    '合并行程到同一 Travel Day',
                    '升级到更多 Travel Days 的 Pass',
                ],
            });
        }
        else if (travelDayResult.remainingDays !== undefined && travelDayResult.remainingDays < 2) {
            violations.push({
                code: 'RAILPASS_TRAVEL_DAY_BUDGET_LOW',
                severity: 'warning',
                message: `Travel Days 剩余较少（${travelDayResult.remainingDays} 天），建议检查行程安排`,
                details: {
                    remainingDays: travelDayResult.remainingDays,
                    travelDaysTotal: passProfile.travelDaysTotal,
                },
                suggestions: [
                    '确认所有必需的行程都在计划内',
                    '考虑升级 Pass',
                ],
            });
        }
        return violations;
    }
    checkReservationBudget(reservationTasks, maxBudget) {
        const violations = [];
        if (!maxBudget) {
            return violations;
        }
        const totalCost = reservationTasks
            .filter(t => t.cost !== undefined)
            .reduce((sum, t) => sum + (t.cost || 0), 0);
        const estimatedPendingCost = reservationTasks
            .filter(t => t.status === 'NEEDED' || t.status === 'PLANNED')
            .length * 30;
        const totalEstimatedCost = totalCost + estimatedPendingCost;
        if (totalEstimatedCost > maxBudget) {
            const overage = totalEstimatedCost - maxBudget;
            violations.push({
                code: 'RAILPASS_RESERVATION_BUDGET_EXCEEDED',
                severity: totalEstimatedCost > maxBudget * 1.2 ? 'error' : 'warning',
                message: `订座费用预估超过预算：预计 ${totalEstimatedCost.toFixed(2)} EUR，预算 ${maxBudget} EUR（超支 ${overage.toFixed(2)} EUR）`,
                details: {
                    totalEstimatedCost,
                    maxBudget,
                    overage,
                    currency: 'EUR',
                },
                suggestions: [
                    '选择不需订座的慢车路线',
                    '调整行程避开夜车/高铁',
                    '增加订座预算',
                ],
            });
        }
        return violations;
    }
    checkPassCoverage(segment, passProfile) {
        var _a;
        const violations = [];
        const coverageResult = this.coverageChecker.checkCoverage(segment, passProfile);
        if (!coverageResult.covered) {
            violations.push({
                code: 'RAILPASS_COVERAGE_NOT_COVERED',
                severity: 'error',
                message: `Segment ${segment.segmentId} 不在 Pass 覆盖范围内`,
                slotId: segment.segmentId,
                details: {
                    segmentId: segment.segmentId,
                    coverageStatus: coverageResult.status,
                    explanation: coverageResult.explanation,
                },
                suggestions: ((_a = coverageResult.alternatives) === null || _a === void 0 ? void 0 : _a.map(alt => alt.description)) || [
                    '选择其他覆盖的路线',
                    '单独购买该段车票',
                ],
            });
        }
        else if (coverageResult.status === 'UNKNOWN') {
            violations.push({
                code: 'RAILPASS_COVERAGE_UNKNOWN',
                severity: 'warning',
                message: `Segment ${segment.segmentId} 的覆盖状态未知，建议确认`,
                slotId: segment.segmentId,
                details: {
                    segmentId: segment.segmentId,
                    explanation: coverageResult.explanation,
                },
                suggestions: [
                    '查看 Rail Planner 确认覆盖状态',
                    '咨询官方客服',
                ],
            });
        }
        return violations;
    }
    checkLastDayNightTrain(segment, passProfile) {
        const violations = [];
        const validityEndDate = new Date(passProfile.validityEndDate);
        const segmentDate = new Date(segment.departureDate);
        const isLastDay = segmentDate.getTime() === validityEndDate.getTime();
        if (isLastDay && segment.isNightTrain && segment.crossesMidnight) {
            violations.push({
                code: 'RAILPASS_LAST_DAY_NIGHT_TRAIN',
                severity: 'error',
                message: `Pass 在有效期最后一天 23:59 过期，不能乘坐需要跨到次日的夜车`,
                slotId: segment.segmentId,
                details: {
                    segmentId: segment.segmentId,
                    validityEndDate: passProfile.validityEndDate,
                    segmentDate: segment.departureDate,
                },
                suggestions: [
                    '改为白天车',
                    '提前一天出发',
                    '选择不需要跨午夜的夜车',
                ],
            });
        }
        return violations;
    }
    checkAllConstraints(args) {
        const violations = [];
        for (const segment of args.segments) {
            violations.push(...this.checkPassCoverage(segment, args.passProfile));
            violations.push(...this.checkLastDayNightTrain(segment, args.passProfile));
        }
        violations.push(...this.checkReservationMandatory(args.segments, args.reservationTasks));
        violations.push(...this.checkHomeCountryRule(args.passProfile));
        if (args.travelDayResult) {
            violations.push(...this.checkTravelDayBudget(args.passProfile, args.segments, args.travelDayResult));
        }
        violations.push(...this.checkReservationBudget(args.reservationTasks, args.maxReservationBudget));
        return violations;
    }
};
exports.RailPassConstraintsService = RailPassConstraintsService;
exports.RailPassConstraintsService = RailPassConstraintsService = RailPassConstraintsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [compliance_validator_service_1.ComplianceValidatorService,
        pass_coverage_checker_service_1.PassCoverageCheckerService])
], RailPassConstraintsService);
//# sourceMappingURL=railpass-constraints.service.js.map