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
var DEMEffortMetadataService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMEffortMetadataService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const dem_elevation_service_1 = require("./dem-elevation.service");
let DEMEffortMetadataService = DEMEffortMetadataService_1 = class DEMEffortMetadataService {
    constructor(prisma, demService) {
        this.prisma = prisma;
        this.demService = demService;
        this.logger = new common_1.Logger(DEMEffortMetadataService_1.name);
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
    calculateSlope(elevation1, elevation2, distance) {
        if (distance === 0)
            return 0;
        const elevationChange = elevation2 - elevation1;
        return (elevationChange / distance) * 100;
    }
    async calculateEffortMetadata(points, options = {}) {
        const { activityType = 'walking', samplingInterval = 100, includeElevationProfile = false, } = options;
        if (points.length < 2) {
            throw new Error('路线至少需要2个点');
        }
        const elevations = [];
        for (const point of points) {
            const elevation = await this.demService.getElevation(point.lat, point.lng);
            if (elevation === null) {
                this.logger.warn(`无法获取海拔 (${point.lat}, ${point.lng})，使用前一点海拔或0`);
                elevations.push(elevations.length > 0 ? elevations[elevations.length - 1] : 0);
            }
            else {
                elevations.push(elevation);
            }
        }
        let totalDistance = 0;
        let totalAscent = 0;
        let totalDescent = 0;
        const slopes = [];
        const elevationProfile = [];
        for (let i = 0; i < points.length - 1; i++) {
            const point1 = points[i];
            const point2 = points[i + 1];
            const segmentDistance = point2.distance !== undefined && point1.distance !== undefined
                ? point2.distance - point1.distance
                : this.calculateDistance(point1.lat, point1.lng, point2.lat, point2.lng);
            totalDistance += segmentDistance;
            const elevation1 = elevations[i];
            const elevation2 = elevations[i + 1];
            const slope = this.calculateSlope(elevation1, elevation2, segmentDistance);
            slopes.push(Math.abs(slope));
            if (elevation2 > elevation1) {
                totalAscent += elevation2 - elevation1;
            }
            else {
                totalDescent += elevation1 - elevation2;
            }
            if (includeElevationProfile) {
                elevationProfile.push({
                    distance: totalDistance,
                    elevation: elevation2,
                    slope: slope,
                });
            }
        }
        const maxElevation = Math.max(...elevations);
        const minElevation = Math.min(...elevations);
        const avgElevation = elevations.reduce((sum, e) => sum + e, 0) / elevations.length;
        const netElevationGain = maxElevation - minElevation;
        const maxSlope = slopes.length > 0 ? Math.max(...slopes) : 0;
        const avgSlope = slopes.length > 0 ? slopes.reduce((sum, s) => sum + s, 0) / slopes.length : 0;
        const slopeVariance = slopes.length > 0
            ? slopes.reduce((sum, s) => sum + Math.pow(s - avgSlope, 2), 0) / slopes.length
            : 0;
        const terrainComplexity = Math.min(1, Math.sqrt(slopeVariance) / 20);
        const distanceScore = Math.min(100, (totalDistance / 1000) * 10);
        const ascentScore = Math.min(100, (totalAscent / 100) * 5);
        const slopeScore = Math.min(100, maxSlope * 2);
        const effortScore = Math.min(100, (distanceScore + ascentScore + slopeScore) / 3);
        let difficulty;
        if (effortScore < 30) {
            difficulty = 'easy';
        }
        else if (effortScore < 60) {
            difficulty = 'moderate';
        }
        else if (effortScore < 85) {
            difficulty = 'hard';
        }
        else {
            difficulty = 'extreme';
        }
        const baseSpeed = {
            walking: 4000,
            cycling: 15000,
            driving: 60000,
        }[activityType];
        const ascentPenalty = 1 + (totalAscent / 100) * 0.1;
        const estimatedDuration = (totalDistance / baseSpeed) * 60 * ascentPenalty;
        const suggestedRestPoints = Math.max(0, Math.floor((effortScore / 20) + (totalDistance / 5000)));
        return {
            totalAscent,
            totalDescent,
            netElevationGain,
            maxElevation,
            minElevation,
            avgElevation,
            maxSlope,
            avgSlope,
            totalDistance,
            effortScore,
            difficulty,
            estimatedDuration,
            suggestedRestPoints,
            terrainComplexity,
            elevationProfile: includeElevationProfile ? elevationProfile : undefined,
        };
    }
    async compareRoutes(route1, route2, options) {
        const [metadata1, metadata2] = await Promise.all([
            this.calculateEffortMetadata(route1, options),
            this.calculateEffortMetadata(route2, options),
        ]);
        const effortDifference = ((metadata2.effortScore - metadata1.effortScore) / metadata1.effortScore) * 100;
        const keyDifferences = [];
        if (Math.abs(metadata2.totalAscent - metadata1.totalAscent) > 100) {
            keyDifferences.push(`爬升差异：${Math.abs(metadata2.totalAscent - metadata1.totalAscent)}m`);
        }
        if (Math.abs(metadata2.maxSlope - metadata1.maxSlope) > 5) {
            keyDifferences.push(`最大坡度差异：${Math.abs(metadata2.maxSlope - metadata1.maxSlope).toFixed(1)}%`);
        }
        if (Math.abs(metadata2.totalDistance - metadata1.totalDistance) > 500) {
            keyDifferences.push(`距离差异：${Math.abs(metadata2.totalDistance - metadata1.totalDistance).toFixed(0)}m`);
        }
        let recommendation = '';
        if (effortDifference > 20) {
            recommendation = `路线2消耗明显更大（+${effortDifference.toFixed(1)}%），建议选择路线1`;
        }
        else if (effortDifference < -20) {
            recommendation = `路线1消耗明显更大（${effortDifference.toFixed(1)}%），建议选择路线2`;
        }
        else {
            recommendation = '两条路线消耗相近，可根据其他因素选择';
        }
        return {
            route1: metadata1,
            route2: metadata2,
            comparison: {
                effortDifference,
                keyDifferences,
                recommendation,
            },
        };
    }
    async detectKeyPoints(points) {
        const elevations = [];
        for (const point of points) {
            const elevation = await this.demService.getElevation(point.lat, point.lng);
            elevations.push(elevation !== null && elevation !== void 0 ? elevation : 0);
        }
        const maxElevation = Math.max(...elevations);
        const highestIndex = elevations.indexOf(maxElevation);
        const highestPoint = {
            index: highestIndex,
            lat: points[highestIndex].lat,
            lng: points[highestIndex].lng,
            elevation: maxElevation,
        };
        let maxSlope = 0;
        let steepestStart = 0;
        let steepestEnd = 1;
        for (let i = 0; i < points.length - 1; i++) {
            const distance = this.calculateDistance(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
            const slope = Math.abs(this.calculateSlope(elevations[i], elevations[i + 1], distance));
            if (slope > maxSlope) {
                maxSlope = slope;
                steepestStart = i;
                steepestEnd = i + 1;
            }
        }
        const mountainPasses = [];
        for (let i = 1; i < points.length - 1; i++) {
            if (elevations[i] > elevations[i - 1] &&
                elevations[i] > elevations[i + 1] &&
                elevations[i] > 3000) {
                mountainPasses.push({
                    index: i,
                    lat: points[i].lat,
                    lng: points[i].lng,
                    elevation: elevations[i],
                });
            }
        }
        return {
            highestPoint,
            steepestSegment: {
                startIndex: steepestStart,
                endIndex: steepestEnd,
                slope: maxSlope,
            },
            mountainPasses,
        };
    }
};
exports.DEMEffortMetadataService = DEMEffortMetadataService;
exports.DEMEffortMetadataService = DEMEffortMetadataService = DEMEffortMetadataService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        dem_elevation_service_1.DEMElevationService])
], DEMEffortMetadataService);
//# sourceMappingURL=dem-effort-metadata.service.js.map