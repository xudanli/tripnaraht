"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TerrainFactsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerrainFactsService = void 0;
const common_1 = require("@nestjs/common");
const dem_elevation_service_1 = require("../../dem/services/dem-elevation.service");
const dem_effort_metadata_service_1 = require("../../dem/services/dem-effort-metadata.service");
const terrain_policy_config_1 = require("../config/terrain-policy.config");
const crypto = __importStar(require("crypto"));
let TerrainFactsService = TerrainFactsService_1 = class TerrainFactsService {
    constructor(demElevationService, demEffortMetadataService) {
        this.demElevationService = demElevationService;
        this.demEffortMetadataService = demEffortMetadataService;
        this.logger = new common_1.Logger(TerrainFactsService_1.name);
    }
    async getTerrainFactsForSegment(segmentId, lineString, stepM = 100) {
        const profile = await this.profileLine(lineString, stepM);
        const terrainStats = await this.computeTerrainStats(profile);
        const source = await this.inferSource(lineString);
        const elevationProfileId = this.generateProfileId(lineString, stepM);
        const effortLevel = this.mapEffortLevel(terrainStats.effortScore, terrain_policy_config_1.DEFAULT_TERRAIN_POLICY.effortLevelMapping);
        const riskFlags = [];
        return {
            terrainStats,
            effortLevel,
            riskFlags,
            elevationProfileId,
            source,
            computedAt: new Date().toISOString(),
        };
    }
    async profileLine(lineString, stepM) {
        const coordinates = lineString.coordinates;
        if (coordinates.length < 2) {
            throw new Error('LineString must have at least 2 coordinates');
        }
        const profile = [];
        let totalDistance = 0;
        for (let i = 0; i < coordinates.length; i++) {
            const [lng, lat] = coordinates[i];
            const elevation = await this.demElevationService.getElevation(lat, lng);
            if (i > 0) {
                const [prevLng, prevLat] = coordinates[i - 1];
                totalDistance += this.calculateDistance(prevLat, prevLng, lat, lng);
            }
            profile.push({
                distance: totalDistance,
                lat,
                lng,
                elevationM: elevation !== null && elevation !== void 0 ? elevation : 0,
            });
        }
        return profile;
    }
    async computeTerrainStats(profile) {
        if (profile.length < 2) {
            throw new Error('Profile must have at least 2 points');
        }
        const elevations = profile.map(p => p.elevationM);
        const minElevationM = Math.min(...elevations);
        const maxElevationM = Math.max(...elevations);
        const totalDistanceM = profile[profile.length - 1].distance;
        let totalAscentM = 0;
        let totalDescentM = 0;
        const slopes = [];
        for (let i = 1; i < profile.length; i++) {
            const prev = profile[i - 1];
            const curr = profile[i];
            const distance = curr.distance - prev.distance;
            const elevationChange = curr.elevationM - prev.elevationM;
            if (elevationChange > 0) {
                totalAscentM += elevationChange;
            }
            else {
                totalDescentM += Math.abs(elevationChange);
            }
            if (distance > 0) {
                const slope = (elevationChange / distance) * 100;
                slopes.push(Math.abs(slope));
            }
        }
        const maxSlopePct = slopes.length > 0 ? Math.max(...slopes) : 0;
        const avgSlopePct = slopes.length > 0 ? slopes.reduce((sum, s) => sum + s, 0) / slopes.length : 0;
        const distanceScore = Math.min(100, (totalDistanceM / 1000) * 10);
        const ascentScore = Math.min(100, (totalAscentM / 100) * 5);
        const slopeScore = Math.min(100, maxSlopePct * 2);
        const effortScore = Math.min(100, (distanceScore + ascentScore + slopeScore) / 3);
        return {
            minElevationM,
            maxElevationM,
            totalAscentM: Math.round(totalAscentM),
            totalDescentM: Math.round(totalDescentM),
            maxSlopePct: Math.round(maxSlopePct * 10) / 10,
            avgSlopePct: Math.round(avgSlopePct * 10) / 10,
            effortScore: Math.round(effortScore * 10) / 10,
            totalDistanceM: Math.round(totalDistanceM),
        };
    }
    async inferSource(lineString) {
        const coordinates = lineString.coordinates;
        const avgLat = coordinates.reduce((sum, [, lat]) => sum + lat, 0) / coordinates.length;
        const avgLng = coordinates.reduce((sum, [lng]) => sum + lng, 0) / coordinates.length;
        if (avgLat >= 18 && avgLat <= 54 && avgLng >= 73 && avgLng <= 135) {
            return 'CN_DEM';
        }
        return 'GLOBAL_DEM';
    }
    generateProfileId(lineString, stepM) {
        const coordsStr = JSON.stringify(lineString.coordinates);
        const hash = crypto.createHash('md5').update(coordsStr + stepM).digest('hex');
        return `profile_${hash.substring(0, 16)}`;
    }
    mapEffortLevel(effortScore, mapping) {
        if (effortScore <= mapping.relaxMax) {
            return 'RELAX';
        }
        else if (effortScore <= mapping.moderateMax) {
            return 'MODERATE';
        }
        else if (effortScore < mapping.extremeMin) {
            return 'CHALLENGE';
        }
        else {
            return 'EXTREME';
        }
    }
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
};
exports.TerrainFactsService = TerrainFactsService;
exports.TerrainFactsService = TerrainFactsService = TerrainFactsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dem_elevation_service_1.DEMElevationService,
        dem_effort_metadata_service_1.DEMEffortMetadataService])
], TerrainFactsService);
//# sourceMappingURL=terrain-facts.service.js.map