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
exports.TrailSupportServicesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let TrailSupportServicesService = class TrailSupportServicesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async recommendSupportServices(trailId) {
        const trail = await this.prisma.trail.findUnique({
            where: { id: trailId },
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
        if (!trail) {
            throw new Error(`Trail ${trailId} not found`);
        }
        const services = [];
        const equipmentRecommendations = this.recommendEquipment(trail);
        services.push(...equipmentRecommendations);
        const insuranceRecommendations = this.recommendInsurance(trail);
        services.push(...insuranceRecommendations);
        const supplyPoints = await this.recommendSupplyPoints(trail);
        services.push(...supplyPoints);
        const emergencyServices = await this.recommendEmergencyServices(trail);
        services.push(...emergencyServices);
        return services;
    }
    recommendEquipment(trail) {
        const services = [];
        const difficulty = trail.difficultyLevel;
        const maxElevation = trail.maxElevationM || 0;
        const elevationGain = trail.elevationGainM || 0;
        services.push({
            type: 'EQUIPMENT',
            name: '基础徒步装备',
            description: '徒步鞋、背包、水壶、头灯、地图/导航设备',
            recommendation: '所有徒步路线必备',
        });
        if (difficulty === 'HARD' || difficulty === 'EXTREME') {
            services.push({
                type: 'EQUIPMENT',
                name: '专业徒步装备',
                description: '登山杖、护膝、冲锋衣、速干衣、急救包',
                recommendation: '高难度路线强烈推荐',
            });
        }
        if (maxElevation > 3000) {
            services.push({
                type: 'EQUIPMENT',
                name: '高海拔装备',
                description: '保暖衣物、防晒霜、太阳镜、防高反药物',
                recommendation: '高海拔路线必需',
            });
        }
        if (elevationGain > 1000) {
            services.push({
                type: 'EQUIPMENT',
                name: '爬升辅助装备',
                description: '登山杖、护膝、抓地力强的徒步鞋',
                recommendation: '大爬升路线推荐',
            });
        }
        return services;
    }
    recommendInsurance(trail) {
        const services = [];
        const maxElevation = trail.maxElevationM || 0;
        const difficulty = trail.difficultyLevel;
        if (maxElevation > 3000) {
            services.push({
                type: 'INSURANCE',
                name: '高原反应保险',
                description: '覆盖高海拔徒步、高原反应、紧急救援的专项保险',
                recommendation: '高海拔路线强烈推荐购买',
                metadata: {
                    coverage: ['高原反应', '紧急救援', '医疗转运'],
                    recommendedProviders: ['平安保险', '中国人保'],
                },
            });
        }
        if (difficulty === 'EXTREME' || difficulty === 'HARD') {
            services.push({
                type: 'INSURANCE',
                name: '户外运动保险',
                description: '覆盖高风险户外运动、意外伤害、紧急救援',
                recommendation: '高难度路线必需',
                metadata: {
                    coverage: ['意外伤害', '紧急救援', '医疗费用'],
                    recommendedProviders: ['美亚保险', '安联保险'],
                },
            });
        }
        return services;
    }
    async recommendSupplyPoints(trail) {
        const services = [];
        const placeIds = [
            trail.startPlaceId,
            trail.endPlaceId,
            ...trail.TrailWaypoint.map((wp) => wp.placeId).filter(Boolean),
        ].filter(Boolean);
        if (placeIds.length > 0) {
            const places = await this.prisma.place.findMany({
                where: {
                    id: { in: placeIds },
                },
                select: {
                    id: true,
                    nameCN: true,
                    nameEN: true,
                    category: true,
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
            for (const place of placesWithLocation) {
                const coords = place.location;
                if (coords && coords.lat && coords.lng) {
                    const nearbyRestaurants = await this.findNearbyPlaces(coords.lat, coords.lng, 3, ['RESTAURANT', 'CAFE', 'FOOD']);
                    nearbyRestaurants.forEach(rest => {
                        const restCoords = this.extractCoordinates(rest.location);
                        if (restCoords.lat && restCoords.lng && coords.lat && coords.lng) {
                            services.push({
                                type: 'SUPPLY',
                                name: rest.nameCN || rest.nameEN || '餐饮点',
                                description: '补给点：可在此用餐、休息',
                                location: { lat: restCoords.lat, lng: restCoords.lng },
                                distanceKm: this.haversineDistance(coords.lat, coords.lng, restCoords.lat, restCoords.lng),
                                recommendation: `距离${place.nameCN || place.nameEN}较近的补给点`,
                            });
                        }
                    });
                }
            }
        }
        return services;
    }
    async recommendEmergencyServices(trail) {
        const services = [];
        const trailPoints = await this.extractTrailPoints(trail);
        if (trailPoints.length > 0) {
            const centerIndex = Math.floor(trailPoints.length / 2);
            const center = trailPoints[centerIndex];
            const hospitals = await this.findNearbyPlaces(center.lat, center.lng, 10, ['HOSPITAL', 'CLINIC', 'PHARMACY']);
            hospitals.forEach(hosp => {
                const coords = this.extractCoordinates(hosp.location);
                if (coords.lat && coords.lng) {
                    services.push({
                        type: 'EMERGENCY',
                        name: hosp.nameCN || hosp.nameEN || '医疗点',
                        description: '应急医疗点',
                        location: { lat: coords.lat, lng: coords.lng },
                        distanceKm: this.haversineDistance(center.lat, center.lng, coords.lat, coords.lng),
                        recommendation: '紧急情况可前往',
                    });
                }
            });
        }
        return services;
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
                    }));
                }
            }
            catch (e) {
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
    async findNearbyPlaces(lat, lng, radiusKm, categories) {
        const radiusMeters = radiusKm * 1000;
        try {
            if (categories.length === 0) {
                return [];
            }
            const categorySql = categories.map(c => `'${c}'`).join(', ');
            const places = await this.prisma.$queryRaw `
        SELECT 
          p.id,
          p."nameCN",
          p."nameEN",
          p.category,
          p.rating,
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng,
          ST_Distance(
            p.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_meters
        FROM "Place" p
        WHERE 
          p.location IS NOT NULL
          AND p.category = ANY(ARRAY[${client_1.Prisma.raw(categorySql)}]::"PlaceCategory"[])
          AND ST_DWithin(
            p.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusMeters}
          )
        ORDER BY distance_meters ASC
        LIMIT 20
      `;
            return places.map(p => ({
                id: p.id,
                nameCN: p.nameCN,
                nameEN: p.nameEN,
                category: p.category,
                rating: p.rating,
                location: {
                    lat: p.lat,
                    lng: p.lng,
                },
            }));
        }
        catch (error) {
            console.error('PostGIS空间查询失败:', error);
            return [];
        }
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
};
exports.TrailSupportServicesService = TrailSupportServicesService;
exports.TrailSupportServicesService = TrailSupportServicesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TrailSupportServicesService);
//# sourceMappingURL=trail-support-services.service.js.map