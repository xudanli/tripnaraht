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
var DEMRiskScoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMRiskScoringService = void 0;
const common_1 = require("@nestjs/common");
const dem_elevation_service_1 = require("../../dem/services/dem-elevation.service");
let DEMRiskScoringService = DEMRiskScoringService_1 = class DEMRiskScoringService {
    constructor(demElevationService) {
        this.demElevationService = demElevationService;
        this.logger = new common_1.Logger(DEMRiskScoringService_1.name);
        if (!demElevationService) {
            this.logger.warn('DEMElevationService not available. DEM risk scoring will be disabled.');
        }
    }
    async calculateActivityRiskScore(activity, previousElevation, config = {}) {
        var _a, _b, _c;
        const { highAltitudeThreshold = 3000, consecutiveAscentThreshold = 1200, steepSlopeThreshold = 15, } = config;
        const riskFlags = [];
        let altitudeRisk = 0;
        let slopeRisk = 0;
        let consecutiveAscentRisk = 0;
        let elevation = null;
        if (((_a = activity.location) === null || _a === void 0 ? void 0 : _a.point) && this.demElevationService) {
            elevation = await this.demElevationService.getElevation(activity.location.point.lat, activity.location.point.lng);
        }
        if (elevation !== null) {
            if (elevation >= highAltitudeThreshold) {
                const altitudeExcess = elevation - highAltitudeThreshold;
                altitudeRisk = Math.min(100, (altitudeExcess / 1000) * 100);
                if (elevation >= 4000) {
                    riskFlags.push({
                        type: 'HIGH_ALTITUDE',
                        severity: 'HIGH',
                        message: `海拔${elevation}m，存在严重高反风险`,
                    });
                }
                else if (elevation >= 3500) {
                    riskFlags.push({
                        type: 'HIGH_ALTITUDE',
                        severity: 'MEDIUM',
                        message: `海拔${elevation}m，存在高反风险`,
                    });
                }
                else {
                    riskFlags.push({
                        type: 'HIGH_ALTITUDE',
                        severity: 'LOW',
                        message: `海拔${elevation}m，需注意适应`,
                    });
                }
            }
            if (previousElevation !== undefined && elevation > previousElevation) {
                const ascent = elevation - previousElevation;
                if (ascent >= consecutiveAscentThreshold) {
                    consecutiveAscentRisk = Math.min(100, (ascent / consecutiveAscentThreshold) * 50);
                    riskFlags.push({
                        type: 'RAPID_ASCENT',
                        severity: ascent >= 2000 ? 'HIGH' : ascent >= 1500 ? 'MEDIUM' : 'LOW',
                        message: `连续上升${ascent}m，超过阈值${consecutiveAscentThreshold}m`,
                    });
                }
            }
        }
        const slope = ((_b = activity.metadata) === null || _b === void 0 ? void 0 : _b.slope) || ((_c = activity.metadata) === null || _c === void 0 ? void 0 : _c.avgSlope);
        if (slope !== undefined && Math.abs(slope) >= steepSlopeThreshold) {
            slopeRisk = Math.min(100, (Math.abs(slope) / steepSlopeThreshold) * 50);
            riskFlags.push({
                type: 'STEEP_SLOPE',
                severity: Math.abs(slope) >= 25 ? 'HIGH' : Math.abs(slope) >= 20 ? 'MEDIUM' : 'LOW',
                message: `坡度${slope.toFixed(1)}%，超过阈值${steepSlopeThreshold}%`,
            });
        }
        const totalRiskScore = Math.min(100, altitudeRisk * 0.4 +
            slopeRisk * 0.3 +
            consecutiveAscentRisk * 0.3);
        return {
            activityId: activity.id,
            totalRiskScore: Math.round(totalRiskScore * 100) / 100,
            altitudeRisk: Math.round(altitudeRisk * 100) / 100,
            slopeRisk: Math.round(slopeRisk * 100) / 100,
            consecutiveAscentRisk: Math.round(consecutiveAscentRisk * 100) / 100,
            riskFlags,
        };
    }
    async calculatePlanRiskScore(plan, routeSegmentation, config = {}) {
        const { highAltitudeThreshold = 3000, consecutiveHighAltitudeDaysThreshold = 3, consecutiveAscentThreshold = 1200, } = config;
        const dailyRiskScores = [];
        let consecutiveHighAltitudeDays = 0;
        let maxConsecutiveHighAltitudeDays = 0;
        let consecutiveAscent = 0;
        let consecutiveAscentStartElevation = null;
        let steepConcentratedSections = 0;
        for (let i = 0; i < plan.days.length; i++) {
            const day = plan.days[i];
            const terrainFacts = day.terrainFacts;
            const maxElevation = (terrainFacts === null || terrainFacts === void 0 ? void 0 : terrainFacts.maxElevation) || 0;
            const totalAscent = (terrainFacts === null || terrainFacts === void 0 ? void 0 : terrainFacts.totalAscent) || 0;
            if (maxElevation >= highAltitudeThreshold) {
                consecutiveHighAltitudeDays++;
            }
            else {
                maxConsecutiveHighAltitudeDays = Math.max(maxConsecutiveHighAltitudeDays, consecutiveHighAltitudeDays);
                consecutiveHighAltitudeDays = 0;
            }
            if (maxElevation > 0) {
                if (consecutiveAscentStartElevation === null) {
                    consecutiveAscentStartElevation = maxElevation;
                }
                else if (maxElevation > consecutiveAscentStartElevation) {
                    consecutiveAscent = maxElevation - consecutiveAscentStartElevation;
                }
                else {
                    consecutiveAscentStartElevation = maxElevation;
                    consecutiveAscent = 0;
                }
            }
            let dayRiskScore = 0;
            const dayRiskFlags = [];
            if (maxElevation >= highAltitudeThreshold) {
                const altitudeExcess = maxElevation - highAltitudeThreshold;
                dayRiskScore += Math.min(50, (altitudeExcess / 1000) * 50);
                if (maxElevation >= 4000) {
                    dayRiskFlags.push({
                        type: 'HIGH_ALTITUDE',
                        severity: 'HIGH',
                        message: `第${day.day}天最高海拔${maxElevation}m，存在严重高反风险`,
                    });
                }
                else if (maxElevation >= 3500) {
                    dayRiskFlags.push({
                        type: 'HIGH_ALTITUDE',
                        severity: 'MEDIUM',
                        message: `第${day.day}天最高海拔${maxElevation}m，存在高反风险`,
                    });
                }
            }
            if (totalAscent >= consecutiveAscentThreshold) {
                dayRiskScore += Math.min(30, (totalAscent / consecutiveAscentThreshold) * 30);
                dayRiskFlags.push({
                    type: 'RAPID_ASCENT',
                    severity: totalAscent >= 2000 ? 'HIGH' : totalAscent >= 1500 ? 'MEDIUM' : 'LOW',
                    message: `第${day.day}天累计爬升${totalAscent}m，超过阈值${consecutiveAscentThreshold}m`,
                });
            }
            if (terrainFacts === null || terrainFacts === void 0 ? void 0 : terrainFacts.riskFlags) {
                dayRiskFlags.push(...terrainFacts.riskFlags);
            }
            dailyRiskScores.push({
                day: day.day,
                date: day.date,
                riskScore: Math.min(100, dayRiskScore),
                maxElevation,
                totalAscent,
                riskFlags: dayRiskFlags,
            });
        }
        maxConsecutiveHighAltitudeDays = Math.max(maxConsecutiveHighAltitudeDays, consecutiveHighAltitudeDays);
        if (routeSegmentation && routeSegmentation.steepSections) {
            steepConcentratedSections = routeSegmentation.steepSections.length;
        }
        const avgDailyRisk = dailyRiskScores.length > 0
            ? dailyRiskScores.reduce((sum, d) => sum + d.riskScore, 0) / dailyRiskScores.length
            : 0;
        const consecutiveHighAltitudePenalty = maxConsecutiveHighAltitudeDays >= consecutiveHighAltitudeDaysThreshold
            ? Math.min(30, (maxConsecutiveHighAltitudeDays - consecutiveHighAltitudeDaysThreshold + 1) * 10)
            : 0;
        const consecutiveAscentPenalty = consecutiveAscent >= consecutiveAscentThreshold
            ? Math.min(20, (consecutiveAscent / consecutiveAscentThreshold) * 20)
            : 0;
        const steepSectionsPenalty = steepConcentratedSections > 0
            ? Math.min(20, steepConcentratedSections * 5)
            : 0;
        const totalRiskScore = Math.min(100, avgDailyRisk * 0.4 +
            consecutiveHighAltitudePenalty +
            consecutiveAscentPenalty +
            steepSectionsPenalty);
        const planRiskFlags = [];
        if (maxConsecutiveHighAltitudeDays >= consecutiveHighAltitudeDaysThreshold) {
            planRiskFlags.push({
                type: 'CONSECUTIVE_HIGH_ALTITUDE',
                severity: maxConsecutiveHighAltitudeDays >= 5 ? 'HIGH' : 'MEDIUM',
                message: `连续${maxConsecutiveHighAltitudeDays}天高海拔（>${highAltitudeThreshold}m），存在高反风险`,
            });
        }
        if (consecutiveAscent >= consecutiveAscentThreshold) {
            planRiskFlags.push({
                type: 'CONSECUTIVE_ASCENT',
                severity: consecutiveAscent >= 2000 ? 'HIGH' : 'MEDIUM',
                message: `连续上升${consecutiveAscent}m，超过阈值${consecutiveAscentThreshold}m`,
            });
        }
        if (steepConcentratedSections > 0) {
            planRiskFlags.push({
                type: 'STEEP_CONCENTRATED_SECTIONS',
                severity: steepConcentratedSections >= 3 ? 'HIGH' : 'MEDIUM',
                message: `路线包含${steepConcentratedSections}个坡度集中区间`,
            });
        }
        return {
            totalRiskScore: Math.round(totalRiskScore * 100) / 100,
            consecutiveHighAltitudeDays: maxConsecutiveHighAltitudeDays,
            consecutiveAscent: Math.round(consecutiveAscent),
            steepConcentratedSections,
            dailyRiskScores,
            riskFlags: planRiskFlags,
        };
    }
    async getRiskWeightForDrDre(activity, previousElevation, config = {}) {
        const riskScore = await this.calculateActivityRiskScore(activity, previousElevation, config);
        return riskScore.totalRiskScore / 100;
    }
    async getRiskWeightForNeptune(activity, previousElevation, config = {}) {
        const riskScore = await this.calculateActivityRiskScore(activity, previousElevation, config);
        return riskScore.totalRiskScore / 100;
    }
};
exports.DEMRiskScoringService = DEMRiskScoringService;
exports.DEMRiskScoringService = DEMRiskScoringService = DEMRiskScoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [dem_elevation_service_1.DEMElevationService])
], DEMRiskScoringService);
//# sourceMappingURL=dem-risk-scoring.service.js.map