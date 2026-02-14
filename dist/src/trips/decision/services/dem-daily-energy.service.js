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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DEMDailyEnergyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMDailyEnergyService = void 0;
const common_1 = require("@nestjs/common");
const dem_effort_metadata_service_1 = require("../../dem/services/dem-effort-metadata.service");
let DEMDailyEnergyService = DEMDailyEnergyService_1 = class DEMDailyEnergyService {
    constructor(demEffortService) {
        this.demEffortService = demEffortService;
        this.logger = new common_1.Logger(DEMDailyEnergyService_1.name);
        if (!demEffortService) {
            this.logger.warn('DEMEffortMetadataService not available. DEM energy calculation will be disabled.');
        }
    }
    async calculateDailyEnergyBudget(day, config = {}) {
        const { baseCostPerKm = 5, ascentFactor = 0.1, slopePenaltyFactor = 0.5, altitudePenaltyFactor = 0.05, altitudePenaltyStart = 3000, maxDailyBudget = 100, } = config;
        const routePoints = this.extractRoutePoints(day);
        if (routePoints.length < 2) {
            return {
                maxEnergyCost: maxDailyBudget,
                baseEnergyCost: 0,
                ascentEnergyCost: 0,
                slopePenalty: 0,
                altitudePenalty: 0,
                totalEnergyCost: 0,
                remainingBudget: maxDailyBudget,
            };
        }
        if (!this.demEffortService) {
            let totalDistance = 0;
            for (let i = 1; i < routePoints.length; i++) {
                const prev = routePoints[i - 1];
                const curr = routePoints[i];
                const dx = curr.lng - prev.lng;
                const dy = curr.lat - prev.lat;
                totalDistance += Math.sqrt(dx * dx + dy * dy) * 111;
            }
            return {
                maxEnergyCost: maxDailyBudget,
                baseEnergyCost: totalDistance * baseCostPerKm,
                ascentEnergyCost: 0,
                slopePenalty: 0,
                altitudePenalty: 0,
                totalEnergyCost: totalDistance * baseCostPerKm,
                remainingBudget: Math.max(0, maxDailyBudget - totalDistance * baseCostPerKm),
            };
        }
        const effortMetadata = await this.demEffortService.calculateEffortMetadata(routePoints, {
            activityType: 'walking',
            includeElevationProfile: true,
        });
        const distanceKm = effortMetadata.totalDistance / 1000;
        const baseEnergyCost = distanceKm * baseCostPerKm;
        const ascentM = effortMetadata.totalAscent;
        const ascentEnergyCost = ascentM * ascentFactor;
        const avgSlope = effortMetadata.avgSlope;
        const slopePenalty = avgSlope > 10
            ? (avgSlope - 10) * slopePenaltyFactor
            : 0;
        const maxElevation = effortMetadata.maxElevation;
        const altitudePenalty = maxElevation > altitudePenaltyStart
            ? (maxElevation - altitudePenaltyStart) * altitudePenaltyFactor
            : 0;
        const totalEnergyCost = baseEnergyCost + ascentEnergyCost + slopePenalty + altitudePenalty;
        const remainingBudget = Math.max(0, maxDailyBudget - totalEnergyCost);
        return {
            maxEnergyCost: maxDailyBudget,
            baseEnergyCost: Math.round(baseEnergyCost * 100) / 100,
            ascentEnergyCost: Math.round(ascentEnergyCost * 100) / 100,
            slopePenalty: Math.round(slopePenalty * 100) / 100,
            altitudePenalty: Math.round(altitudePenalty * 100) / 100,
            totalEnergyCost: Math.round(totalEnergyCost * 100) / 100,
            remainingBudget: Math.round(remainingBudget * 100) / 100,
        };
    }
    async calculateDynamicDailyBudget(day, routeDirection, userPace = 'moderate') {
        const paceMultipliers = {
            relaxed: { baseCost: 0.8, ascent: 0.7, maxBudget: 80 },
            moderate: { baseCost: 1.0, ascent: 1.0, maxBudget: 100 },
            intense: { baseCost: 1.2, ascent: 1.3, maxBudget: 120 },
        };
        const multiplier = paceMultipliers[userPace];
        const constraints = (routeDirection === null || routeDirection === void 0 ? void 0 : routeDirection.constraints) || {};
        const softConstraints = constraints.soft || {};
        const hardConstraints = constraints.hard || {};
        const maxDailyAscentM = softConstraints.maxDailyAscentM || hardConstraints.maxDailyRapidAscentM;
        const ascentFactor = maxDailyAscentM
            ? (100 / maxDailyAscentM) * 0.1
            : 0.1;
        const maxElevationM = softConstraints.maxElevationM || constraints.maxElevationM;
        const altitudePenaltyStart = maxElevationM
            ? Math.max(2000, maxElevationM - 1000)
            : 3000;
        const config = {
            baseCostPerKm: 5 * multiplier.baseCost,
            ascentFactor: ascentFactor * multiplier.ascent,
            slopePenaltyFactor: 0.5,
            altitudePenaltyFactor: 0.05,
            altitudePenaltyStart,
            maxDailyBudget: multiplier.maxBudget,
        };
        return this.calculateDailyEnergyBudget(day, config);
    }
    extractRoutePoints(day) {
        var _a;
        const points = [];
        for (const slot of day.timeSlots) {
            if (slot.coordinates) {
                points.push({
                    lat: slot.coordinates.lat,
                    lng: slot.coordinates.lng,
                });
            }
            else if ((_a = slot.travelLegFromPrev) === null || _a === void 0 ? void 0 : _a.to) {
                points.push({
                    lat: slot.travelLegFromPrev.to.lat,
                    lng: slot.travelLegFromPrev.to.lng,
                });
            }
        }
        return points;
    }
    async checkDailyBudgetExceeded(day, routeDirection, userPace = 'moderate') {
        const budget = await this.calculateDynamicDailyBudget(day, routeDirection, userPace);
        const exceeded = budget.totalEnergyCost > budget.maxEnergyCost;
        const warning = exceeded
            ? `体力预算超限：消耗 ${budget.totalEnergyCost.toFixed(1)}，预算 ${budget.maxEnergyCost}`
            : budget.totalEnergyCost > budget.maxEnergyCost * 0.9
                ? `体力预算接近上限：消耗 ${budget.totalEnergyCost.toFixed(1)}，预算 ${budget.maxEnergyCost}`
                : undefined;
        return { exceeded, budget, warning };
    }
};
exports.DEMDailyEnergyService = DEMDailyEnergyService;
exports.DEMDailyEnergyService = DEMDailyEnergyService = DEMDailyEnergyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [dem_effort_metadata_service_1.DEMEffortMetadataService])
], DEMDailyEnergyService);
//# sourceMappingURL=dem-daily-energy.service.js.map