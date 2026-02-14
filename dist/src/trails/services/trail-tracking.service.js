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
exports.TrailTrackingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let TrailTrackingService = class TrailTrackingService {
    constructor(prisma) {
        this.prisma = prisma;
        this.activeSessions = new Map();
    }
    async startTracking(trailId, itineraryItemId) {
        const sessionId = `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session = {
            sessionId,
            trailId,
            itineraryItemId,
            startTime: new Date().toISOString(),
            points: [],
            statistics: {
                totalDistanceKm: 0,
                totalElevationGainM: 0,
                averageSpeedKmh: 0,
                maxSpeedKmh: 0,
                durationMinutes: 0,
            },
        };
        this.activeSessions.set(sessionId, session);
        return { sessionId };
    }
    async addTrackingPoint(sessionId, point) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`追踪会话不存在: ${sessionId}`);
        }
        session.points.push(point);
        this.updateStatistics(session);
        const deviation = await this.calculateDeviation(session.trailId, point);
        return {
            success: true,
            deviation,
        };
    }
    async stopTracking(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`追踪会话不存在: ${sessionId}`);
        }
        session.endTime = new Date().toISOString();
        this.updateStatistics(session);
        this.activeSessions.delete(sessionId);
        return session;
    }
    getTrackingSession(sessionId) {
        return this.activeSessions.get(sessionId) || null;
    }
    async calculateDeviation(trailId, currentPoint) {
        const trail = await this.prisma.trail.findUnique({
            where: { id: trailId },
        });
        if (!trail || !trail.gpxData) {
            return 0;
        }
        let plannedPoints = [];
        try {
            const gpx = typeof trail.gpxData === 'string'
                ? JSON.parse(trail.gpxData)
                : trail.gpxData;
            if (gpx.points && Array.isArray(gpx.points)) {
                plannedPoints = gpx.points;
            }
        }
        catch (e) {
            return 0;
        }
        if (plannedPoints.length === 0) {
            return 0;
        }
        const minDistance = plannedPoints.reduce((min, planned) => {
            const dist = this.haversineDistance(currentPoint.latitude, currentPoint.longitude, planned.lat, planned.lng);
            return Math.min(min, dist);
        }, Infinity);
        return minDistance * 1000;
    }
    updateStatistics(session) {
        if (session.points.length < 2) {
            return;
        }
        let totalDistance = 0;
        let totalElevationGain = 0;
        const speeds = [];
        for (let i = 1; i < session.points.length; i++) {
            const prev = session.points[i - 1];
            const curr = session.points[i];
            const distance = this.haversineDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
            totalDistance += distance;
            if (prev.elevation && curr.elevation) {
                const elevationDiff = curr.elevation - prev.elevation;
                if (elevationDiff > 0) {
                    totalElevationGain += elevationDiff;
                }
            }
            if (prev.timestamp && curr.timestamp) {
                const timeDiff = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
                if (timeDiff > 0) {
                    const speed = (distance * 1000) / timeDiff;
                    speeds.push(speed);
                }
            }
        }
        const averageSpeed = speeds.length > 0
            ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length
            : 0;
        const maxSpeed = speeds.length > 0
            ? Math.max(...speeds)
            : 0;
        const startTime = new Date(session.startTime).getTime();
        const endTime = session.endTime
            ? new Date(session.endTime).getTime()
            : Date.now();
        const durationMinutes = (endTime - startTime) / (1000 * 60);
        session.statistics = {
            totalDistanceKm: totalDistance,
            totalElevationGainM: totalElevationGain,
            averageSpeedKmh: averageSpeed * 3.6,
            maxSpeedKmh: maxSpeed * 3.6,
            durationMinutes,
        };
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
exports.TrailTrackingService = TrailTrackingService;
exports.TrailTrackingService = TrailTrackingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TrailTrackingService);
//# sourceMappingURL=trail-tracking.service.js.map