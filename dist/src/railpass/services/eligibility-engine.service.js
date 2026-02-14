"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EligibilityEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EligibilityEngineService = void 0;
const common_1 = require("@nestjs/common");
const EUROPE_COUNTRIES = new Set([
    'AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK',
    'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV',
    'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL',
    'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA',
    'GB', 'VA',
]);
let EligibilityEngineService = EligibilityEngineService_1 = class EligibilityEngineService {
    constructor() {
        this.logger = new common_1.Logger(EligibilityEngineService_1.name);
    }
    checkEligibility(args) {
        const { residencyCountry, travelCountries, isCrossResidencyCountry, departureDate } = args;
        const recommendedPassFamily = this.determinePassFamily(residencyCountry);
        const constraints = [];
        const warnings = [];
        if (recommendedPassFamily === 'EURAIL') {
            constraints.push('必须购买 Eurail Pass（非欧洲居住者）');
            constraints.push('可在欧洲 33 个国家使用');
        }
        if (recommendedPassFamily === 'INTERRAIL') {
            constraints.push('必须购买 Interrail Pass（欧洲居住者）');
            constraints.push('可在除居住国外的欧洲国家使用');
            if (isCrossResidencyCountry || travelCountries.includes(residencyCountry)) {
                const homeCountryRules = this.checkInterrailHomeCountryRules({
                    residencyCountry,
                    travelCountries,
                });
                if (homeCountryRules) {
                    if (!homeCountryRules.outboundAllowed || !homeCountryRules.inboundAllowed) {
                        warnings.push(`Interrail 在居住国 ${residencyCountry} 仅允许 outbound 和 inbound 各一次`);
                    }
                    return {
                        eligible: homeCountryRules.outboundAllowed && homeCountryRules.inboundAllowed,
                        recommendedPassFamily,
                        constraints,
                        warnings,
                        homeCountryRules,
                    };
                }
            }
            else {
                constraints.push('不在居住国旅行，无居住国使用限制');
            }
        }
        return {
            eligible: true,
            recommendedPassFamily,
            constraints,
            warnings,
        };
    }
    determinePassFamily(residencyCountry) {
        const isEuropeanResident = EUROPE_COUNTRIES.has(residencyCountry.toUpperCase());
        return isEuropeanResident ? 'INTERRAIL' : 'EURAIL';
    }
    checkInterrailHomeCountryRules(args) {
        const { residencyCountry, travelCountries } = args;
        if (!travelCountries.includes(residencyCountry)) {
            return null;
        }
        const maxAllowed = 1;
        return {
            outboundAllowed: true,
            inboundAllowed: true,
            outboundUsed: 0,
            inboundUsed: 0,
            maxAllowed,
            explanation: `Interrail 在居住国 ${residencyCountry} 仅允许使用两次：outbound（出境）和 inbound（入境）各一次，且必须在同一个 Travel Day 内完成。这两次会消耗 Pass 的 Travel Day。`,
        };
    }
    validateHomeCountryUsage(args) {
        const { passFamily, residencyCountry, outboundUsed, inboundUsed } = args;
        if (passFamily !== 'INTERRAIL') {
            return { valid: true, violations: [] };
        }
        const violations = [];
        if (outboundUsed > 1) {
            violations.push(`Interrail 在居住国 ${residencyCountry} 的 outbound 使用次数超过限制（已用 ${outboundUsed}，最多 1 次）`);
        }
        if (inboundUsed > 1) {
            violations.push(`Interrail 在居住国 ${residencyCountry} 的 inbound 使用次数超过限制（已用 ${inboundUsed}，最多 1 次）`);
        }
        return {
            valid: violations.length === 0,
            violations,
        };
    }
};
exports.EligibilityEngineService = EligibilityEngineService;
exports.EligibilityEngineService = EligibilityEngineService = EligibilityEngineService_1 = __decorate([
    (0, common_1.Injectable)()
], EligibilityEngineService);
//# sourceMappingURL=eligibility-engine.service.js.map