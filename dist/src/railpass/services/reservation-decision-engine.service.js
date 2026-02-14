"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ReservationDecisionEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReservationDecisionEngineService = void 0;
const common_1 = require("@nestjs/common");
const HIGH_SPEED_OPERATORS = [
    'TGV', 'Thalys', 'Eurostar', 'ICE', 'AVE', 'Frecciarossa',
    'EuroCity', 'Railjet', 'Pendolino',
];
let ReservationDecisionEngineService = ReservationDecisionEngineService_1 = class ReservationDecisionEngineService {
    constructor() {
        this.logger = new common_1.Logger(ReservationDecisionEngineService_1.name);
    }
    checkReservation(segment) {
        const mandatoryReason = this.checkMandatoryReservation(segment);
        const required = !!mandatoryReason;
        const feeEstimate = this.estimateReservationFee(segment, required);
        const quotaRisk = this.assessQuotaRisk(segment);
        const bookingChannels = this.determineBookingChannels(segment);
        const riskFactors = this.collectRiskFactors(segment, quotaRisk);
        return {
            required,
            mandatoryReasonCode: mandatoryReason,
            feeEstimate,
            quotaRisk,
            bookingChannels,
            riskFactors,
        };
    }
    checkMandatoryReservation(segment) {
        if (segment.isNightTrain) {
            return 'NIGHT_TRAIN';
        }
        if (segment.isHighSpeed) {
            return 'HIGH_SPEED';
        }
        if (segment.isInternational) {
            return 'INTERNATIONAL';
        }
        if (segment.operatorHint) {
            const operator = segment.operatorHint.toUpperCase();
            if (HIGH_SPEED_OPERATORS.some(op => operator.includes(op))) {
                return 'OPERATOR_POLICY';
            }
        }
        return undefined;
    }
    estimateReservationFee(segment, required) {
        if (!required) {
            return undefined;
        }
        let min = 0;
        let max = 0;
        if (segment.isNightTrain) {
            min = 20;
            max = 150;
        }
        else if (segment.isHighSpeed || segment.isInternational) {
            min = 3;
            max = 30;
        }
        else {
            min = 0;
            max = 10;
        }
        return {
            min,
            max,
            currency: 'EUR',
        };
    }
    assessQuotaRisk(segment) {
        let riskScore = 0;
        if (segment.isNightTrain) {
            riskScore += 2;
        }
        if (segment.isHighSpeed || segment.isInternational) {
            riskScore += 1;
        }
        if (segment.departureDate) {
            const month = new Date(segment.departureDate).getMonth() + 1;
            if (month === 7 || month === 8) {
                riskScore += 1;
            }
        }
        if (segment.departureTimeWindow) {
            const now = new Date();
            const earliest = new Date(segment.departureTimeWindow.earliest);
            const daysUntilDeparture = Math.ceil((earliest.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilDeparture < 7) {
                riskScore += 2;
            }
            else if (daysUntilDeparture < 30) {
                riskScore += 1;
            }
        }
        if (riskScore >= 4) {
            return 'HIGH';
        }
        else if (riskScore >= 2) {
            return 'MEDIUM';
        }
        else {
            return 'LOW';
        }
    }
    determineBookingChannels(segment) {
        const channels = [];
        channels.push('EURail_Interrail_Platform');
        if (segment.isHighSpeed || segment.isInternational) {
            channels.push('Operator_Direct');
        }
        channels.push('Third_Party');
        return channels;
    }
    collectRiskFactors(segment, quotaRisk) {
        const factors = [];
        if (segment.isNightTrain) {
            factors.push('夜车强制订座，铺位有限');
        }
        if (segment.isHighSpeed) {
            factors.push('高铁多数需要订座');
        }
        if (segment.isInternational) {
            factors.push('国际列车建议提前订座');
        }
        if (quotaRisk === 'HIGH') {
            factors.push('配额紧张，建议尽快订座');
        }
        else if (quotaRisk === 'MEDIUM') {
            factors.push('建议提前订座');
        }
        if (segment.departureDate) {
            const month = new Date(segment.departureDate).getMonth() + 1;
            if (month === 7 || month === 8) {
                factors.push('旺季期间，订座需求较高');
            }
        }
        return factors;
    }
    generateFallbackOptions(segment) {
        const options = [];
        if (segment.isHighSpeed) {
            options.push({
                optionId: `${segment.segmentId}_slow_train`,
                type: 'SWITCH_TO_SLOW_TRAIN',
                description: '改乘区域列车（不需订座，但耗时更长）',
                timeDeltaMinutes: 60,
                costDeltaEur: 0,
            });
        }
        options.push({
            optionId: `${segment.segmentId}_shift_time`,
            type: 'SHIFT_TIME',
            description: '调整出发时间（避开高峰时段）',
            timeDeltaMinutes: 0,
        });
        options.push({
            optionId: `${segment.segmentId}_change_route`,
            type: 'CHANGE_ROUTE',
            description: '选择其他路线（可能经过不同城市）',
            timeDeltaMinutes: 30,
        });
        if (segment.isNightTrain) {
            options.push({
                optionId: `${segment.segmentId}_split`,
                type: 'SPLIT_SEGMENT',
                description: '将夜车拆成日间列车 + 住宿',
                costDeltaEur: 50,
            });
        }
        options.push({
            optionId: `${segment.segmentId}_flight`,
            type: 'REPLACE_WITH_FLIGHT',
            description: '改乘飞机（可能更快，但费用更高）',
            costDeltaEur: 100,
            timeDeltaMinutes: -120,
        });
        options.push({
            optionId: `${segment.segmentId}_bus`,
            type: 'REPLACE_WITH_BUS',
            description: '改乘长途巴士（经济实惠，但耗时更长）',
            costDeltaEur: -20,
            timeDeltaMinutes: 90,
        });
        return options;
    }
};
exports.ReservationDecisionEngineService = ReservationDecisionEngineService;
exports.ReservationDecisionEngineService = ReservationDecisionEngineService = ReservationDecisionEngineService_1 = __decorate([
    (0, common_1.Injectable)()
], ReservationDecisionEngineService);
//# sourceMappingURL=reservation-decision-engine.service.js.map