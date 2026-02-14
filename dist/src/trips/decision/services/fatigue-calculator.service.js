"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FatigueCalculatorService = void 0;
const common_1 = require("@nestjs/common");
let FatigueCalculatorService = class FatigueCalculatorService {
    computeFatigueIndex(day, pace) {
        const ascentRatio = day.totalAscentM / pace.maxDailyAscentM;
        const distRatio = day.totalDistanceKm / pace.maxDailyDistanceKm;
        const hoursRatio = day.estMovingHours / pace.maxMovingHours;
        const base = Math.max(ascentRatio, distRatio, hoursRatio);
        const slopePenalty = day.maxSlopePct > 20 ? 0.1 : 0;
        return base + slopePenalty;
    }
    estimateMovingHours(distanceKm, ascentM) {
        return distanceKm / 4 + ascentM / 600;
    }
};
exports.FatigueCalculatorService = FatigueCalculatorService;
exports.FatigueCalculatorService = FatigueCalculatorService = __decorate([
    (0, common_1.Injectable)()
], FatigueCalculatorService);
//# sourceMappingURL=fatigue-calculator.service.js.map