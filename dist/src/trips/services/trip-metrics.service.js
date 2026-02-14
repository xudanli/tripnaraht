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
var TripMetricsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripMetricsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const luxon_1 = require("luxon");
const trip_conflicts_service_1 = require("./trip-conflicts.service");
let TripMetricsService = TripMetricsService_1 = class TripMetricsService {
    constructor(prisma, conflictsService) {
        this.prisma = prisma;
        this.conflictsService = conflictsService;
        this.logger = new common_1.Logger(TripMetricsService_1.name);
    }
    async getDayMetrics(tripId, dayId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    where: { id: dayId },
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
                            },
                            orderBy: {
                                startTime: 'asc',
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const day = trip.TripDay[0];
        if (!day) {
            throw new common_1.NotFoundException(`日期 ID ${dayId} 不存在`);
        }
        const date = luxon_1.DateTime.fromJSDate(day.date).toISODate() || '';
        const metrics = await this.calculateDayMetrics(day);
        const conflicts = await this.conflictsService.getDayConflicts(tripId, dayId);
        return {
            date,
            metrics,
            conflicts: conflicts,
        };
    }
    async getTripMetrics(tripId, dates) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    where: dates
                        ? {
                            date: {
                                in: dates.map(d => luxon_1.DateTime.fromISO(d).toJSDate()),
                            },
                        }
                        : undefined,
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
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
        const days = [];
        for (const day of trip.TripDay) {
            const date = luxon_1.DateTime.fromJSDate(day.date).toISODate() || '';
            const metrics = await this.calculateDayMetrics(day);
            const conflicts = await this.conflictsService.getDayConflicts(tripId, day.id);
            days.push({
                date,
                metrics,
                conflicts: conflicts,
            });
        }
        const summary = this.calculateSummary(days);
        return {
            tripId,
            days,
            summary,
        };
    }
    async calculateDayMetrics(day) {
        var _a, _b;
        const items = day.ItineraryItem || [];
        let totalWalk = 0;
        let totalDrive = 0;
        let totalBuffer = 0;
        let totalFatigue = 0;
        let totalAscent = 0;
        let totalCost = 0;
        let totalDistance = 0;
        let totalTravelTime = 0;
        const travelByMode = {
            walking: 0,
            driving: 0,
            transit: 0,
            train: 0,
            flight: 0,
            ferry: 0,
            bicycle: 0,
            taxi: 0,
        };
        for (let i = 1; i < items.length; i++) {
            const current = items[i];
            const prev = items[i - 1];
            const distance = current.travelFromPreviousDistance || 0;
            const duration = current.travelFromPreviousDuration || 0;
            const travelMode = (current.travelMode || 'DRIVING').toUpperCase();
            totalDistance += distance;
            totalTravelTime += duration;
            switch (travelMode) {
                case 'WALKING':
                    travelByMode.walking += duration;
                    totalWalk += distance / 1000;
                    break;
                case 'DRIVING':
                    travelByMode.driving += duration;
                    totalDrive += duration;
                    break;
                case 'TRANSIT':
                    travelByMode.transit += duration;
                    totalDrive += duration;
                    break;
                case 'TRAIN':
                    travelByMode.train += duration;
                    totalDrive += duration;
                    break;
                case 'FLIGHT':
                    travelByMode.flight += duration;
                    totalDrive += duration;
                    break;
                case 'FERRY':
                    travelByMode.ferry += duration;
                    totalDrive += duration;
                    break;
                case 'BICYCLE':
                    travelByMode.bicycle += duration;
                    totalWalk += distance / 1000;
                    break;
                case 'TAXI':
                    travelByMode.taxi += duration;
                    totalDrive += duration;
                    break;
                default:
                    if (distance < 2000) {
                        travelByMode.walking += duration;
                        totalWalk += distance / 1000;
                    }
                    else {
                        travelByMode.driving += duration;
                        totalDrive += duration;
                    }
            }
            if (prev.endTime && current.startTime) {
                const prevEnd = luxon_1.DateTime.fromJSDate(prev.endTime);
                const currentStart = luxon_1.DateTime.fromJSDate(current.startTime);
                const bufferMinutes = currentStart.diff(prevEnd, 'minutes').minutes;
                const actualBuffer = bufferMinutes - duration;
                if (actualBuffer > 0) {
                    totalBuffer += actualBuffer;
                }
            }
        }
        for (const item of items) {
            if ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.physicalMetadata) {
                const physical = item.Place.physicalMetadata;
                totalFatigue += physical.fatigueScore || 0;
                totalAscent += physical.elevationGain || physical.elevation || 0;
            }
            totalCost += item.estimatedCost || item.actualCost || 0;
            if (!item.estimatedCost && !item.actualCost && ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.metadata)) {
                const metadata = item.Place.metadata;
                totalCost += metadata.cost || metadata.price || 0;
            }
        }
        return {
            walk: Math.round(totalWalk * 100) / 100,
            drive: totalDrive,
            buffer: Math.max(0, totalBuffer),
            fatigue: Math.min(100, totalFatigue),
            ascent: totalAscent,
            cost: totalCost,
            travelByMode,
            totalTravelTime,
            totalDistance,
        };
    }
    calculateSummary(days) {
        const totalWalk = days.reduce((sum, day) => sum + day.metrics.walk, 0);
        const totalDrive = days.reduce((sum, day) => sum + day.metrics.drive, 0);
        const totalBuffer = days.reduce((sum, day) => sum + day.metrics.buffer, 0);
        const totalFatigue = days.reduce((sum, day) => sum + day.metrics.fatigue, 0);
        const totalCost = days.reduce((sum, day) => sum + day.metrics.cost, 0);
        const dayCount = days.length || 1;
        return {
            totalWalk: Math.round(totalWalk * 100) / 100,
            totalDrive,
            totalBuffer,
            totalFatigue: Math.min(100, totalFatigue),
            totalCost,
            averageWalkPerDay: Math.round((totalWalk / dayCount) * 100) / 100,
            averageDrivePerDay: Math.round(totalDrive / dayCount),
        };
    }
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) *
                Math.cos(this.toRad(lat2)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(degrees) {
        return degrees * (Math.PI / 180);
    }
};
exports.TripMetricsService = TripMetricsService;
exports.TripMetricsService = TripMetricsService = TripMetricsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trip_conflicts_service_1.TripConflictsService])
], TripMetricsService);
//# sourceMappingURL=trip-metrics.service.js.map