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
var PlanRegenerationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanRegenerationService = void 0;
const common_1 = require("@nestjs/common");
const reservation_decision_engine_service_1 = require("./reservation-decision-engine.service");
const reservation_orchestration_service_1 = require("./reservation-orchestration.service");
const travel_day_calculation_engine_service_1 = require("./travel-day-calculation-engine.service");
let PlanRegenerationService = PlanRegenerationService_1 = class PlanRegenerationService {
    constructor(reservationEngine, reservationOrchestrator, travelDayCalculator) {
        this.reservationEngine = reservationEngine;
        this.reservationOrchestrator = reservationOrchestrator;
        this.travelDayCalculator = travelDayCalculator;
        this.logger = new common_1.Logger(PlanRegenerationService_1.name);
    }
    async regeneratePlan(input) {
        const { passProfile, segments, reservationTasks, strategy, customParams } = input;
        switch (strategy) {
            case 'MORE_STABLE':
                return this.regenerateForStability(passProfile, segments, reservationTasks);
            case 'MORE_ECONOMICAL':
                return this.regenerateForEconomy(passProfile, segments, reservationTasks);
            case 'MORE_AFFORDABLE':
                return this.regenerateForAffordability(passProfile, segments, reservationTasks);
            case 'CUSTOM':
                return this.regenerateCustom(passProfile, segments, reservationTasks, customParams);
            default:
                throw new Error(`Unknown strategy: ${strategy}`);
        }
    }
    async regenerateForStability(passProfile, segments, reservationTasks) {
        const changes = [];
        const newSegments = [];
        let mandatoryReservationsRemoved = 0;
        for (const segment of segments) {
            const requirement = this.reservationEngine.checkReservation(segment);
            const task = reservationTasks.find(t => t.segmentId === segment.segmentId);
            if (requirement.required && requirement.quotaRisk === 'HIGH') {
                const fallbackOptions = this.reservationEngine.generateFallbackOptions(segment);
                const slowTrainOption = fallbackOptions.find(opt => opt.type === 'SWITCH_TO_SLOW_TRAIN');
                if (slowTrainOption) {
                    const newSegment = {
                        ...segment,
                        segmentId: `${segment.segmentId}_slow`,
                        isHighSpeed: false,
                        isNightTrain: false,
                        t_api: (segment.t_api || 0) + (slowTrainOption.timeDeltaMinutes || 60),
                        t_robust: (segment.t_robust || 0) + (slowTrainOption.timeDeltaMinutes || 60),
                    };
                    changes.push({
                        segmentId: segment.segmentId,
                        changeType: 'REPLACED',
                        oldSegment: segment,
                        newSegment,
                        reason: '避开必须订座的高风险段，改为不需订座的慢车',
                    });
                    newSegments.push(newSegment);
                    mandatoryReservationsRemoved++;
                    continue;
                }
                const shiftTimeOption = fallbackOptions.find(opt => opt.type === 'SHIFT_TIME');
                if (shiftTimeOption) {
                    const oldWindow = segment.departureTimeWindow;
                    if (oldWindow) {
                        const newSegment = {
                            ...segment,
                            segmentId: `${segment.segmentId}_shifted`,
                            departureTimeWindow: {
                                earliest: this.shiftTime(oldWindow.earliest, 2 * 60 * 60 * 1000),
                                latest: this.shiftTime(oldWindow.latest, 2 * 60 * 60 * 1000),
                            },
                        };
                        changes.push({
                            segmentId: segment.segmentId,
                            changeType: 'SHIFTED_TIME',
                            oldSegment: segment,
                            newSegment,
                            reason: '调整出发时间避开高峰时段',
                        });
                        newSegments.push(newSegment);
                        continue;
                    }
                }
            }
            newSegments.push(segment);
        }
        const newReservationPlan = this.reservationOrchestrator.planReservations({
            segments: newSegments,
        });
        return {
            segments: newSegments,
            reservationTasks: newReservationPlan.reservationTasks,
            changes,
            metrics: {
                totalSegmentsBefore: segments.length,
                totalSegmentsAfter: newSegments.length,
                reservationTasksBefore: reservationTasks.length,
                reservationTasksAfter: newReservationPlan.reservationTasks.length,
                mandatoryReservationsRemoved,
            },
            explanation: `已避开 ${mandatoryReservationsRemoved} 个必须订座的高风险段，改为不需订座的替代方案`,
        };
    }
    async regenerateForEconomy(passProfile, segments, reservationTasks) {
        if (passProfile.validityType !== 'FLEXI') {
            return {
                segments,
                reservationTasks,
                changes: [],
                metrics: {
                    totalSegmentsBefore: segments.length,
                    totalSegmentsAfter: segments.length,
                    reservationTasksBefore: reservationTasks.length,
                    reservationTasksAfter: reservationTasks.length,
                },
                explanation: 'Continuous Pass 不涉及 Travel Day 消耗，无需优化',
            };
        }
        const changes = [];
        const newSegments = [];
        let travelDaysSaved = 0;
        const currentTravelDayResult = this.travelDayCalculator.calculateTravelDays({
            segments,
            passProfile,
        });
        const segmentsByDate = new Map();
        for (const seg of segments) {
            const date = seg.departureDate;
            if (!segmentsByDate.has(date)) {
                segmentsByDate.set(date, []);
            }
            segmentsByDate.get(date).push(seg);
        }
        for (const [date, segs] of segmentsByDate.entries()) {
            const nightTrains = segs.filter(s => s.isNightTrain && s.crossesMidnight);
            for (const nightTrain of nightTrains) {
                const fallbackOptions = this.reservationEngine.generateFallbackOptions(nightTrain);
                const splitOption = fallbackOptions.find(opt => opt.type === 'SPLIT_SEGMENT');
                if (splitOption) {
                    changes.push({
                        segmentId: nightTrain.segmentId,
                        changeType: 'REPLACED_WITH_ALTERNATIVE',
                        oldSegment: nightTrain,
                        reason: '将跨午夜夜车改为日间车，节省 Travel Day',
                    });
                    const daySegment = {
                        ...nightTrain,
                        segmentId: `${nightTrain.segmentId}_day`,
                        isNightTrain: false,
                        crossesMidnight: false,
                    };
                    newSegments.push(daySegment);
                    travelDaysSaved++;
                    continue;
                }
            }
            for (const seg of segs) {
                if (!nightTrains.includes(seg)) {
                    newSegments.push(seg);
                }
            }
        }
        const newTravelDayResult = this.travelDayCalculator.calculateTravelDays({
            segments: newSegments,
            passProfile,
        });
        const actualTravelDaysSaved = currentTravelDayResult.totalDaysUsed - newTravelDayResult.totalDaysUsed;
        const newReservationPlan = this.reservationOrchestrator.planReservations({
            segments: newSegments,
        });
        return {
            segments: newSegments,
            reservationTasks: newReservationPlan.reservationTasks,
            changes,
            metrics: {
                totalSegmentsBefore: segments.length,
                totalSegmentsAfter: newSegments.length,
                reservationTasksBefore: reservationTasks.length,
                reservationTasksAfter: newReservationPlan.reservationTasks.length,
                travelDaysSaved: actualTravelDaysSaved,
            },
            explanation: `已优化行程，节省 ${actualTravelDaysSaved} 个 Travel Day（${currentTravelDayResult.totalDaysUsed} → ${newTravelDayResult.totalDaysUsed}）`,
        };
    }
    async regenerateForAffordability(passProfile, segments, reservationTasks) {
        const changes = [];
        const newSegments = [];
        let costChange = 0;
        const totalReservationFee = reservationTasks.reduce((sum, task) => {
            return sum + (task.cost || 0);
        }, 0);
        for (const segment of segments) {
            const requirement = this.reservationEngine.checkReservation(segment);
            const task = reservationTasks.find(t => t.segmentId === segment.segmentId);
            if (requirement.feeEstimate && requirement.feeEstimate.max > 20) {
                const estimatedDirectTicketPrice = this.estimateDirectTicketPrice(segment);
                if (estimatedDirectTicketPrice < requirement.feeEstimate.max) {
                    changes.push({
                        segmentId: segment.segmentId,
                        changeType: 'REPLACED',
                        oldSegment: segment,
                        reason: `直购票（约 ${estimatedDirectTicketPrice} EUR）比 Pass+订座（${requirement.feeEstimate.max} EUR）更便宜，建议单独买票`,
                    });
                    costChange -= requirement.feeEstimate.max;
                    costChange += estimatedDirectTicketPrice;
                    continue;
                }
            }
            newSegments.push(segment);
        }
        const newReservationPlan = this.reservationOrchestrator.planReservations({
            segments: newSegments,
        });
        return {
            segments: newSegments,
            reservationTasks: newReservationPlan.reservationTasks,
            changes,
            metrics: {
                totalSegmentsBefore: segments.length,
                totalSegmentsAfter: newSegments.length,
                reservationTasksBefore: reservationTasks.length,
                reservationTasksAfter: newReservationPlan.reservationTasks.length,
                costChangeEur: costChange,
            },
            explanation: costChange < 0
                ? `建议部分段使用直购票，预计节省 ${Math.abs(costChange).toFixed(2)} EUR`
                : '对比完成，Pass+订座更经济',
        };
    }
    async regenerateCustom(passProfile, segments, reservationTasks, customParams) {
        if (customParams === null || customParams === void 0 ? void 0 : customParams.avoidMandatoryReservations) {
            const stableResult = await this.regenerateForStability(passProfile, segments, reservationTasks);
            segments = stableResult.segments;
            reservationTasks = stableResult.reservationTasks;
        }
        if ((customParams === null || customParams === void 0 ? void 0 : customParams.minimizeTravelDays) && passProfile.validityType === 'FLEXI') {
            const economyResult = await this.regenerateForEconomy(passProfile, segments, reservationTasks);
            segments = economyResult.segments;
            reservationTasks = economyResult.reservationTasks;
        }
        if (customParams === null || customParams === void 0 ? void 0 : customParams.maxReservationFee) {
            const filteredSegments = segments.filter(seg => {
                const requirement = this.reservationEngine.checkReservation(seg);
                return !requirement.feeEstimate || requirement.feeEstimate.max <= customParams.maxReservationFee;
            });
            if (filteredSegments.length < segments.length) {
                segments = filteredSegments;
                const newPlan = this.reservationOrchestrator.planReservations({ segments });
                reservationTasks = newPlan.reservationTasks;
            }
        }
        return {
            segments,
            reservationTasks,
            changes: [],
            metrics: {
                totalSegmentsBefore: segments.length,
                totalSegmentsAfter: segments.length,
                reservationTasksBefore: reservationTasks.length,
                reservationTasksAfter: reservationTasks.length,
            },
            explanation: '已应用自定义策略',
        };
    }
    estimateDirectTicketPrice(segment) {
        let basePrice = 30;
        if (segment.isHighSpeed) {
            basePrice *= 1.5;
        }
        if (segment.isInternational) {
            basePrice *= 1.3;
        }
        if (segment.isNightTrain) {
            basePrice *= 1.8;
        }
        return Math.round(basePrice);
    }
    shiftTime(timeStr, deltaMs) {
        const time = new Date(timeStr);
        time.setTime(time.getTime() + deltaMs);
        return time.toISOString();
    }
};
exports.PlanRegenerationService = PlanRegenerationService;
exports.PlanRegenerationService = PlanRegenerationService = PlanRegenerationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [reservation_decision_engine_service_1.ReservationDecisionEngineService,
        reservation_orchestration_service_1.ReservationOrchestrationService,
        travel_day_calculation_engine_service_1.TravelDayCalculationEngineService])
], PlanRegenerationService);
//# sourceMappingURL=plan-regeneration.service.js.map