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
var PassSelectionEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PassSelectionEngineService = void 0;
const common_1 = require("@nestjs/common");
const travel_day_calculation_engine_service_1 = require("./travel-day-calculation-engine.service");
let PassSelectionEngineService = PassSelectionEngineService_1 = class PassSelectionEngineService {
    constructor(travelDayCalculator) {
        this.travelDayCalculator = travelDayCalculator;
        this.logger = new common_1.Logger(PassSelectionEngineService_1.name);
    }
    async recommendPass(input, sampleSegments) {
        const passType = this.determinePassType(input);
        const validityType = this.determineValidityType(input);
        const travelDaysTotal = validityType === 'FLEXI'
            ? this.estimateTravelDays(input, sampleSegments)
            : undefined;
        const passClass = this.determineClass(input);
        const medium = this.determineMedium(input);
        const recommendedProfile = {
            residencyCountry: input.residencyCountry,
            passFamily: input.passFamily,
            passType,
            validityType,
            travelDaysTotal,
            homeCountryOutboundUsed: 0,
            homeCountryInboundUsed: 0,
            class: passClass,
            mobileOrPaper: medium,
            validityStartDate: input.tripDateRange.start,
            validityEndDate: input.tripDateRange.end,
        };
        let travelDaySimulation;
        if (sampleSegments && validityType === 'FLEXI' && travelDaysTotal) {
            const result = this.travelDayCalculator.calculateTravelDays({
                segments: sampleSegments,
                passProfile: recommendedProfile,
            });
            travelDaySimulation = {
                estimatedDaysUsed: result.totalDaysUsed,
                daysByDate: result.daysByDate,
            };
        }
        const explanation = this.generateExplanation({
            profile: recommendedProfile,
            input,
            travelDaySimulation,
        });
        return {
            recommendedProfile,
            explanation,
            travelDaySimulation,
        };
    }
    determinePassType(input) {
        if (input.crossCountryCount >= 2) {
            return 'GLOBAL';
        }
        return 'ONE_COUNTRY';
    }
    determineValidityType(input) {
        var _a;
        if (input.isDailyTravel) {
            return 'CONTINUOUS';
        }
        if ((_a = input.preferences) === null || _a === void 0 ? void 0 : _a.preferFlexibility) {
            return 'FLEXI';
        }
        if (input.stayMode === 'stay_extended') {
            return 'FLEXI';
        }
        return 'FLEXI';
    }
    estimateTravelDays(input, sampleSegments) {
        if (sampleSegments && sampleSegments.length > 0) {
            let estimated = 0;
            for (const seg of sampleSegments) {
                if (seg.isNightTrain && seg.crossesMidnight) {
                    estimated += 2;
                }
                else {
                    estimated += 1;
                }
            }
            return Math.ceil(estimated / 5) * 5;
        }
        const baseEstimate = Math.ceil(input.estimatedRailSegments / 2.5);
        return Math.max(5, Math.ceil(baseEstimate / 5) * 5);
    }
    determineClass(input) {
        var _a;
        if ((_a = input.preferences) === null || _a === void 0 ? void 0 : _a.preferFirstClass) {
            return 'FIRST';
        }
        if (input.budgetSensitivity === 'HIGH') {
            return 'SECOND';
        }
        return 'SECOND';
    }
    determineMedium(input) {
        var _a;
        if (((_a = input.preferences) === null || _a === void 0 ? void 0 : _a.preferMobile) === false) {
            return 'PAPER';
        }
        return 'MOBILE';
    }
    generateExplanation(args) {
        const { profile, input, travelDaySimulation } = args;
        const parts = [];
        parts.push(`推荐 ${profile.passFamily} ${profile.passType} Pass`);
        if (profile.validityType === 'FLEXI') {
            parts.push(`${profile.travelDaysTotal} 天 Flexi Pass`);
            if (travelDaySimulation) {
                parts.push(`（预计消耗 ${travelDaySimulation.totalDaysUsed} 天，剩余 ${travelDaySimulation.remainingDays} 天）`);
            }
        }
        else {
            parts.push('Continuous Pass');
        }
        parts.push(`${profile.class === 'FIRST' ? '一等座' : '二等座'}`);
        parts.push(`${profile.mobileOrPaper === 'MOBILE' ? '手机票' : '纸质票'}`);
        if (profile.mobileOrPaper === 'MOBILE') {
            parts.push('（注意：Mobile Pass 需要每 24 小时联网一次，否则会变为 inactive）');
        }
        return parts.join('，');
    }
};
exports.PassSelectionEngineService = PassSelectionEngineService;
exports.PassSelectionEngineService = PassSelectionEngineService = PassSelectionEngineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [travel_day_calculation_engine_service_1.TravelDayCalculationEngineService])
], PassSelectionEngineService);
//# sourceMappingURL=pass-selection-engine.service.js.map