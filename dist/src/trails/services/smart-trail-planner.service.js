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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartTrailPlannerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const trails_service_1 = require("../trails.service");
const trail_fatigue_calculator_util_1 = require("../utils/trail-fatigue-calculator.util");
let SmartTrailPlannerService = class SmartTrailPlannerService {
    constructor(prisma, trailsService) {
        this.prisma = prisma;
        this.trailsService = trailsService;
    }
    async planSmartRoute(request) {
        const { placeIds, pacingConfig, preferences = {} } = request;
        const recommendations = await this.trailsService.recommendTrailsForPlaces(placeIds, {
            maxDistance: preferences.maxSegmentDistanceKm,
            preferOffRoad: preferences.preferOffRoad,
            maxDifficulty: preferences.preferredDifficulty,
        });
        const evaluatedTrails = await Promise.all(recommendations.map(async (rec) => {
            const suitability = await this.trailsService.checkTrailSuitability(rec.trail.id, {
                max_daily_hp: pacingConfig.max_daily_hp,
                walk_speed_factor: pacingConfig.walk_speed_factor,
                terrain_filter: pacingConfig.terrain_filter,
            });
            const fatigueResult = trail_fatigue_calculator_util_1.TrailFatigueCalculator.calculateFatigue({
                distanceKm: rec.trail.distanceKm,
                elevationGainM: rec.trail.elevationGainM,
                maxElevationM: rec.trail.maxElevationM || undefined,
                difficultyLevel: rec.trail.difficultyLevel || undefined,
                estimatedDurationHours: rec.trail.estimatedDurationHours || undefined,
            }, pacingConfig);
            return {
                trailId: rec.trail.id,
                trail: rec.trail,
                matchScore: rec.matchScore,
                fatigueResult,
                suitable: suitability.suitable,
                recommendation: rec.recommendation,
            };
        }));
        const suitableTrails = evaluatedTrails.filter(t => t.suitable);
        const summary = this.calculateSummary(suitableTrails, pacingConfig);
        if ((preferences === null || preferences === void 0 ? void 0 : preferences.maxTotalDistanceKm) && summary.totalDistanceKm > preferences.maxTotalDistanceKm) {
            return this.optimizeForDistanceLimit(suitableTrails, preferences.maxTotalDistanceKm, pacingConfig, preferences);
        }
        const suggestedSchedule = this.generateSchedule(suitableTrails, pacingConfig, preferences || {});
        return {
            trails: suitableTrails,
            summary,
            suggestedSchedule,
        };
    }
    calculateSummary(trails, pacingConfig) {
        const totalDistanceKm = trails.reduce((sum, t) => sum + t.trail.distanceKm, 0);
        const totalElevationGainM = trails.reduce((sum, t) => sum + t.trail.elevationGainM, 0);
        const totalDurationHours = trails.reduce((sum, t) => sum + (t.trail.estimatedDurationHours || 0), 0);
        const totalHpCost = trails.reduce((sum, t) => sum + t.fatigueResult.totalHpCost, 0);
        const exceedsLimit = totalHpCost > pacingConfig.max_daily_hp * 0.8;
        const recommendedRestCount = trails.reduce((sum, t) => sum + t.fatigueResult.recommendedRestCount, 0);
        const suitabilityScore = this.calculateSuitabilityScore(totalHpCost, pacingConfig.max_daily_hp, totalDurationHours, trails.length);
        return {
            totalDistanceKm,
            totalElevationGainM,
            totalDurationHours,
            totalHpCost,
            exceedsLimit,
            recommendedRestCount,
            suitabilityScore,
        };
    }
    calculateSuitabilityScore(totalHpCost, maxHp, totalDurationHours, trailCount) {
        let score = 100;
        const hpRatio = totalHpCost / maxHp;
        if (hpRatio > 0.5) {
            score -= (hpRatio - 0.5) * 100;
        }
        if (totalDurationHours > 8) {
            score -= (totalDurationHours - 8) * 5;
        }
        if (trailCount > 1) {
            score += Math.min(trailCount * 5, 20);
        }
        return Math.max(0, Math.min(100, score));
    }
    optimizeForDistanceLimit(trails, maxDistanceKm, pacingConfig, preferences) {
        const sortedTrails = [...trails].sort((a, b) => {
            const scoreA = a.matchScore * 100 - a.trail.distanceKm;
            const scoreB = b.matchScore * 100 - b.trail.distanceKm;
            return scoreB - scoreA;
        });
        const selectedTrails = [];
        let currentDistance = 0;
        for (const trail of sortedTrails) {
            if (currentDistance + trail.trail.distanceKm <= maxDistanceKm) {
                selectedTrails.push(trail);
                currentDistance += trail.trail.distanceKm;
            }
        }
        const summary = this.calculateSummary(selectedTrails, pacingConfig);
        const suggestedSchedule = this.generateSchedule(selectedTrails, pacingConfig, preferences || {});
        return {
            trails: selectedTrails,
            summary,
            suggestedSchedule,
        };
    }
    generateSchedule(trails, pacingConfig, preferences) {
        if (trails.length === 0) {
            return [];
        }
        const maxDailyHp = pacingConfig.max_daily_hp;
        const schedule = [];
        let currentDay = 1;
        let currentDayHp = 0;
        let currentDayTrails = [];
        let currentDayDistance = 0;
        let currentDayDuration = 0;
        let currentDayRestCount = 0;
        for (const trailInfo of trails) {
            const trailHp = trailInfo.fatigueResult.totalHpCost;
            const trailDuration = trailInfo.trail.estimatedDurationHours || 0;
            if (currentDayHp + trailHp <= maxDailyHp * 0.8 &&
                currentDayDuration + trailDuration <= 8 &&
                (!(preferences === null || preferences === void 0 ? void 0 : preferences.maxSegmentDistanceKm) ||
                    currentDayDistance + trailInfo.trail.distanceKm <= preferences.maxSegmentDistanceKm)) {
                currentDayTrails.push(trailInfo.trailId);
                currentDayHp += trailHp;
                currentDayDistance += trailInfo.trail.distanceKm;
                currentDayDuration += trailDuration;
                currentDayRestCount += trailInfo.fatigueResult.recommendedRestCount;
            }
            else {
                if (currentDayTrails.length > 0) {
                    schedule.push({
                        day: currentDay,
                        trailIds: currentDayTrails,
                        distanceKm: currentDayDistance,
                        durationHours: currentDayDuration,
                        restCount: currentDayRestCount,
                    });
                }
                currentDay++;
                currentDayTrails = [trailInfo.trailId];
                currentDayHp = trailHp;
                currentDayDistance = trailInfo.trail.distanceKm;
                currentDayDuration = trailDuration;
                currentDayRestCount = trailInfo.fatigueResult.recommendedRestCount;
            }
        }
        if (currentDayTrails.length > 0) {
            schedule.push({
                day: currentDay,
                trailIds: currentDayTrails,
                distanceKm: currentDayDistance,
                durationHours: currentDayDuration,
                restCount: currentDayRestCount,
            });
        }
        return schedule;
    }
};
exports.SmartTrailPlannerService = SmartTrailPlannerService;
exports.SmartTrailPlannerService = SmartTrailPlannerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trails_service_1.TrailsService])
], SmartTrailPlannerService);
//# sourceMappingURL=smart-trail-planner.service.js.map