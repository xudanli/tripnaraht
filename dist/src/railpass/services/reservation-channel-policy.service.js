"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ReservationChannelPolicyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReservationChannelPolicyService = void 0;
const common_1 = require("@nestjs/common");
let ReservationChannelPolicyService = ReservationChannelPolicyService_1 = class ReservationChannelPolicyService {
    constructor() {
        this.logger = new common_1.Logger(ReservationChannelPolicyService_1.name);
        this.channelPolicies = [
            {
                countryCode: 'GB',
                operator: 'Eurostar',
                preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct'],
                supportsApiBooking: false,
                supportsOnlineBooking: true,
                requiresOfflineBooking: false,
                bookingUrl: 'https://www.eurostar.com',
                instructions: 'Eurostar 建议尽早订座，passholder seats 配额有限，售罄后只能买全价票',
                recommendedAdvanceDays: 60,
            },
            {
                countryCode: 'FR',
                operator: 'SNCF',
                preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct'],
                supportsApiBooking: false,
                supportsOnlineBooking: true,
                requiresOfflineBooking: false,
                bookingUrl: 'https://www.sncf.com',
                instructions: '可通过 Eurail/Interrail 平台或 SNCF 官网订座',
                recommendedAdvanceDays: 30,
            },
            {
                countryCode: 'DE',
                operator: 'DB',
                preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct'],
                supportsApiBooking: false,
                supportsOnlineBooking: true,
                requiresOfflineBooking: false,
                bookingUrl: 'https://www.bahn.de',
                instructions: '可通过 Eurail/Interrail 平台或 DB 官网订座',
                recommendedAdvanceDays: 14,
            },
            {
                countryCode: 'IT',
                operator: 'Trenitalia',
                preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct'],
                supportsApiBooking: false,
                supportsOnlineBooking: true,
                requiresOfflineBooking: false,
                instructions: '可通过 Eurail/Interrail 平台或 Trenitalia 官网订座，部分线路可在车站订座',
                recommendedAdvanceDays: 14,
            },
            {
                countryCode: 'ES',
                operator: 'Renfe',
                preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct'],
                supportsApiBooking: false,
                supportsOnlineBooking: true,
                requiresOfflineBooking: false,
                instructions: '可通过 Eurail/Interrail 平台或 Renfe 官网订座',
                recommendedAdvanceDays: 14,
            },
            {
                countryCode: '*',
                preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct', 'Third_Party'],
                supportsApiBooking: false,
                supportsOnlineBooking: true,
                requiresOfflineBooking: false,
                instructions: '建议通过 Eurail/Interrail 官方平台订座，或直接在运营商官网/车站订座',
                recommendedAdvanceDays: 7,
            },
        ];
    }
    getChannelPolicy(segment) {
        if (segment.operatorHint) {
            const operatorPolicy = this.channelPolicies.find(p => { var _a; return p.operator && ((_a = segment.operatorHint) === null || _a === void 0 ? void 0 : _a.toUpperCase().includes(p.operator.toUpperCase())); });
            if (operatorPolicy) {
                return operatorPolicy;
            }
        }
        const countryPolicy = this.channelPolicies.find(p => p.countryCode === segment.fromCountryCode || p.countryCode === segment.toCountryCode);
        if (countryPolicy) {
            return countryPolicy;
        }
        return this.channelPolicies.find(p => p.countryCode === '*') || this.channelPolicies[this.channelPolicies.length - 1];
    }
    generateBookingChecklist(segments) {
        return segments.map(segment => {
            const policy = this.getChannelPolicy(segment);
            let urgency = 'LOW';
            const segmentDate = new Date(segment.departureDate);
            const now = new Date();
            const daysUntilDeparture = Math.ceil((segmentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilDeparture < policy.recommendedAdvanceDays) {
                urgency = daysUntilDeparture < policy.recommendedAdvanceDays / 2 ? 'HIGH' : 'MEDIUM';
            }
            const bookingDeadline = policy.recommendedAdvanceDays
                ? new Date(segmentDate.getTime() - policy.recommendedAdvanceDays * 24 * 60 * 60 * 1000)
                : undefined;
            return {
                segmentId: segment.segmentId,
                from: `${segment.fromCountryCode}`,
                to: `${segment.toCountryCode}`,
                policy,
                urgency,
                bookingDeadline: bookingDeadline === null || bookingDeadline === void 0 ? void 0 : bookingDeadline.toISOString().split('T')[0],
            };
        });
    }
};
exports.ReservationChannelPolicyService = ReservationChannelPolicyService;
exports.ReservationChannelPolicyService = ReservationChannelPolicyService = ReservationChannelPolicyService_1 = __decorate([
    (0, common_1.Injectable)()
], ReservationChannelPolicyService);
//# sourceMappingURL=reservation-channel-policy.service.js.map