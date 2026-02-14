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
var SpatialClusteringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpatialClusteringService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let SpatialClusteringService = SpatialClusteringService_1 = class SpatialClusteringService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(SpatialClusteringService_1.name);
    }
    async clusterPlaces(places, epsilon = 2000, minPoints = 2) {
        if (places.length === 0) {
            return [];
        }
        if (places.length < minPoints) {
            return [
                {
                    id: 0,
                    centroid: this.calculateCentroid(places),
                    places: places,
                    radius: epsilon,
                },
            ];
        }
        try {
            const placeIds = places.map((p) => p.id);
            const lats = places.map((p) => p.location.lat);
            const lngs = places.map((p) => p.location.lng);
            this.logger.debug('使用简化 K-Means 聚类（PostGIS 聚类需要临时表）');
            return this.simpleKMeansClustering(places, epsilon);
        }
        catch (error) {
            this.logger.error('空间聚类失败，使用简化 K-Means 聚类', error);
            return this.simpleKMeansClustering(places, epsilon);
        }
    }
    simpleKMeansClustering(places, epsilon) {
        const zones = [];
        const assigned = new Set();
        for (let i = 0; i < places.length; i++) {
            if (assigned.has(places[i].id))
                continue;
            const zone = [places[i]];
            assigned.add(places[i].id);
            for (let j = i + 1; j < places.length; j++) {
                if (assigned.has(places[j].id))
                    continue;
                const distance = this.calculateDistance(places[i].location, places[j].location);
                if (distance <= epsilon) {
                    zone.push(places[j]);
                    assigned.add(places[j].id);
                }
            }
            zones.push({
                id: zones.length,
                centroid: this.calculateCentroid(zone),
                places: zone,
                radius: this.calculateZoneRadius(zone),
            });
        }
        return zones;
    }
    calculateCentroid(places) {
        if (places.length === 0) {
            return { lat: 0, lng: 0 };
        }
        const sumLat = places.reduce((sum, p) => sum + p.location.lat, 0);
        const sumLng = places.reduce((sum, p) => sum + p.location.lng, 0);
        return {
            lat: sumLat / places.length,
            lng: sumLng / places.length,
        };
    }
    calculateZoneRadius(places) {
        if (places.length <= 1) {
            return 0;
        }
        const centroid = this.calculateCentroid(places);
        let maxDistance = 0;
        for (const place of places) {
            const distance = this.calculateDistance(centroid, place.location);
            maxDistance = Math.max(maxDistance, distance);
        }
        return maxDistance;
    }
    findNearestZone(place, zones) {
        if (zones.length === 0)
            return null;
        let minDistance = Infinity;
        let nearestZone = null;
        for (const zone of zones) {
            const centroid = this.calculateCentroid(zone);
            const distance = this.calculateDistance(centroid, place.location);
            if (distance < minDistance) {
                minDistance = distance;
                nearestZone = zone;
            }
        }
        return nearestZone;
    }
    calculateDistance(point1, point2) {
        const R = 6371000;
        const dLat = this.toRadians(point2.lat - point1.lat);
        const dLng = this.toRadians(point2.lng - point1.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(point1.lat)) *
                Math.cos(this.toRadians(point2.lat)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
};
exports.SpatialClusteringService = SpatialClusteringService;
exports.SpatialClusteringService = SpatialClusteringService = SpatialClusteringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SpatialClusteringService);
//# sourceMappingURL=spatial-clustering.service.js.map