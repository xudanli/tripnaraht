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
exports.TripRecapService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const luxon_1 = require("luxon");
let TripRecapService = class TripRecapService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async generateRecap(tripId) {
        var _a;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: {
                                    select: {
                                        id: true,
                                        nameCN: true,
                                        nameEN: true,
                                        category: true,
                                    },
                                },
                                Trail: {
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
                                            select: {
                                                id: true,
                                                trailId: true,
                                                placeId: true,
                                                order: true,
                                                note: true,
                                            },
                                        },
                                    },
                                },
                            },
                            orderBy: {
                                startTime: 'asc',
                            },
                        },
                    },
                    orderBy: {
                        date: 'asc',
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const places = [];
        const trails = [];
        const timeline = [];
        for (const day of trip.TripDay) {
            const dateStr = luxon_1.DateTime.fromJSDate(day.date).toISODate();
            const dayItems = [];
            for (const item of day.ItineraryItem) {
                const startTime = luxon_1.DateTime.fromJSDate(item.startTime);
                const endTime = luxon_1.DateTime.fromJSDate(item.endTime);
                const duration = endTime.diff(startTime, 'hours').hours;
                if (item.Place) {
                    places.push({
                        id: item.Place.id,
                        nameCN: item.Place.nameCN,
                        nameEN: item.Place.nameEN || undefined,
                        category: item.Place.category,
                        visitDate: dateStr,
                        visitTime: startTime.toFormat('HH:mm'),
                    });
                    dayItems.push({
                        type: 'PLACE',
                        name: item.Place.nameCN,
                        time: startTime.toFormat('HH:mm'),
                        duration,
                        note: item.note || undefined,
                    });
                }
                if (item.Trail) {
                    const trail = item.Trail;
                    trails.push({
                        id: trail.id,
                        nameCN: trail.nameCN,
                        nameEN: trail.nameEN || undefined,
                        distanceKm: trail.distanceKm,
                        elevationGainM: trail.elevationGainM,
                        durationHours: trail.estimatedDurationHours || duration,
                        visitDate: dateStr,
                        gpxData: trail.gpxData || undefined,
                        waypoints: await Promise.all((trail.TrailWaypoint || []).map(async (wp) => {
                            var _a, _b;
                            let lat;
                            let lng;
                            if (wp.placeId) {
                                const locationResult = await this.prisma.$queryRaw `
                    SELECT 
                      ST_Y(location::geometry) as lat,
                      ST_X(location::geometry) as lng
                    FROM "Place"
                    WHERE id = ${wp.placeId}
                  `;
                                if (locationResult[0]) {
                                    lat = locationResult[0].lat;
                                    lng = locationResult[0].lng;
                                }
                            }
                            return {
                                placeId: wp.placeId || undefined,
                                placeName: ((_a = wp.place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = wp.place) === null || _b === void 0 ? void 0 : _b.nameEN) || undefined,
                                latitude: lat || 0,
                                longitude: lng || 0,
                                elevation: undefined,
                            };
                        })),
                    });
                    dayItems.push({
                        type: 'TRAIL',
                        name: trail.nameCN,
                        time: startTime.toFormat('HH:mm'),
                        duration: trail.estimatedDurationHours || duration,
                        note: item.note || undefined,
                    });
                }
                if (item.type === 'REST' || item.type === 'MEAL_ANCHOR' || item.type === 'MEAL_FLOATING') {
                    dayItems.push({
                        type: item.type === 'REST' ? 'REST' : 'MEAL',
                        name: ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || item.note || '休息/用餐',
                        time: startTime.toFormat('HH:mm'),
                        duration,
                        note: item.note || undefined,
                    });
                }
            }
            if (dayItems.length > 0) {
                timeline.push({
                    date: dateStr,
                    items: dayItems,
                });
            }
        }
        const placesByCategory = {};
        places.forEach(p => {
            placesByCategory[p.category] = (placesByCategory[p.category] || 0) + 1;
        });
        const statistics = {
            totalPlaces: places.length,
            totalTrails: trails.length,
            totalTrailDistanceKm: trails.reduce((sum, t) => sum + t.distanceKm, 0),
            totalElevationGainM: trails.reduce((sum, t) => sum + t.elevationGainM, 0),
            totalTrailDurationHours: trails.reduce((sum, t) => sum + t.durationHours, 0),
            placesByCategory,
        };
        return {
            tripId: trip.id,
            destination: trip.destination,
            startDate: luxon_1.DateTime.fromJSDate(trip.startDate).toISODate(),
            endDate: luxon_1.DateTime.fromJSDate(trip.endDate).toISODate(),
            totalDays: trip.TripDay.length,
            places,
            trails,
            statistics,
            timeline,
            metadata: trip.metadata || {},
        };
    }
    async exportForSharing(tripId) {
        const recap = await this.generateRecap(tripId);
        const existingShare = await this.prisma.tripShare.findFirst({
            where: { tripId },
            orderBy: { createdAt: 'desc' },
        });
        const shareUrl = existingShare
            ? `/trips/shared/${existingShare.shareToken}`
            : null;
        return {
            recap,
            shareUrl: shareUrl || '',
            exportDate: luxon_1.DateTime.now().toISO(),
        };
    }
    async generateTrailVideoData(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Trail: {
                                    include: {
                                        TrailWaypoint: {
                                            orderBy: {
                                                order: 'asc',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        date: 'asc',
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const trailData = [];
        for (const day of trip.TripDay) {
            for (const item of day.ItineraryItem) {
                if (item.Trail) {
                    const trail = item.Trail;
                    const startTime = luxon_1.DateTime.fromJSDate(item.startTime);
                    let points = [];
                    if (trail.gpxData) {
                        try {
                            const gpx = typeof trail.gpxData === 'string'
                                ? JSON.parse(trail.gpxData)
                                : trail.gpxData;
                            if (gpx.points && Array.isArray(gpx.points)) {
                                points = gpx.points;
                            }
                        }
                        catch (e) {
                        }
                    }
                    if (points.length === 0 && trail.TrailWaypoint && trail.TrailWaypoint.length > 0) {
                        const waypointPoints = await Promise.all(trail.TrailWaypoint.map(async (wp) => {
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
                        points = waypointPoints.filter((p) => p !== null);
                    }
                    const keyPoints = points
                        .filter((_, index) => index === 0 || index === points.length - 1 || index % Math.max(1, Math.floor(points.length / 10)) === 0)
                        .map((point, index) => {
                        const timeOffset = (trail.estimatedDurationHours || 1) * 3600 * (index / points.length);
                        return {
                            latitude: point.lat,
                            longitude: point.lng,
                            elevation: point.elevation || 0,
                            timestamp: startTime.plus({ seconds: timeOffset }).toISO(),
                            description: index === 0
                                ? '起点'
                                : index === points.length - 1
                                    ? '终点'
                                    : `途经点 ${index + 1}`,
                        };
                    });
                    trailData.push({
                        trailId: trail.id,
                        name: trail.nameCN,
                        gpxData: trail.gpxData,
                        keyPoints,
                    });
                }
            }
        }
        return { trails: trailData };
    }
};
exports.TripRecapService = TripRecapService;
exports.TripRecapService = TripRecapService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TripRecapService);
//# sourceMappingURL=trip-recap.service.js.map