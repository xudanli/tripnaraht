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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrailsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const trail_cache_service_1 = require("./services/trail-cache.service");
const crypto_1 = require("crypto");
let TrailsService = class TrailsService {
    constructor(prisma, cacheService) {
        this.prisma = prisma;
        this.cacheService = cacheService;
    }
    async create(dto) {
        if (dto.startPlaceId) {
            const startPlace = await this.prisma.place.findUnique({
                where: { id: dto.startPlaceId },
            });
            if (!startPlace) {
                throw new common_1.NotFoundException(`起点Place ID ${dto.startPlaceId} 不存在`);
            }
        }
        if (dto.endPlaceId) {
            const endPlace = await this.prisma.place.findUnique({
                where: { id: dto.endPlaceId },
            });
            if (!endPlace) {
                throw new common_1.NotFoundException(`终点Place ID ${dto.endPlaceId} 不存在`);
            }
        }
        if (dto.waypointPlaceIds && dto.waypointPlaceIds.length > 0) {
            const waypointPlaces = await this.prisma.place.findMany({
                where: { id: { in: dto.waypointPlaceIds } },
            });
            if (waypointPlaces.length !== dto.waypointPlaceIds.length) {
                throw new common_1.NotFoundException('部分途经点Place ID不存在');
            }
        }
        const trail = await this.prisma.trail.create({
            data: {
                uuid: (0, crypto_1.randomUUID)(),
                nameCN: dto.nameCN,
                nameEN: dto.nameEN,
                description: dto.description,
                distanceKm: dto.distanceKm,
                elevationGainM: dto.elevationGainM,
                elevationLossM: dto.elevationLossM,
                maxElevationM: dto.maxElevationM,
                minElevationM: dto.minElevationM,
                averageSlope: dto.averageSlope,
                difficultyLevel: dto.difficultyLevel,
                equivalentDistanceKm: dto.equivalentDistanceKm,
                fatigueScore: dto.fatigueScore,
                gpxData: dto.gpxData,
                gpxFileUrl: dto.gpxFileUrl,
                bounds: dto.bounds,
                startPlaceId: dto.startPlaceId,
                endPlaceId: dto.endPlaceId,
                metadata: dto.metadata,
                source: dto.source,
                sourceUrl: dto.sourceUrl,
                rating: dto.rating,
                estimatedDurationHours: dto.estimatedDurationHours,
            },
        });
        if (dto.waypointPlaceIds && dto.waypointPlaceIds.length > 0) {
            await this.prisma.trailWaypoint.createMany({
                data: dto.waypointPlaceIds.map((placeId, index) => ({
                    trailId: trail.id,
                    placeId,
                    order: index,
                })),
            });
        }
        return this.findOne(trail.id);
    }
    async findAll(filters) {
        const where = {};
        if (filters === null || filters === void 0 ? void 0 : filters.placeId) {
            where.OR = [
                { startPlaceId: filters.placeId },
                { endPlaceId: filters.placeId },
                { waypoints: { some: { placeId: filters.placeId } } },
            ];
        }
        if (filters === null || filters === void 0 ? void 0 : filters.difficulty) {
            where.difficultyLevel = filters.difficulty;
        }
        if ((filters === null || filters === void 0 ? void 0 : filters.minDistance) !== undefined || (filters === null || filters === void 0 ? void 0 : filters.maxDistance) !== undefined) {
            where.distanceKm = {};
            if ((filters === null || filters === void 0 ? void 0 : filters.minDistance) !== undefined) {
                where.distanceKm.gte = filters.minDistance;
            }
            if ((filters === null || filters === void 0 ? void 0 : filters.maxDistance) !== undefined) {
                where.distanceKm.lte = filters.maxDistance;
            }
        }
        if (filters === null || filters === void 0 ? void 0 : filters.source) {
            where.source = filters.source;
        }
        return this.prisma.trail.findMany({
            where,
            include: {
                Place_Trail_startPlaceIdToPlace: {
                    select: {
                        id: true,
                        nameCN: true,
                        nameEN: true,
                    },
                },
                Place_Trail_endPlaceIdToPlace: {
                    select: {
                        id: true,
                        nameCN: true,
                        nameEN: true,
                    },
                },
                TrailWaypoint: {
                    include: {
                        Place: {
                            select: {
                                id: true,
                                nameCN: true,
                                nameEN: true,
                            },
                        },
                    },
                    orderBy: {
                        order: 'asc',
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    async findOne(id) {
        const cached = this.cacheService.getTrail(id);
        if (cached) {
            return cached;
        }
        const trail = await this.prisma.trail.findUnique({
            where: { id },
            include: {
                Place_Trail_startPlaceIdToPlace: {
                    select: {
                        id: true,
                        nameCN: true,
                        nameEN: true,
                        address: true,
                    },
                },
                Place_Trail_endPlaceIdToPlace: {
                    select: {
                        id: true,
                        nameCN: true,
                        nameEN: true,
                        address: true,
                    },
                },
                TrailWaypoint: {
                    include: {
                        Place: {
                            select: {
                                id: true,
                                nameCN: true,
                                nameEN: true,
                                address: true,
                            },
                        },
                    },
                    orderBy: {
                        order: 'asc',
                    },
                },
            },
        });
        if (!trail) {
            throw new common_1.NotFoundException(`徒步路线 ID ${id} 不存在`);
        }
        this.cacheService.setTrail(id, trail);
        return trail;
    }
    async update(id, dto) {
        const existing = await this.prisma.trail.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new common_1.NotFoundException(`徒步路线 ID ${id} 不存在`);
        }
        if (dto.startPlaceId) {
            const startPlace = await this.prisma.place.findUnique({
                where: { id: dto.startPlaceId },
            });
            if (!startPlace) {
                throw new common_1.NotFoundException(`起点Place ID ${dto.startPlaceId} 不存在`);
            }
        }
        if (dto.endPlaceId) {
            const endPlace = await this.prisma.place.findUnique({
                where: { id: dto.endPlaceId },
            });
            if (!endPlace) {
                throw new common_1.NotFoundException(`终点Place ID ${dto.endPlaceId} 不存在`);
            }
        }
        if (dto.waypointPlaceIds !== undefined) {
            await this.prisma.trailWaypoint.deleteMany({
                where: { trailId: id },
            });
            if (dto.waypointPlaceIds.length > 0) {
                const waypointPlaces = await this.prisma.place.findMany({
                    where: { id: { in: dto.waypointPlaceIds } },
                });
                if (waypointPlaces.length !== dto.waypointPlaceIds.length) {
                    throw new common_1.NotFoundException('部分途经点Place ID不存在');
                }
                await this.prisma.trailWaypoint.createMany({
                    data: dto.waypointPlaceIds.map((placeId, index) => ({
                        trailId: id,
                        placeId,
                        order: index,
                    })),
                });
            }
        }
        const updateData = {};
        if (dto.nameCN !== undefined)
            updateData.nameCN = dto.nameCN;
        if (dto.nameEN !== undefined)
            updateData.nameEN = dto.nameEN;
        if (dto.description !== undefined)
            updateData.description = dto.description;
        if (dto.distanceKm !== undefined)
            updateData.distanceKm = dto.distanceKm;
        if (dto.elevationGainM !== undefined)
            updateData.elevationGainM = dto.elevationGainM;
        if (dto.elevationLossM !== undefined)
            updateData.elevationLossM = dto.elevationLossM;
        if (dto.maxElevationM !== undefined)
            updateData.maxElevationM = dto.maxElevationM;
        if (dto.minElevationM !== undefined)
            updateData.minElevationM = dto.minElevationM;
        if (dto.averageSlope !== undefined)
            updateData.averageSlope = dto.averageSlope;
        if (dto.difficultyLevel !== undefined)
            updateData.difficultyLevel = dto.difficultyLevel;
        if (dto.equivalentDistanceKm !== undefined)
            updateData.equivalentDistanceKm = dto.equivalentDistanceKm;
        if (dto.fatigueScore !== undefined)
            updateData.fatigueScore = dto.fatigueScore;
        if (dto.gpxData !== undefined)
            updateData.gpxData = dto.gpxData;
        if (dto.gpxFileUrl !== undefined)
            updateData.gpxFileUrl = dto.gpxFileUrl;
        if (dto.bounds !== undefined)
            updateData.bounds = dto.bounds;
        if (dto.startPlaceId !== undefined)
            updateData.startPlaceId = dto.startPlaceId;
        if (dto.endPlaceId !== undefined)
            updateData.endPlaceId = dto.endPlaceId;
        if (dto.metadata !== undefined)
            updateData.metadata = dto.metadata;
        if (dto.source !== undefined)
            updateData.source = dto.source;
        if (dto.sourceUrl !== undefined)
            updateData.sourceUrl = dto.sourceUrl;
        if (dto.rating !== undefined)
            updateData.rating = dto.rating;
        if (dto.estimatedDurationHours !== undefined)
            updateData.estimatedDurationHours = dto.estimatedDurationHours;
        await this.prisma.trail.update({
            where: { id },
            data: updateData,
        });
        return this.findOne(id);
    }
    async remove(id) {
        const trail = await this.prisma.trail.findUnique({
            where: { id },
        });
        if (!trail) {
            throw new common_1.NotFoundException(`徒步路线 ID ${id} 不存在`);
        }
        const items = await this.prisma.itineraryItem.findMany({
            where: { trailId: id },
        });
        if (items.length > 0) {
            throw new common_1.BadRequestException(`无法删除：该路线已被 ${items.length} 个行程项使用。请先删除相关行程项。`);
        }
        await this.prisma.trailWaypoint.deleteMany({
            where: { trailId: id },
        });
        await this.prisma.trail.delete({
            where: { id },
        });
        return { message: `徒步路线 ID ${id} 已删除` };
    }
    async recommendTrailsForPlaces(placeIds, options) {
        if (placeIds.length < 2) {
            throw new common_1.BadRequestException('至少需要2个景点才能推荐徒步路线');
        }
        const cached = this.cacheService.getRecommendation(placeIds, options);
        if (cached) {
            return cached;
        }
        const places = await this.prisma.place.findMany({
            where: { id: { in: placeIds } },
            select: {
                id: true,
                nameCN: true,
                nameEN: true,
            },
        });
        if (places.length !== placeIds.length) {
            throw new common_1.NotFoundException('部分景点ID不存在');
        }
        const placeCoords = await Promise.all(places.map(async (p) => {
            const locationResult = await this.prisma.$queryRaw `
          SELECT 
            ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lng
          FROM "Place"
          WHERE id = ${p.id}
        `;
            const coords = locationResult[0] ? {
                lat: locationResult[0].lat,
                lng: locationResult[0].lng,
            } : {};
            return { placeId: p.id, place: p, ...coords };
        }));
        const validPlaceCoords = placeCoords.filter(p => p.lat && p.lng);
        if (validPlaceCoords.length < 2) {
            throw new common_1.BadRequestException('部分景点缺少位置信息');
        }
        const allTrails = await this.prisma.trail.findMany({
            where: {
                OR: [
                    { startPlaceId: { in: placeIds } },
                    { endPlaceId: { in: placeIds } },
                    { TrailWaypoint: { some: { placeId: { in: placeIds } } } },
                ],
                ...((options === null || options === void 0 ? void 0 : options.maxDistance) && { distanceKm: { lte: options.maxDistance } }),
                ...((options === null || options === void 0 ? void 0 : options.maxDifficulty) && { difficultyLevel: { lte: options.maxDifficulty } }),
            },
            include: {
                Place_Trail_startPlaceIdToPlace: true,
                Place_Trail_endPlaceIdToPlace: true,
                TrailWaypoint: {
                    include: {
                        Place: true,
                    },
                    orderBy: {
                        order: 'asc',
                    },
                },
            },
        });
        const scoredTrails = await Promise.all(allTrails.map(async (trail) => {
            var _a;
            const matchedPlaces = new Set();
            if (trail.startPlaceId && placeIds.includes(trail.startPlaceId)) {
                matchedPlaces.add(trail.startPlaceId);
            }
            if (trail.endPlaceId && placeIds.includes(trail.endPlaceId)) {
                matchedPlaces.add(trail.endPlaceId);
            }
            trail.TrailWaypoint.forEach(wp => {
                if (wp.placeId && placeIds.includes(wp.placeId)) {
                    matchedPlaces.add(wp.placeId);
                }
            });
            const matchScore = matchedPlaces.size / placeIds.length;
            let avgDistance = 0;
            const unmatchedPlaceIds = placeIds.filter(id => !matchedPlaces.has(id));
            if (unmatchedPlaceIds.length > 0) {
                const unmatchedPlaces = validPlaceCoords.filter(p => unmatchedPlaceIds.includes(p.placeId));
                const trailCoords = await this.getTrailCenter(trail);
                if (trailCoords && unmatchedPlaces.length > 0) {
                    const distances = unmatchedPlaces
                        .filter(p => p.lat && p.lng)
                        .map(p => this.haversineDistance(trailCoords.lat, trailCoords.lng, p.lat, p.lng));
                    if (distances.length > 0) {
                        avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
                    }
                }
            }
            const distanceScore = avgDistance > 0 ? Math.max(0, 1 - avgDistance / 10) : 1;
            const totalScore = matchScore * 0.7 + distanceScore * 0.3;
            const isOffRoad = ((_a = trail.metadata) === null || _a === void 0 ? void 0 : _a.roadType) !== 'road';
            const offRoadBonus = (options === null || options === void 0 ? void 0 : options.preferOffRoad) && isOffRoad ? 0.1 : 0;
            return {
                trail,
                matchScore,
                avgDistance,
                totalScore: totalScore + offRoadBonus,
                matchedPlaceIds: Array.from(matchedPlaces),
            };
        }));
        scoredTrails.sort((a, b) => b.totalScore - a.totalScore);
        const result = scoredTrails.map(st => ({
            trail: st.trail,
            matchScore: st.matchScore,
            avgDistance: st.avgDistance,
            matchedPlaceIds: st.matchedPlaceIds,
            recommendation: st.matchScore >= 0.5
                ? '高度匹配：该路线串联了多个目标景点'
                : st.avgDistance < 3
                    ? '距离较近：该路线距离未匹配景点较近，可考虑作为补充'
                    : '部分匹配：该路线仅部分匹配目标景点',
        }));
        this.cacheService.setRecommendation(placeIds, options, result);
        return result;
    }
    async findPlacesAlongTrail(trailId, radiusKm = 3) {
        const cached = this.cacheService.getPlacesAlong(trailId, radiusKm);
        if (cached) {
            return cached;
        }
        const trail = await this.findOne(trailId);
        const trailPoints = await this.extractTrailPoints(trail);
        if (trailPoints.length === 0) {
            return [];
        }
        const radiusMeters = radiusKm * 1000;
        const placeIds = new Set();
        const placeDistanceMap = new Map();
        const sampledPoints = this.sampleTrailPoints(trailPoints, 100);
        for (const point of sampledPoints) {
            const nearbyPlaces = await this.prisma.$queryRaw `
        SELECT 
          p.id,
          p."nameCN",
          p."nameEN",
          p.category,
          p.rating,
          ST_Distance(
            p.location,
            ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
          ) as distance_meters
        FROM "Place" p
        WHERE 
          p.location IS NOT NULL
          AND p.category IN ('ATTRACTION', 'VIEWPOINT', 'NATURE', 'HISTORIC_SITE')
          AND ST_DWithin(
            p.location,
            ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
            ${radiusMeters}
          )
        ORDER BY distance_meters ASC
        LIMIT 20
      `;
            for (const place of nearbyPlaces) {
                const distanceKm = place.distance_meters / 1000;
                if (!placeDistanceMap.has(place.id) || placeDistanceMap.get(place.id) > distanceKm) {
                    placeDistanceMap.set(place.id, distanceKm);
                    placeIds.add(place.id);
                }
            }
        }
        if (placeIds.size === 0) {
            return [];
        }
        const places = await this.prisma.place.findMany({
            where: {
                id: { in: Array.from(placeIds) },
            },
            select: {
                id: true,
                nameCN: true,
                nameEN: true,
                category: true,
                rating: true,
            },
        });
        const placesWithLocation = await Promise.all(places.map(async (place) => {
            const locationResult = await this.prisma.$queryRaw `
          SELECT 
            ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lng
          FROM "Place"
          WHERE id = ${place.id}
        `;
            return {
                ...place,
                location: locationResult[0] ? {
                    lat: locationResult[0].lat,
                    lng: locationResult[0].lng,
                } : null,
            };
        }));
        const result = placesWithLocation
            .filter(p => p.location !== null)
            .map(place => {
            const distanceKm = placeDistanceMap.get(place.id);
            return {
                place: {
                    id: place.id,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN,
                    category: place.category,
                    rating: place.rating,
                },
                distanceKm,
                recommendation: distanceKm < 1
                    ? '强烈推荐：距离路线很近，可作为打卡点'
                    : distanceKm < 2
                        ? '推荐：距离适中，可考虑加入行程'
                        : '可选：距离较远，需要绕行',
            };
        })
            .sort((a, b) => a.distanceKm - b.distanceKm);
        this.cacheService.setPlacesAlong(trailId, radiusKm, result);
        return result;
    }
    async splitTrailIntoSegments(trailId, maxSegmentLengthKm) {
        const trail = await this.findOne(trailId);
        const trailPoints = await this.extractTrailPoints(trail);
        if (trailPoints.length < 2) {
            throw new common_1.BadRequestException('轨迹点不足，无法拆分');
        }
        const maxLength = maxSegmentLengthKm || trail.distanceKm / 2;
        const segments = [];
        let currentSegmentStart = 0;
        let currentDistance = 0;
        let currentElevationGain = 0;
        for (let i = 1; i < trailPoints.length; i++) {
            const prev = trailPoints[i - 1];
            const curr = trailPoints[i];
            const segmentDistance = this.haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
            const elevationDiff = (curr.elevation || 0) - (prev.elevation || 0);
            if (elevationDiff > 0) {
                currentElevationGain += elevationDiff;
            }
            currentDistance += segmentDistance;
            if (currentDistance >= maxLength && i < trailPoints.length - 1) {
                segments.push({
                    startIndex: currentSegmentStart,
                    endIndex: i,
                    distanceKm: currentDistance,
                    elevationGainM: currentElevationGain,
                    waypoints: trailPoints.slice(currentSegmentStart, i + 1),
                });
                currentSegmentStart = i;
                currentDistance = 0;
                currentElevationGain = 0;
            }
        }
        if (currentSegmentStart < trailPoints.length - 1) {
            segments.push({
                startIndex: currentSegmentStart,
                endIndex: trailPoints.length - 1,
                distanceKm: currentDistance,
                elevationGainM: currentElevationGain,
                waypoints: trailPoints.slice(currentSegmentStart),
            });
        }
        return segments.map((seg, index) => ({
            segmentIndex: index + 1,
            startPoint: seg.waypoints[0],
            endPoint: seg.waypoints[seg.waypoints.length - 1],
            distanceKm: seg.distanceKm,
            elevationGainM: seg.elevationGainM,
            estimatedDurationHours: seg.distanceKm / 4 + seg.elevationGainM / 300,
            waypointCount: seg.waypoints.length,
        }));
    }
    extractCoordinates(location) {
        if (!location)
            return {};
        if (typeof location === 'string') {
            const match = location.match(/POINT\(([\d.]+)\s+([\d.]+)\)/);
            if (match) {
                return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
            }
        }
        if (typeof location === 'object') {
            if ('lat' in location && 'lng' in location) {
                return { lat: location.lat, lng: location.lng };
            }
            if ('latitude' in location && 'longitude' in location) {
                return { lat: location.latitude, lng: location.longitude };
            }
        }
        return {};
    }
    async extractTrailPoints(trail) {
        if (trail.gpxData) {
            try {
                const gpx = typeof trail.gpxData === 'string'
                    ? JSON.parse(trail.gpxData)
                    : trail.gpxData;
                if (gpx.points && Array.isArray(gpx.points)) {
                    return gpx.points.map((p) => ({
                        lat: p.lat,
                        lng: p.lng,
                        elevation: p.elevation,
                    }));
                }
            }
            catch (e) {
            }
        }
        if (trail.waypoints && trail.waypoints.length > 0) {
            const waypointPoints = await Promise.all(trail.waypoints.map(async (wp) => {
                if (wp.placeId) {
                    const locationResult = await this.prisma.$queryRaw `
              SELECT 
                ST_Y(location::geometry) as lat,
                ST_X(location::geometry) as lng
              FROM "Place"
              WHERE id = ${wp.placeId}
            `;
                    if (locationResult[0]) {
                        return {
                            lat: locationResult[0].lat,
                            lng: locationResult[0].lng,
                            elevation: undefined,
                        };
                    }
                }
                return null;
            }));
            const validPoints = waypointPoints.filter((p) => p !== null);
            if (validPoints.length > 0) {
                return validPoints;
            }
        }
        const points = [];
        if (trail.startPlaceId) {
            const startLocation = await this.prisma.$queryRaw `
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${trail.startPlaceId}
      `;
            if (startLocation[0]) {
                points.push({ lat: startLocation[0].lat, lng: startLocation[0].lng });
            }
        }
        if (trail.endPlaceId) {
            const endLocation = await this.prisma.$queryRaw `
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${trail.endPlaceId}
      `;
            if (endLocation[0]) {
                points.push({ lat: endLocation[0].lat, lng: endLocation[0].lng });
            }
        }
        return points;
    }
    async getTrailCenter(trail) {
        const points = await this.extractTrailPoints(trail);
        if (points.length === 0)
            return null;
        const midIndex = Math.floor(points.length / 2);
        return { lat: points[midIndex].lat, lng: points[midIndex].lng };
    }
    calculateBounds(points) {
        if (points.length === 0) {
            throw new Error('点列表为空');
        }
        let minLat = points[0].lat;
        let maxLat = points[0].lat;
        let minLng = points[0].lng;
        let maxLng = points[0].lng;
        points.forEach(p => {
            minLat = Math.min(minLat, p.lat);
            maxLat = Math.max(maxLat, p.lat);
            minLng = Math.min(minLng, p.lng);
            maxLng = Math.max(maxLng, p.lng);
        });
        return { minLat, maxLat, minLng, maxLng };
    }
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
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
    sampleTrailPoints(points, intervalMeters) {
        if (points.length <= 1)
            return points;
        const sampled = [points[0]];
        let accumulatedDistance = 0;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const segmentDistance = this.haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng) * 1000;
            accumulatedDistance += segmentDistance;
            if (accumulatedDistance >= intervalMeters) {
                sampled.push(curr);
                accumulatedDistance = 0;
            }
        }
        if (sampled[sampled.length - 1] !== points[points.length - 1]) {
            sampled.push(points[points.length - 1]);
        }
        return sampled;
    }
    async checkTrailSuitability(trailId, pacingConfig) {
        const trail = await this.findOne(trailId);
        const { TrailFatigueCalculator } = await Promise.resolve().then(() => __importStar(require('./utils/trail-fatigue-calculator.util')));
        return TrailFatigueCalculator.isTrailSuitable({
            distanceKm: trail.distanceKm,
            elevationGainM: trail.elevationGainM,
            maxElevationM: trail.maxElevationM || undefined,
            difficultyLevel: trail.difficultyLevel || undefined,
        }, pacingConfig);
    }
};
exports.TrailsService = TrailsService;
exports.TrailsService = TrailsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trail_cache_service_1.TrailCacheService])
], TrailsService);
//# sourceMappingURL=trails.service.js.map