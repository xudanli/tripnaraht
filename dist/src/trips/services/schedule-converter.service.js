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
exports.ScheduleConverterService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const luxon_1 = require("luxon");
const crypto_1 = require("crypto");
let ScheduleConverterService = class ScheduleConverterService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async saveScheduleToDatabase(tripId, tripDayId, schedule, dateISO) {
        await this.prisma.itineraryItem.deleteMany({
            where: { tripDayId },
        });
        const items = schedule.stops
            .filter(stop => stop.kind === 'POI')
            .map((stop, index) => {
            var _a;
            const date = luxon_1.DateTime.fromISO(dateISO);
            const startTime = date.startOf('day').plus({ minutes: stop.startMin }).toJSDate();
            const endTime = date.startOf('day').plus({ minutes: stop.endMin }).toJSDate();
            return {
                id: (0, crypto_1.randomUUID)(),
                tripDayId,
                placeId: stop.id ? parseInt(stop.id.replace('poi-', ''), 10) : null,
                type: this.mapStopKindToItemType(stop.kind),
                startTime,
                endTime,
                note: ((_a = stop.notes) === null || _a === void 0 ? void 0 : _a.join('; ')) || null,
                order: index + 1,
            };
        });
        if (items.length > 0) {
            await this.prisma.itineraryItem.createMany({
                data: items,
            });
        }
        return items;
    }
    async loadScheduleFromDatabase(tripDayId, dateISO) {
        const items = await this.prisma.itineraryItem.findMany({
            where: { tripDayId },
            include: {
                Place: true,
            },
            orderBy: { startTime: 'asc' },
        });
        if (items.length === 0) {
            return null;
        }
        const date = luxon_1.DateTime.fromISO(dateISO);
        const stops = [];
        let totalTravelMin = 0;
        let totalWalkMin = 0;
        let totalTransfers = 0;
        let totalQueueMin = 0;
        let overtimeMin = 0;
        for (const item of items) {
            const startTime = luxon_1.DateTime.fromJSDate(item.startTime);
            const endTime = luxon_1.DateTime.fromJSDate(item.endTime);
            const startMin = startTime.diff(date.startOf('day'), 'minutes').minutes;
            const endMin = endTime.diff(date.startOf('day'), 'minutes').minutes;
            if (item.Place) {
                stops.push({
                    kind: 'POI',
                    id: `poi-${item.Place.id}`,
                    name: item.Place.nameEN || item.Place.nameCN,
                    startMin,
                    endMin,
                    lat: this.extractLat(item.Place),
                    lng: this.extractLng(item.Place),
                    notes: item.note ? [item.note] : [],
                });
                if (stops.length > 1) {
                    const prevStop = stops[stops.length - 2];
                    const transitTime = Math.max(0, startMin - prevStop.endMin);
                    totalTravelMin += transitTime;
                }
            }
        }
        return {
            stops,
            metrics: {
                totalTravelMin,
                totalWalkMin,
                totalTransfers,
                totalQueueMin,
                overtimeMin,
                hpEnd: 100,
            },
        };
    }
    mapStopKindToItemType(kind) {
        switch (kind) {
            case 'POI':
                return 'ACTIVITY';
            case 'REST':
                return 'REST';
            case 'MEAL':
                return 'MEAL_ANCHOR';
            default:
                return 'ACTIVITY';
        }
    }
    extractLat(place) {
        const location = place.location;
        if (!location)
            return 0;
        const coords = this.extractCoordinates(location);
        return (coords === null || coords === void 0 ? void 0 : coords.lat) || 0;
    }
    extractLng(place) {
        const location = place.location;
        if (!location)
            return 0;
        const coords = this.extractCoordinates(location);
        return (coords === null || coords === void 0 ? void 0 : coords.lng) || 0;
    }
    extractCoordinates(location) {
        if (!location)
            return null;
        if (typeof location === 'string') {
            const match = location.match(/POINT\(([^)]+)\)/);
            if (match) {
                const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
                return { lat, lng };
            }
        }
        if (typeof location === 'object') {
            if (location.coordinates) {
                return { lng: location.coordinates[0], lat: location.coordinates[1] };
            }
            if (location.lat && location.lng) {
                return { lat: location.lat, lng: location.lng };
            }
        }
        return null;
    }
};
exports.ScheduleConverterService = ScheduleConverterService;
exports.ScheduleConverterService = ScheduleConverterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ScheduleConverterService);
//# sourceMappingURL=schedule-converter.service.js.map