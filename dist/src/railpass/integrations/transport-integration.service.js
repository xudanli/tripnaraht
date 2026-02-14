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
var TransportIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const transport_interface_1 = require("../../transport/interfaces/transport.interface");
const reservation_decision_engine_service_1 = require("../services/reservation-decision-engine.service");
let TransportIntegrationService = TransportIntegrationService_1 = class TransportIntegrationService {
    constructor(reservationEngine) {
        this.reservationEngine = reservationEngine;
        this.logger = new common_1.Logger(TransportIntegrationService_1.name);
    }
    async enhanceRailTransportOption(transportOption, passProfile, segmentHint) {
        if (transportOption.mode !== transport_interface_1.TransportMode.RAIL) {
            return transportOption;
        }
        if (!passProfile) {
            return {
                ...transportOption,
                mode: transport_interface_1.TransportMode.RAIL,
                railPassInfo: {
                    covered: false,
                    reservationRequired: false,
                    reservationRisk: 'LOW',
                },
            };
        }
        const segment = {
            segmentId: `transport_${Date.now()}`,
            fromPlaceId: 0,
            toPlaceId: 0,
            fromCountryCode: (segmentHint === null || segmentHint === void 0 ? void 0 : segmentHint.fromCountryCode) || '',
            toCountryCode: (segmentHint === null || segmentHint === void 0 ? void 0 : segmentHint.toCountryCode) || '',
            departureDate: (segmentHint === null || segmentHint === void 0 ? void 0 : segmentHint.departureDate) || new Date().toISOString().split('T')[0],
            isNightTrain: (segmentHint === null || segmentHint === void 0 ? void 0 : segmentHint.isNightTrain) || false,
            isHighSpeed: (segmentHint === null || segmentHint === void 0 ? void 0 : segmentHint.isHighSpeed) || false,
            isInternational: (segmentHint === null || segmentHint === void 0 ? void 0 : segmentHint.isInternational) ||
                ((segmentHint === null || segmentHint === void 0 ? void 0 : segmentHint.fromCountryCode) !== (segmentHint === null || segmentHint === void 0 ? void 0 : segmentHint.toCountryCode)),
        };
        const reservationRequirement = this.reservationEngine.checkReservation(segment);
        const covered = this.checkPassCoverage(passProfile, segment);
        const consumesTravelDay = passProfile.validityType === 'FLEXI';
        return {
            ...transportOption,
            mode: transport_interface_1.TransportMode.RAIL,
            railPassInfo: {
                covered,
                reservationRequired: reservationRequirement.required || false,
                reservationFeeEstimate: reservationRequirement.feeEstimate,
                reservationRisk: reservationRequirement.quotaRisk,
                consumesTravelDay,
            },
        };
    }
    checkPassCoverage(passProfile, segment) {
        const segmentDate = new Date(segment.departureDate);
        const validityStart = new Date(passProfile.validityStartDate);
        const validityEnd = new Date(passProfile.validityEndDate);
        if (segmentDate < validityStart || segmentDate > validityEnd) {
            return false;
        }
        if (passProfile.passType === 'ONE_COUNTRY') {
            return segment.fromCountryCode === segment.toCountryCode;
        }
        return true;
    }
    filterOptionsByRailPassConstraints(options, passProfile, constraints) {
        if (!passProfile) {
            return options;
        }
        return options.filter(option => {
            if (option.mode !== transport_interface_1.TransportMode.RAIL) {
                return true;
            }
            return true;
        });
    }
    recommendBestRailOption(options, passProfile, preferences) {
        const railOptions = options.filter(opt => opt.mode === transport_interface_1.TransportMode.RAIL);
        if (railOptions.length === 0) {
            return null;
        }
        const score = (option) => {
            let score = 0;
            if (preferences === null || preferences === void 0 ? void 0 : preferences.preferNoReservation) {
                score += 10;
            }
            if (preferences === null || preferences === void 0 ? void 0 : preferences.minimizeCost) {
                score -= (option.cost || 0) / 10;
            }
            if (preferences === null || preferences === void 0 ? void 0 : preferences.minimizeTime) {
                score -= (option.durationMinutes || 0) / 10;
            }
            return score;
        };
        railOptions.sort((a, b) => score(b) - score(a));
        return railOptions[0] || null;
    }
};
exports.TransportIntegrationService = TransportIntegrationService;
exports.TransportIntegrationService = TransportIntegrationService = TransportIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [reservation_decision_engine_service_1.ReservationDecisionEngineService])
], TransportIntegrationService);
//# sourceMappingURL=transport-integration.service.js.map