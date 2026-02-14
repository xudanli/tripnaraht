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
var RailPassActionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailPassActionsService = void 0;
const common_1 = require("@nestjs/common");
const reservation_decision_engine_service_1 = require("../services/reservation-decision-engine.service");
const reservation_orchestration_service_1 = require("../services/reservation-orchestration.service");
let RailPassActionsService = RailPassActionsService_1 = class RailPassActionsService {
    constructor(reservationEngine, reservationOrchestrator) {
        this.reservationEngine = reservationEngine;
        this.reservationOrchestrator = reservationOrchestrator;
        this.logger = new common_1.Logger(RailPassActionsService_1.name);
    }
    async bookReservation(segment, task) {
        try {
            const updatedTask = this.reservationOrchestrator.updateTaskStatus(task.taskId, 'BOOKED', {
                bookingRef: `BOOKING_${Date.now()}`,
                cost: this.estimateReservationCost(segment),
            });
            return {
                actionType: 'BOOK_RESERVATION',
                success: true,
                segmentId: segment.segmentId,
                reservationTask: updatedTask,
                explanation: `已为段 ${segment.segmentId} 订座`,
                impact: {
                    costDeltaEur: updatedTask.cost,
                },
            };
        }
        catch (error) {
            this.logger.error(`Failed to book reservation for segment ${segment.segmentId}:`, error);
            return {
                actionType: 'BOOK_RESERVATION',
                success: false,
                segmentId: segment.segmentId,
                explanation: `订座失败: ${error.message}`,
            };
        }
    }
    async switchToNoReservationRoute(segment) {
        const fallbackOptions = this.reservationEngine.generateFallbackOptions(segment);
        const slowTrainOption = fallbackOptions.find(opt => opt.type === 'SWITCH_TO_SLOW_TRAIN');
        if (!slowTrainOption) {
            return {
                actionType: 'SWITCH_TO_NO_RESERVATION_ROUTE',
                success: false,
                segmentId: segment.segmentId,
                explanation: '未找到不需要订座的慢车替代方案',
            };
        }
        const newSegment = {
            ...segment,
            segmentId: `${segment.segmentId}_slow`,
            isHighSpeed: false,
            isNightTrain: false,
            t_api: (segment.t_api || 0) + (slowTrainOption.timeDeltaMinutes || 60),
            t_robust: (segment.t_robust || 0) + (slowTrainOption.timeDeltaMinutes || 60),
        };
        return {
            actionType: 'SWITCH_TO_NO_RESERVATION_ROUTE',
            success: true,
            segmentId: segment.segmentId,
            newSegment,
            fallbackOption: slowTrainOption,
            explanation: `已改为不需订座的慢车路线`,
            impact: {
                timeDeltaMinutes: slowTrainOption.timeDeltaMinutes,
                costDeltaEur: slowTrainOption.costDeltaEur,
            },
        };
    }
    async shiftDepartureTime(segment, deltaHours = 2) {
        if (!segment.departureTimeWindow) {
            return {
                actionType: 'SHIFT_DEPARTURE_TIME',
                success: false,
                segmentId: segment.segmentId,
                explanation: '段没有出发时间窗，无法调整',
            };
        }
        const deltaMs = deltaHours * 60 * 60 * 1000;
        const newSegment = {
            ...segment,
            segmentId: `${segment.segmentId}_shifted`,
            departureTimeWindow: {
                earliest: this.shiftTime(segment.departureTimeWindow.earliest, deltaMs),
                latest: this.shiftTime(segment.departureTimeWindow.latest, deltaMs),
            },
        };
        return {
            actionType: 'SHIFT_DEPARTURE_TIME',
            success: true,
            segmentId: segment.segmentId,
            newSegment,
            explanation: `已将出发时间调整 ${deltaHours > 0 ? '延后' : '提前'} ${Math.abs(deltaHours)} 小时`,
            impact: {
                timeDeltaMinutes: 0,
            },
        };
    }
    async moveSegmentToOtherDay(segment, newDate) {
        const newSegment = {
            ...segment,
            segmentId: `${segment.segmentId}_moved`,
            departureDate: newDate,
        };
        return {
            actionType: 'MOVE_SEGMENT_TO_OTHER_DAY',
            success: true,
            segmentId: segment.segmentId,
            newSegment,
            explanation: `已将段从 ${segment.departureDate} 移到 ${newDate}`,
        };
    }
    async replaceRailWithAlternative(segment, alternative) {
        const fallbackOptions = this.reservationEngine.generateFallbackOptions(segment);
        const optionType = alternative === 'FLIGHT'
            ? 'REPLACE_WITH_FLIGHT'
            : 'REPLACE_WITH_BUS';
        const option = fallbackOptions.find(opt => opt.type === optionType);
        if (!option) {
            return {
                actionType: 'REPLACE_RAIL_WITH_FLIGHT_OR_BUS',
                success: false,
                segmentId: segment.segmentId,
                explanation: `未找到${alternative === 'FLIGHT' ? '飞机' : '巴士'}替代方案`,
            };
        }
        const newSegment = {
            ...segment,
            segmentId: `${segment.segmentId}_${alternative.toLowerCase()}`,
        };
        return {
            actionType: 'REPLACE_RAIL_WITH_FLIGHT_OR_BUS',
            success: true,
            segmentId: segment.segmentId,
            newSegment,
            fallbackOption: option,
            explanation: `已将铁路段替换为${alternative === 'FLIGHT' ? '飞机' : '巴士'}`,
            impact: {
                timeDeltaMinutes: option.timeDeltaMinutes,
                costDeltaEur: option.costDeltaEur,
            },
        };
    }
    async splitNightTrain(segment) {
        if (!segment.isNightTrain) {
            return {
                actionType: 'SPLIT_NIGHT_TRAIN',
                success: false,
                segmentId: segment.segmentId,
                explanation: '段不是夜车，无法拆分',
            };
        }
        const fallbackOptions = this.reservationEngine.generateFallbackOptions(segment);
        const splitOption = fallbackOptions.find(opt => opt.type === 'SPLIT_SEGMENT');
        if (!splitOption) {
            return {
                actionType: 'SPLIT_NIGHT_TRAIN',
                success: false,
                segmentId: segment.segmentId,
                explanation: '未找到拆分方案',
            };
        }
        const daySegment = {
            ...segment,
            segmentId: `${segment.segmentId}_day`,
            isNightTrain: false,
            crossesMidnight: false,
        };
        return {
            actionType: 'SPLIT_NIGHT_TRAIN',
            success: true,
            segmentId: segment.segmentId,
            newSegment: daySegment,
            fallbackOption: splitOption,
            explanation: '已将夜车拆分为日间车（需要额外住宿）',
            impact: {
                travelDaysDelta: -1,
                costDeltaEur: splitOption.costDeltaEur,
            },
        };
    }
    async mergeSegmentsSameDay(segments) {
        return segments.map(seg => ({
            actionType: 'MERGE_SEGMENTS_SAME_DAY',
            success: true,
            segmentId: seg.segmentId,
            explanation: '建议将这些段合并到同一天以节省 Travel Day',
            impact: {
                travelDaysDelta: -1,
            },
        }));
    }
    estimateReservationCost(segment) {
        var _a, _b;
        const requirement = this.reservationEngine.checkReservation(segment);
        return ((_a = requirement.feeEstimate) === null || _a === void 0 ? void 0 : _a.max) || ((_b = requirement.feeEstimate) === null || _b === void 0 ? void 0 : _b.min) || 0;
    }
    shiftTime(timeStr, deltaMs) {
        const time = new Date(timeStr);
        time.setTime(time.getTime() + deltaMs);
        return time.toISOString();
    }
    suggestActionsForViolation(violationCode, segment) {
        const actions = [];
        switch (violationCode) {
            case 'RAILPASS_RESERVATION_MANDATORY':
                actions.push('BOOK_RESERVATION');
                actions.push('SWITCH_TO_NO_RESERVATION_ROUTE');
                actions.push('SHIFT_DEPARTURE_TIME');
                break;
            case 'RAILPASS_TRAVEL_DAY_BUDGET_EXCEEDED':
                if (segment.isNightTrain && segment.crossesMidnight) {
                    actions.push('SPLIT_NIGHT_TRAIN');
                }
                actions.push('MOVE_SEGMENT_TO_OTHER_DAY');
                actions.push('MERGE_SEGMENTS_SAME_DAY');
                break;
            case 'RAILPASS_HOME_COUNTRY_OUTBOUND_EXCEEDED':
            case 'RAILPASS_HOME_COUNTRY_INBOUND_EXCEEDED':
                actions.push('REPLACE_RAIL_WITH_FLIGHT_OR_BUS');
                actions.push('MOVE_SEGMENT_TO_OTHER_DAY');
                break;
            case 'RESERVATION_QUOTA_HIGH':
                actions.push('BOOK_RESERVATION');
                actions.push('SHIFT_DEPARTURE_TIME');
                actions.push('SWITCH_TO_NO_RESERVATION_ROUTE');
                break;
            default:
                actions.push('BOOK_RESERVATION');
                actions.push('SHIFT_DEPARTURE_TIME');
        }
        return actions;
    }
};
exports.RailPassActionsService = RailPassActionsService;
exports.RailPassActionsService = RailPassActionsService = RailPassActionsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [reservation_decision_engine_service_1.ReservationDecisionEngineService,
        reservation_orchestration_service_1.ReservationOrchestrationService])
], RailPassActionsService);
//# sourceMappingURL=railpass-actions.service.js.map