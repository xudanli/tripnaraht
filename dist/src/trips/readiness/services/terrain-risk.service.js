"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerrainRiskService = void 0;
const common_1 = require("@nestjs/common");
const terrain_policy_config_1 = require("../config/terrain-policy.config");
let TerrainRiskService = class TerrainRiskService {
    evaluateRisks(terrainFacts) {
        const flags = [];
        const stats = terrainFacts.terrainStats;
        const thresholds = terrain_policy_config_1.DEFAULT_TERRAIN_POLICY.riskThresholds;
        if (stats.maxElevationM >= thresholds.highAltitudeM) {
            flags.push({
                type: 'HIGH_ALTITUDE',
                severity: this.calculateSeverity(stats.maxElevationM, thresholds.highAltitudeM, 5000),
                message: `最高海拔 ${stats.maxElevationM}m，超过高海拔阈值 ${thresholds.highAltitudeM}m`,
            });
        }
        if (stats.totalAscentM >= thresholds.rapidAscentM) {
            flags.push({
                type: 'RAPID_ASCENT',
                severity: this.calculateSeverity(stats.totalAscentM, thresholds.rapidAscentM, 1000),
                message: `累计爬升 ${stats.totalAscentM}m，超过快速上升阈值 ${thresholds.rapidAscentM}m`,
            });
        }
        if (stats.maxSlopePct >= thresholds.steepSlopePct) {
            flags.push({
                type: 'STEEP_SLOPE',
                severity: this.calculateSeverity(stats.maxSlopePct, thresholds.steepSlopePct, 25),
                message: `最大坡度 ${stats.maxSlopePct}%，超过陡坡阈值 ${thresholds.steepSlopePct}%`,
            });
        }
        if (stats.totalAscentM >= thresholds.bigAscentDayM) {
            flags.push({
                type: 'BIG_ASCENT_DAY',
                severity: this.calculateSeverity(stats.totalAscentM, thresholds.bigAscentDayM, 2500),
                message: `累计爬升 ${stats.totalAscentM}m，超过大爬升日阈值 ${thresholds.bigAscentDayM}m`,
            });
        }
        return flags;
    }
    calculateSeverity(value, threshold, highThreshold) {
        if (value >= highThreshold) {
            return 'HIGH';
        }
        else if (value >= threshold * 1.5) {
            return 'MEDIUM';
        }
        else {
            return 'LOW';
        }
    }
};
exports.TerrainRiskService = TerrainRiskService;
exports.TerrainRiskService = TerrainRiskService = __decorate([
    (0, common_1.Injectable)()
], TerrainRiskService);
//# sourceMappingURL=terrain-risk.service.js.map