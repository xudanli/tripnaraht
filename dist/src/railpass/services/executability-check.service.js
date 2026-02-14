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
var ExecutabilityCheckService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutabilityCheckService = void 0;
const common_1 = require("@nestjs/common");
const reservation_decision_engine_service_1 = require("./reservation-decision-engine.service");
const travel_day_calculation_engine_service_1 = require("./travel-day-calculation-engine.service");
const compliance_validator_service_1 = require("./compliance-validator.service");
const railpass_constraints_service_1 = require("../constraints/railpass-constraints.service");
let ExecutabilityCheckService = ExecutabilityCheckService_1 = class ExecutabilityCheckService {
    constructor(reservationEngine, travelDayCalculator, complianceValidator, constraintsService) {
        this.reservationEngine = reservationEngine;
        this.travelDayCalculator = travelDayCalculator;
        this.complianceValidator = complianceValidator;
        this.constraintsService = constraintsService;
        this.logger = new common_1.Logger(ExecutabilityCheckService_1.name);
    }
    async checkExecutability(input) {
        const { passProfile, segments, reservationTasks = [], placeNames } = input;
        const segmentCards = [];
        let executableCount = 0;
        let needConfirmationCount = 0;
        let highRiskCount = 0;
        let travelDayResult;
        if (passProfile.validityType === 'FLEXI' && passProfile.travelDaysTotal) {
            travelDayResult = this.travelDayCalculator.calculateTravelDays({
                segments,
                passProfile,
            });
        }
        for (const segment of segments) {
            const card = await this.generateSegmentCard({
                segment,
                passProfile,
                reservationTasks,
                travelDayResult,
                placeNames,
            });
            segmentCards.push(card);
            if (card.coverage === 'COVERED' && card.riskLevel !== 'HIGH') {
                executableCount++;
            }
            else if (card.coverage === 'UNKNOWN' || card.reservationInfo.status === 'UNKNOWN') {
                needConfirmationCount++;
            }
            if (card.riskLevel === 'HIGH') {
                highRiskCount++;
            }
        }
        const missingInfo = this.checkMissingInfo(passProfile);
        const summarySuggestions = this.generateSummarySuggestions({
            passProfile,
            segments,
            segmentCards,
            travelDayResult,
            missingInfo,
        });
        return {
            executableCount,
            needConfirmationCount,
            highRiskCount,
            estimatedTravelDaysUsed: travelDayResult ? {
                total: travelDayResult.totalDaysUsed,
                remaining: travelDayResult.remainingDays,
                explanation: `预计消耗 ${travelDayResult.totalDaysUsed} 天${travelDayResult.remainingDays !== undefined ? `，剩余 ${travelDayResult.remainingDays} 天` : ''}`,
            } : undefined,
            segments: segmentCards,
            summarySuggestions,
            hasIncompleteProfile: missingInfo.length > 0,
            missingInfo: missingInfo.length > 0 ? missingInfo : undefined,
        };
    }
    async generateSegmentCard(args) {
        var _a;
        const { segment, passProfile, reservationTasks, travelDayResult, placeNames } = args;
        const coverage = this.determineCoverage(segment, passProfile);
        let travelDayInfo;
        if (passProfile.validityType === 'FLEXI' && travelDayResult) {
            const dayInfo = travelDayResult.daysByDate[segment.departureDate];
            if (dayInfo && dayInfo.consumed) {
                travelDayInfo = {
                    consumed: true,
                    daysConsumed: dayInfo.crossesMidnight ? 2 : 1,
                    explanation: `Flexi 消耗 ${dayInfo.crossesMidnight ? 2 : 1} 天${dayInfo.crossesMidnight ? '（跨午夜）' : '（当天乘车）'}`,
                };
            }
        }
        const reservationRequirement = this.reservationEngine.checkReservation(segment);
        const task = reservationTasks.find(t => t.segmentId === segment.segmentId);
        let reservationStatus;
        if (reservationRequirement.required) {
            reservationStatus = (task === null || task === void 0 ? void 0 : task.status) === 'BOOKED' ? 'REQUIRED' : 'REQUIRED';
        }
        else if (segment.isHighSpeed || segment.isInternational) {
            reservationStatus = 'UNKNOWN';
        }
        else {
            reservationStatus = 'NOT_REQUIRED';
        }
        const riskLevel = this.determineRiskLevel({
            coverage,
            reservationRequirement,
            segment,
            passProfile,
            task,
        });
        const keySuggestions = this.generateKeySuggestions({
            segment,
            passProfile,
            reservationRequirement,
            task,
            travelDayInfo,
        });
        const details = this.generateDetails({
            segment,
            passProfile,
            reservationRequirement,
            travelDayInfo,
        });
        const fromPlace = (placeNames === null || placeNames === void 0 ? void 0 : placeNames.get(segment.fromPlaceId)) || {
            name: `Place ${segment.fromPlaceId}`,
            countryCode: segment.fromCountryCode,
        };
        const toPlace = (placeNames === null || placeNames === void 0 ? void 0 : placeNames.get(segment.toPlaceId)) || {
            name: `Place ${segment.toPlaceId}`,
            countryCode: segment.toCountryCode,
        };
        return {
            segmentId: segment.segmentId,
            departureTime: ((_a = segment.departureTimeWindow) === null || _a === void 0 ? void 0 : _a.earliest) || segment.departureDate,
            fromPlace,
            toPlace,
            coverage,
            travelDayInfo,
            reservationInfo: {
                status: reservationStatus,
                mandatoryReason: reservationRequirement.mandatoryReasonCode,
                feeEstimate: reservationRequirement.feeEstimate,
                riskLevel: reservationRequirement.quotaRisk,
                suggestions: this.generateReservationSuggestions(reservationRequirement, segment),
            },
            riskLevel,
            keySuggestions,
            details,
        };
    }
    determineCoverage(segment, passProfile) {
        if (passProfile.passType === 'ONE_COUNTRY') {
            return 'COVERED';
        }
        if (segment.isInternational) {
            return 'COVERED';
        }
        const segmentDate = new Date(segment.departureDate);
        const validityStart = new Date(passProfile.validityStartDate);
        const validityEnd = new Date(passProfile.validityEndDate);
        if (segmentDate < validityStart || segmentDate > validityEnd) {
            return 'NOT_COVERED';
        }
        return 'COVERED';
    }
    determineRiskLevel(args) {
        const { coverage, reservationRequirement, segment, passProfile, task } = args;
        if (coverage === 'NOT_COVERED') {
            return 'HIGH';
        }
        if (reservationRequirement.required && (task === null || task === void 0 ? void 0 : task.status) !== 'BOOKED') {
            return 'HIGH';
        }
        if (reservationRequirement.quotaRisk === 'HIGH') {
            return 'HIGH';
        }
        if (coverage === 'UNKNOWN' || reservationRequirement.quotaRisk === 'MEDIUM') {
            return 'MEDIUM';
        }
        return 'LOW';
    }
    generateKeySuggestions(args) {
        const suggestions = [];
        const { segment, passProfile, reservationRequirement, task, travelDayInfo } = args;
        if (passProfile.mobileOrPaper === 'MOBILE') {
            suggestions.push('上车前把该段 Journey 加入通票');
        }
        if (reservationRequirement.required && (task === null || task === void 0 ? void 0 : task.status) !== 'BOOKED') {
            suggestions.push('建议提前确认是否强制订座；订不到可换慢车/换时段');
        }
        else if (segment.isHighSpeed || segment.isInternational) {
            suggestions.push('建议提前确认是否强制订座');
        }
        return suggestions.slice(0, 2);
    }
    generateDetails(args) {
        const { segment, passProfile, reservationRequirement, travelDayInfo } = args;
        const details = {};
        if (passProfile.mobileOrPaper === 'MOBILE') {
            details.mobilePassReminders = [
                '需定期联网验证，离线过久可能导致 inactive',
                '每 24 小时必须联网一次',
            ];
        }
        if (reservationRequirement.quotaRisk === 'HIGH' || reservationRequirement.quotaRisk === 'MEDIUM') {
            details.peakSeasonWarnings = [
                '如为周末/节假日热门时段：可能售罄（建议提前订）',
            ];
        }
        if (travelDayInfo && travelDayInfo.daysConsumed === 2) {
            details.ruleExplanation = [
                '夜车跨午夜换乘会消耗 2 个 Travel Day',
                '直达夜车且午夜后不换乘通常只消耗 1 天',
            ];
        }
        return Object.keys(details).length > 0 ? details : undefined;
    }
    generateReservationSuggestions(requirement, segment) {
        const suggestions = [];
        if (requirement.required) {
            suggestions.push(`必须订座（${requirement.mandatoryReasonCode}）`);
        }
        if (requirement.feeEstimate) {
            suggestions.push(`预估费用：${requirement.feeEstimate.min}-${requirement.feeEstimate.max} ${requirement.feeEstimate.currency}`);
        }
        return suggestions;
    }
    checkMissingInfo(passProfile) {
        const missing = [];
        if (!passProfile.mobileOrPaper) {
            missing.push('载体类型（mobile/paper）');
        }
        if (passProfile.validityType === 'FLEXI' && !passProfile.travelDaysTotal) {
            missing.push('Travel Days 总数');
        }
        return missing;
    }
    generateSummarySuggestions(args) {
        const suggestions = [];
        const { passProfile, segmentCards, travelDayResult, missingInfo } = args;
        if (missingInfo.length > 0) {
            suggestions.push('建议补全通票信息以获得更准确的检查结果');
        }
        const highRiskCount = segmentCards.filter(c => c.riskLevel === 'HIGH').length;
        if (highRiskCount > 0) {
            suggestions.push(`有 ${highRiskCount} 个高风险段需要关注`);
        }
        if (travelDayResult && travelDayResult.remainingDays !== undefined) {
            if (travelDayResult.remainingDays < 2) {
                suggestions.push('Travel Days 剩余较少，建议检查行程安排');
            }
        }
        return suggestions;
    }
    async generateHighRiskAlerts(input) {
        const { passProfile, segments, reservationTasks = [] } = input;
        const alerts = [];
        const complianceResult = await this.complianceValidator.validateCompliance({
            passProfile,
            segments,
            reservationTasks,
        });
        for (const violation of complianceResult.violations) {
            if (violation.severity === 'error') {
                const alert = this.createAlertFromViolation(violation, segments, passProfile);
                if (alert) {
                    alerts.push(alert);
                }
            }
        }
        return alerts;
    }
    createAlertFromViolation(violation, segments, passProfile) {
        var _a, _b;
        const segmentId = violation.segmentId;
        const segment = segments.find(s => s.segmentId === segmentId);
        switch (violation.code) {
            case 'RAILPASS_HOME_COUNTRY_OUTBOUND_EXCEEDED':
            case 'RAILPASS_HOME_COUNTRY_INBOUND_EXCEEDED':
                return {
                    type: 'HOME_COUNTRY_LIMIT',
                    affectedSegmentIds: segmentId ? [segmentId] : [],
                    explanation: `这段涉及居住国（${passProfile.residencyCountry}）境内使用。Interrail Global 通常只允许居住国 outbound/inbound 两次。`,
                    alternatives: [
                        {
                            id: 'buy_separate_ticket',
                            title: '这段改为单独买票',
                            description: '不占用通票规则风险',
                            impact: {
                                costDelta: 50,
                            },
                        },
                        {
                            id: 'adjust_route',
                            title: '调整路线',
                            description: '把居住国境内行程集中在同一天作为 outbound/inbound 使用',
                        },
                    ],
                    severity: 'error',
                };
            case 'RAILPASS_TRAVEL_DAY_BUDGET_EXCEEDED':
                return {
                    type: 'TRAVEL_DAY_OVERUSE',
                    affectedSegmentIds: [],
                    explanation: `Travel Days 已超限。已用 ${(_a = violation.details) === null || _a === void 0 ? void 0 : _a.totalDaysUsed} 天，Pass 仅 ${(_b = violation.details) === null || _b === void 0 ? void 0 : _b.travelDaysTotal} 天。`,
                    alternatives: [
                        {
                            id: 'reduce_segments',
                            title: '减少 rail segments',
                            description: '合并行程到同一 Travel Day',
                        },
                        {
                            id: 'upgrade_pass',
                            title: '升级到更多 Travel Days 的 Pass',
                            description: '购买更多 Travel Days 的 Flexi Pass',
                        },
                    ],
                    severity: 'error',
                };
            case 'RAILPASS_RESERVATION_MANDATORY':
                if ((segment === null || segment === void 0 ? void 0 : segment.isNightTrain) && (segment === null || segment === void 0 ? void 0 : segment.crossesMidnight)) {
                    return {
                        type: 'NIGHT_TRAIN_2_DAYS',
                        affectedSegmentIds: [segmentId],
                        explanation: '这趟夜车午夜后还有换乘，Flexi 可能会扣 2 个 Travel Day。',
                        alternatives: [
                            {
                                id: 'direct_night_train',
                                title: '换成直达夜车',
                                description: '通常只扣出发日 1 天',
                            },
                            {
                                id: 'day_train_plus_hotel',
                                title: '改为白天车 + 晚上住宿',
                                description: '更省 Travel Day',
                                impact: {
                                    travelDaysDelta: -1,
                                    costDelta: 80,
                                },
                            },
                        ],
                        severity: 'warning',
                    };
                }
                return {
                    type: 'RESERVATION_MANDATORY',
                    affectedSegmentIds: [segmentId],
                    explanation: violation.message,
                    alternatives: [
                        {
                            id: 'book_reservation',
                            title: '立即订座',
                            description: '通过 Eurail/Interrail 平台或运营商订座',
                        },
                        {
                            id: 'switch_to_slow_train',
                            title: '选择备用路线（慢车）',
                            description: '不需要订座，但耗时更长',
                            impact: {
                                timeDelta: 60,
                            },
                        },
                    ],
                    severity: 'error',
                };
            default:
                return null;
        }
    }
};
exports.ExecutabilityCheckService = ExecutabilityCheckService;
exports.ExecutabilityCheckService = ExecutabilityCheckService = ExecutabilityCheckService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [reservation_decision_engine_service_1.ReservationDecisionEngineService,
        travel_day_calculation_engine_service_1.TravelDayCalculationEngineService,
        compliance_validator_service_1.ComplianceValidatorService,
        railpass_constraints_service_1.RailPassConstraintsService])
], ExecutabilityCheckService);
//# sourceMappingURL=executability-check.service.js.map