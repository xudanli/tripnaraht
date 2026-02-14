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
var DEMRouteSegmentationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMRouteSegmentationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const dem_elevation_service_1 = require("../../dem/services/dem-elevation.service");
const dem_effort_metadata_service_1 = require("../../dem/services/dem-effort-metadata.service");
let DEMRouteSegmentationService = DEMRouteSegmentationService_1 = class DEMRouteSegmentationService {
    constructor(prisma, demElevationService, demEffortService) {
        this.prisma = prisma;
        this.demElevationService = demElevationService;
        this.demEffortService = demEffortService;
        this.logger = new common_1.Logger(DEMRouteSegmentationService_1.name);
        if (!demElevationService || !demEffortService) {
            this.logger.warn('DEMElevationService or DEMEffortMetadataService not available. DEM features will be disabled.');
        }
    }
    async segmentRoute(corridorGeom, config = {}) {
        const { samplingInterval = 100, steepSlopeThreshold = 15, steepSectionMinLength = 500, energyBreakpointThreshold = 70, highAltitudeThreshold = 3000, consecutiveAscentThreshold = 1200, baseCostPerKm = 5, ascentFactor = 0.1, } = config;
        const routePoints = await this.extractRoutePointsFromGeometry(corridorGeom, samplingInterval);
        if (routePoints.length < 2) {
            throw new Error('Corridor geometry must have at least 2 points');
        }
        const elevationProfile = await this.generateElevationProfile(routePoints, {
            baseCostPerKm,
            ascentFactor,
        });
        const steepSections = this.identifySteepSections(elevationProfile, steepSlopeThreshold, steepSectionMinLength);
        const energyBreakpoints = this.identifyEnergyBreakpoints(elevationProfile, energyBreakpointThreshold);
        const mandatoryRestPoints = this.identifyMandatoryRestPoints(elevationProfile, highAltitudeThreshold, consecutiveAscentThreshold);
        const stats = this.calculateStatistics(elevationProfile);
        return {
            elevationProfile,
            steepSections,
            energyBreakpoints,
            mandatoryRestPoints,
            ...stats,
        };
    }
    async extractRoutePointsFromGeometry(geometry, samplingInterval) {
        try {
            if (typeof geometry === 'string') {
                return this.extractPointsFromWKT(geometry, samplingInterval);
            }
            if (geometry && typeof geometry === 'object' && geometry.type) {
                return this.extractPointsFromGeoJSON(geometry, samplingInterval);
            }
            return await this.extractPointsFromPostGIS(geometry, samplingInterval);
        }
        catch (error) {
            this.logger.error(`Failed to extract route points: ${error}`);
            throw error;
        }
    }
    extractPointsFromWKT(wkt, samplingInterval) {
        const points = [];
        const lineStringMatch = wkt.match(/LINESTRING\s*\(([^)]+)\)/i);
        if (lineStringMatch) {
            const coords = lineStringMatch[1].split(',').map(s => s.trim());
            for (const coord of coords) {
                const [lng, lat] = coord.split(/\s+/).map(parseFloat);
                points.push({ lat, lng });
            }
        }
        if (points.length < 2) {
            return points;
        }
        if (samplingInterval <= 0) {
            return points;
        }
        return this.resamplePoints(points, samplingInterval);
    }
    extractPointsFromGeoJSON(geoJson, samplingInterval) {
        const points = [];
        if (geoJson.type === 'LineString' && Array.isArray(geoJson.coordinates)) {
            for (const coord of geoJson.coordinates) {
                const [lng, lat] = coord;
                points.push({ lat, lng });
            }
        }
        else if (geoJson.type === 'MultiLineString' && Array.isArray(geoJson.coordinates)) {
            for (const lineString of geoJson.coordinates) {
                for (const coord of lineString) {
                    const [lng, lat] = coord;
                    points.push({ lat, lng });
                }
            }
        }
        if (points.length < 2) {
            return points;
        }
        if (samplingInterval <= 0) {
            return points;
        }
        return this.resamplePoints(points, samplingInterval);
    }
    async extractPointsFromPostGIS(geometry, samplingInterval) {
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          ST_Y((dp).geom::geometry) as lat,
          ST_X((dp).geom::geometry) as lng
        FROM (
          SELECT ST_DumpPoints(${geometry}::geometry) as dp
        ) AS points
        ORDER BY (dp).path[1], (dp).path[2]
      `;
            const points = result.map(r => ({ lat: r.lat, lng: r.lng }));
            if (points.length < 2) {
                return points;
            }
            if (samplingInterval <= 0) {
                return points;
            }
            return this.resamplePoints(points, samplingInterval);
        }
        catch (error) {
            this.logger.warn(`Failed to extract points from PostGIS, trying alternative method: ${error}`);
            const geoJsonResult = await this.prisma.$queryRaw `
        SELECT ST_AsGeoJSON(${geometry}::geometry)::jsonb as geojson
      `;
            if (geoJsonResult.length > 0 && geoJsonResult[0].geojson) {
                return this.extractPointsFromGeoJSON(geoJsonResult[0].geojson, samplingInterval);
            }
            throw new Error(`Failed to extract points from geometry: ${error}`);
        }
    }
    resamplePoints(points, interval) {
        if (points.length < 2) {
            return points;
        }
        const resampled = [points[0]];
        let accumulatedDistance = 0;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const segmentDistance = this.calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
            accumulatedDistance += segmentDistance;
            if (accumulatedDistance >= interval) {
                resampled.push(curr);
                accumulatedDistance = 0;
            }
        }
        if (resampled[resampled.length - 1] !== points[points.length - 1]) {
            resampled.push(points[points.length - 1]);
        }
        return resampled;
    }
    async generateElevationProfile(routePoints, config) {
        var _a, _b;
        const profile = [];
        let cumulativeDistance = 0;
        let cumulativeAscent = 0;
        let cumulativeEnergyCost = 0;
        let prevElevation = null;
        for (let i = 0; i < routePoints.length; i++) {
            const point = routePoints[i];
            const elevation = (_b = await ((_a = this.demElevationService) === null || _a === void 0 ? void 0 : _a.getElevation(point.lat, point.lng))) !== null && _b !== void 0 ? _b : 0;
            let segmentDistance = 0;
            if (i > 0) {
                const prevPoint = routePoints[i - 1];
                segmentDistance = this.calculateDistance(prevPoint.lat, prevPoint.lng, point.lat, point.lng);
                cumulativeDistance += segmentDistance;
            }
            let slope = 0;
            if (prevElevation !== null && segmentDistance > 0) {
                const elevationChange = elevation - prevElevation;
                slope = (elevationChange / segmentDistance) * 100;
            }
            if (prevElevation !== null && elevation > prevElevation) {
                cumulativeAscent += elevation - prevElevation;
            }
            const distanceKm = segmentDistance / 1000;
            const segmentEnergyCost = distanceKm * config.baseCostPerKm;
            if (prevElevation !== null && elevation > prevElevation) {
                const ascentM = elevation - prevElevation;
                cumulativeEnergyCost += segmentEnergyCost + (ascentM * config.ascentFactor);
            }
            else {
                cumulativeEnergyCost += segmentEnergyCost;
            }
            profile.push({
                distance: cumulativeDistance,
                lat: point.lat,
                lng: point.lng,
                elevation,
                slope,
                cumulativeAscent,
                cumulativeEnergyCost: Math.min(100, cumulativeEnergyCost),
            });
            prevElevation = elevation;
        }
        return profile;
    }
    identifySteepSections(profile, threshold, minLength) {
        const sections = [];
        let currentSection = null;
        for (let i = 1; i < profile.length; i++) {
            const slope = Math.abs(profile[i].slope);
            if (slope >= threshold) {
                if (!currentSection) {
                    currentSection = {
                        startIndex: i - 1,
                        startDistance: profile[i - 1].distance,
                        slopes: [slope],
                    };
                }
                else {
                    currentSection.slopes.push(slope);
                }
            }
            else {
                if (currentSection) {
                    const length = profile[i - 1].distance - currentSection.startDistance;
                    if (length >= minLength) {
                        const avgSlope = currentSection.slopes.reduce((sum, s) => sum + s, 0) / currentSection.slopes.length;
                        const maxSlope = Math.max(...currentSection.slopes);
                        const totalAscent = profile[i - 1].cumulativeAscent - profile[currentSection.startIndex].cumulativeAscent;
                        let severity = 'LOW';
                        if (avgSlope >= 25 || maxSlope >= 30) {
                            severity = 'HIGH';
                        }
                        else if (avgSlope >= 20 || maxSlope >= 25) {
                            severity = 'MEDIUM';
                        }
                        sections.push({
                            startDistance: currentSection.startDistance,
                            endDistance: profile[i - 1].distance,
                            startIndex: currentSection.startIndex,
                            endIndex: i - 1,
                            avgSlope: Math.round(avgSlope * 100) / 100,
                            maxSlope: Math.round(maxSlope * 100) / 100,
                            length: Math.round(length),
                            totalAscent: Math.round(totalAscent),
                            severity,
                        });
                    }
                    currentSection = null;
                }
            }
        }
        if (currentSection) {
            const i = profile.length - 1;
            const length = profile[i].distance - currentSection.startDistance;
            if (length >= minLength) {
                const avgSlope = currentSection.slopes.reduce((sum, s) => sum + s, 0) / currentSection.slopes.length;
                const maxSlope = Math.max(...currentSection.slopes);
                const totalAscent = profile[i].cumulativeAscent - profile[currentSection.startIndex].cumulativeAscent;
                let severity = 'LOW';
                if (avgSlope >= 25 || maxSlope >= 30) {
                    severity = 'HIGH';
                }
                else if (avgSlope >= 20 || maxSlope >= 25) {
                    severity = 'MEDIUM';
                }
                sections.push({
                    startDistance: currentSection.startDistance,
                    endDistance: profile[i].distance,
                    startIndex: currentSection.startIndex,
                    endIndex: i,
                    avgSlope: Math.round(avgSlope * 100) / 100,
                    maxSlope: Math.round(maxSlope * 100) / 100,
                    length: Math.round(length),
                    totalAscent: Math.round(totalAscent),
                    severity,
                });
            }
        }
        return sections;
    }
    identifyEnergyBreakpoints(profile, threshold) {
        const breakpoints = [];
        let lastBreakpointIndex = -1;
        for (let i = 1; i < profile.length; i++) {
            const energyCost = profile[i].cumulativeEnergyCost;
            if (energyCost >= threshold) {
                const distanceSinceLastBreakpoint = i > lastBreakpointIndex
                    ? profile[i].distance - (lastBreakpointIndex >= 0 ? profile[lastBreakpointIndex].distance : 0)
                    : Infinity;
                if (distanceSinceLastBreakpoint >= 1000) {
                    const restDuration = Math.min(60, Math.max(10, (energyCost - threshold) * 2));
                    breakpoints.push({
                        distance: profile[i].distance,
                        index: i,
                        cumulativeEnergyCost: Math.round(energyCost * 100) / 100,
                        suggestedRestDuration: Math.round(restDuration),
                        reason: `累计体力消耗达到 ${energyCost.toFixed(1)}，超过阈值 ${threshold}`,
                    });
                    lastBreakpointIndex = i;
                }
            }
        }
        return breakpoints;
    }
    identifyMandatoryRestPoints(profile, highAltitudeThreshold, consecutiveAscentThreshold) {
        const restPoints = [];
        let consecutiveHighAltitudeCount = 0;
        let consecutiveAscentStartIndex = -1;
        let consecutiveAscentStartElevation = 0;
        for (let i = 0; i < profile.length; i++) {
            const point = profile[i];
            const reasons = [];
            let severity = 'LOW';
            let suggestedRestDuration = 15;
            if (point.elevation >= highAltitudeThreshold) {
                consecutiveHighAltitudeCount++;
                if (consecutiveHighAltitudeCount >= 3) {
                    reasons.push(`连续高海拔（${point.elevation.toFixed(0)}m，超过${highAltitudeThreshold}m）`);
                    severity = point.elevation >= 4000 ? 'HIGH' : point.elevation >= 3500 ? 'MEDIUM' : 'LOW';
                    suggestedRestDuration = point.elevation >= 4000 ? 30 : point.elevation >= 3500 ? 20 : 15;
                }
            }
            else {
                consecutiveHighAltitudeCount = 0;
            }
            if (i > 0) {
                const prevPoint = profile[i - 1];
                if (point.elevation > prevPoint.elevation) {
                    if (consecutiveAscentStartIndex < 0) {
                        consecutiveAscentStartIndex = i - 1;
                        consecutiveAscentStartElevation = prevPoint.elevation;
                    }
                    const consecutiveAscent = point.elevation - consecutiveAscentStartElevation;
                    if (consecutiveAscent >= consecutiveAscentThreshold) {
                        reasons.push(`连续上升${consecutiveAscent.toFixed(0)}m（超过${consecutiveAscentThreshold}m）`);
                        severity = consecutiveAscent >= 2000 ? 'HIGH' : consecutiveAscent >= 1500 ? 'MEDIUM' : 'LOW';
                        suggestedRestDuration = consecutiveAscent >= 2000 ? 45 : consecutiveAscent >= 1500 ? 30 : 20;
                        consecutiveAscentStartIndex = -1;
                    }
                }
                else {
                    consecutiveAscentStartIndex = -1;
                }
            }
            if (reasons.length > 0) {
                restPoints.push({
                    distance: point.distance,
                    index: i,
                    elevation: point.elevation,
                    consecutiveHighAltitudeDays: consecutiveHighAltitudeCount >= 3 ? consecutiveHighAltitudeCount : undefined,
                    consecutiveAscent: consecutiveAscentStartIndex >= 0
                        ? point.elevation - consecutiveAscentStartElevation
                        : undefined,
                    reason: reasons.join('；'),
                    suggestedRestDuration,
                    severity,
                });
            }
        }
        return restPoints;
    }
    calculateStatistics(profile) {
        if (profile.length === 0) {
            return {
                totalDistance: 0,
                totalAscent: 0,
                totalDescent: 0,
                maxElevation: 0,
                minElevation: 0,
                avgSlope: 0,
                maxSlope: 0,
            };
        }
        const totalDistance = profile[profile.length - 1].distance;
        const totalAscent = profile[profile.length - 1].cumulativeAscent;
        let totalDescent = 0;
        for (let i = 1; i < profile.length; i++) {
            if (profile[i].elevation < profile[i - 1].elevation) {
                totalDescent += profile[i - 1].elevation - profile[i].elevation;
            }
        }
        const elevations = profile.map(p => p.elevation);
        const maxElevation = Math.max(...elevations);
        const minElevation = Math.min(...elevations);
        const slopes = profile.slice(1).map(p => Math.abs(p.slope));
        const avgSlope = slopes.length > 0
            ? slopes.reduce((sum, s) => sum + s, 0) / slopes.length
            : 0;
        const maxSlope = slopes.length > 0 ? Math.max(...slopes) : 0;
        return {
            totalDistance: Math.round(totalDistance),
            totalAscent: Math.round(totalAscent),
            totalDescent: Math.round(totalDescent),
            maxElevation: Math.round(maxElevation),
            minElevation: Math.round(minElevation),
            avgSlope: Math.round(avgSlope * 100) / 100,
            maxSlope: Math.round(maxSlope * 100) / 100,
        };
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
exports.DEMRouteSegmentationService = DEMRouteSegmentationService;
exports.DEMRouteSegmentationService = DEMRouteSegmentationService = DEMRouteSegmentationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        dem_elevation_service_1.DEMElevationService,
        dem_effort_metadata_service_1.DEMEffortMetadataService])
], DEMRouteSegmentationService);
//# sourceMappingURL=dem-route-segmentation.service.js.map