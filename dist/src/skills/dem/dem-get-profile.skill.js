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
var DemGetProfileSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemGetProfileSkill = void 0;
const common_1 = require("@nestjs/common");
const dem_elevation_service_1 = require("../../trips/dem/services/dem-elevation.service");
const dem_effort_metadata_service_1 = require("../../trips/dem/services/dem-effort-metadata.service");
let DemGetProfileSkill = DemGetProfileSkill_1 = class DemGetProfileSkill {
    constructor(demElevationService, demEffortMetadataService) {
        this.demElevationService = demElevationService;
        this.demEffortMetadataService = demEffortMetadataService;
        this.logger = new common_1.Logger(DemGetProfileSkill_1.name);
        this.metadata = {
            name: 'dem.getProfile',
            description: '基于 DEM 数据生成路线海拔剖面，计算累计爬升、最大坡度和疲劳指数',
            version: '1.0.0',
            category: 'dem',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['polyline'],
            },
        };
    }
    async execute(input) {
        var _a;
        this.logger.debug(`执行 dem.getProfile: ${input.polyline.length} 个点`);
        if (!input.polyline || input.polyline.length < 2) {
            throw new Error('polyline 至少需要 2 个点');
        }
        const samplingInterval = input.samples || 100;
        const routePoints = input.polyline.map((p, index) => ({
            lat: p.lat,
            lng: p.lng,
            sequence: index,
        }));
        const canUseEffort = this.demEffortMetadataService &&
            typeof this.demEffortMetadataService.calculateEffortMetadata === 'function';
        const effortMetadata = canUseEffort
            ? await this.demEffortMetadataService.calculateEffortMetadata(routePoints, {
                activityType: 'walking',
                samplingInterval,
                includeElevationProfile: true,
            })
            : {
                elevationProfile: [],
                totalDistance: 0,
                totalAscent: 0,
            };
        let cumulativeAscent = 0;
        const elevationProfile = ((_a = effortMetadata.elevationProfile) === null || _a === void 0 ? void 0 : _a.map((point, index) => {
            if (index > 0 && effortMetadata.elevationProfile) {
                const prevElevation = effortMetadata.elevationProfile[index - 1].elevation;
                const elevationDiff = point.elevation - prevElevation;
                if (elevationDiff > 0) {
                    cumulativeAscent += elevationDiff;
                }
            }
            return {
                distance: point.distance,
                lat: routePoints[Math.min(index, routePoints.length - 1)].lat,
                lng: routePoints[Math.min(index, routePoints.length - 1)].lng,
                elevation: point.elevation,
                slope: point.slope,
                cumulativeAscent,
            };
        })) || [];
        const maxSlope = Math.max(...elevationProfile.map(p => Math.abs(p.slope)), 0);
        const totalDistance = effortMetadata.totalDistance || 0;
        const totalAscent = effortMetadata.totalAscent || 0;
        const fatigueIndex = Math.min(100, (totalAscent / 1000) * 10 + (totalDistance / 1000) * 2);
        return {
            elevationProfile,
            cumulativeAscent: totalAscent,
            maxSlope,
            fatigueIndex,
        };
    }
};
exports.DemGetProfileSkill = DemGetProfileSkill;
exports.DemGetProfileSkill = DemGetProfileSkill = DemGetProfileSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dem_elevation_service_1.DEMElevationService,
        dem_effort_metadata_service_1.DEMEffortMetadataService])
], DemGetProfileSkill);
//# sourceMappingURL=dem-get-profile.skill.js.map