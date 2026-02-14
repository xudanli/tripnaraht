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
var GeoSampleElevationProfileSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoSampleElevationProfileSkill = void 0;
const common_1 = require("@nestjs/common");
const dem_get_profile_skill_1 = require("../dem/dem-get-profile.skill");
let GeoSampleElevationProfileSkill = GeoSampleElevationProfileSkill_1 = class GeoSampleElevationProfileSkill {
    constructor(demGetProfileSkill) {
        this.demGetProfileSkill = demGetProfileSkill;
        this.logger = new common_1.Logger(GeoSampleElevationProfileSkill_1.name);
        this.MAX_SAMPLING_INTERVAL = 1000;
        this.MAX_SAMPLES = 5000;
        this.DEFAULT_SAMPLING_INTERVAL = 100;
        this.metadata = {
            name: 'geo.sampleElevationProfile',
            description: '标准化 DEM 高程采样：基于 PostGIS 栅格生成路线海拔剖面，计算累计爬升、最大坡度和疲劳指数',
            version: '1.0.0',
            category: 'dem',
        };
        if (!this.demGetProfileSkill) {
            this.logger.warn('DemGetProfileSkill 未注入，geo.sampleElevationProfile 功能将不可用');
        }
    }
    async execute(input) {
        const startTime = Date.now();
        this.logger.debug(`执行 geo.sampleElevationProfile: polyline=${input.polyline.length} 个点`);
        try {
            if (!input.polyline || input.polyline.length < 2) {
                throw new Error('polyline 至少需要 2 个点');
            }
            for (const point of input.polyline) {
                if (!point.lat ||
                    !point.lng ||
                    point.lat < -90 ||
                    point.lat > 90 ||
                    point.lng < -180 ||
                    point.lng > 180) {
                    throw new Error(`无效的坐标: (${point.lat}, ${point.lng})`);
                }
            }
            const validatedSamplingInterval = Math.min(input.samplingInterval || this.DEFAULT_SAMPLING_INTERVAL, this.MAX_SAMPLING_INTERVAL);
            if (input.samplingInterval && input.samplingInterval > this.MAX_SAMPLING_INTERVAL) {
                this.logger.warn(`采样间隔 ${input.samplingInterval}m 超过最大值 ${this.MAX_SAMPLING_INTERVAL}m，已限制为 ${validatedSamplingInterval}m`);
            }
            const estimatedSamples = Math.ceil(this.estimateRouteLength(input.polyline) / validatedSamplingInterval);
            const maxSamples = Math.min(input.maxSamples || this.MAX_SAMPLES, this.MAX_SAMPLES);
            if (estimatedSamples > maxSamples) {
                this.logger.warn(`估算采样点数 ${estimatedSamples} 超过最大值 ${maxSamples}，路线可能被截断`);
            }
            if (!this.demGetProfileSkill) {
                throw new Error('DemGetProfileSkill 未注入，无法执行高程采样');
            }
            const demResult = await this.demGetProfileSkill.execute({
                polyline: input.polyline,
                samples: validatedSamplingInterval,
            });
            const limitedProfile = demResult.elevationProfile.slice(0, maxSamples);
            const totalDistance = limitedProfile.length > 0
                ? limitedProfile[limitedProfile.length - 1].distance
                : 0;
            const queryTime = Date.now() - startTime;
            this.logger.debug(`geo.sampleElevationProfile 查询完成: ${limitedProfile.length} 个采样点，耗时 ${queryTime}ms`);
            return {
                elevationProfile: limitedProfile,
                cumulativeAscent: demResult.cumulativeAscent,
                maxSlope: demResult.maxSlope,
                fatigueIndex: demResult.fatigueIndex,
                summary: {
                    totalSamples: limitedProfile.length,
                    samplingInterval: validatedSamplingInterval,
                    totalDistance,
                    queryTime,
                },
            };
        }
        catch (error) {
            this.logger.error(`geo.sampleElevationProfile 查询失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    estimateRouteLength(polyline) {
        if (polyline.length < 2) {
            return 0;
        }
        let totalDistance = 0;
        for (let i = 1; i < polyline.length; i++) {
            const prev = polyline[i - 1];
            const curr = polyline[i];
            totalDistance += this.haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
        }
        return totalDistance;
    }
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
};
exports.GeoSampleElevationProfileSkill = GeoSampleElevationProfileSkill;
exports.GeoSampleElevationProfileSkill = GeoSampleElevationProfileSkill = GeoSampleElevationProfileSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [dem_get_profile_skill_1.DemGetProfileSkill])
], GeoSampleElevationProfileSkill);
//# sourceMappingURL=geo-sample-elevation-profile.skill.js.map