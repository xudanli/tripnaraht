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
var GoogleCalendarIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const google_calendar_service_1 = require("./google-calendar.service");
const redis_service_1 = require("../redis/redis.service");
let GoogleCalendarIntegrationService = GoogleCalendarIntegrationService_1 = class GoogleCalendarIntegrationService {
    constructor(prisma, googleCalendarService, redisService) {
        this.prisma = prisma;
        this.googleCalendarService = googleCalendarService;
        this.redisService = redisService;
        this.logger = new common_1.Logger(GoogleCalendarIntegrationService_1.name);
        if (!googleCalendarService) {
            this.logger.warn('GoogleCalendarService not available, Google Calendar integration will be disabled');
        }
    }
    async syncTripToCalendar(tripId, userId, calendarId) {
        var _a, _b, _c, _d, _e;
        if (!this.googleCalendarService) {
            this.logger.warn('GoogleCalendarService not available, skipping sync');
            return {
                success: false,
                eventsCreated: 0,
                eventsUpdated: 0,
                eventsDeleted: 0,
                errors: [{ itemId: tripId, error: 'GoogleCalendarService not available' }],
            };
        }
        try {
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
                include: {
                    TripDay: {
                        orderBy: { date: 'asc' },
                        include: {
                            ItineraryItem: {
                                orderBy: { startTime: 'asc' },
                                include: {
                                    Place: {
                                        select: {
                                            id: true,
                                            nameCN: true,
                                            nameEN: true,
                                            category: true,
                                            address: true,
                                            description: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });
            if (!trip) {
                throw new Error(`Trip ${tripId} not found`);
            }
            let targetCalendarId = calendarId;
            if (!targetCalendarId) {
                const calendars = await this.googleCalendarService.listCalendars();
                const primaryCalendar = ((_a = calendars.calendars) === null || _a === void 0 ? void 0 : _a.find((cal) => cal.primary)) || ((_b = calendars.calendars) === null || _b === void 0 ? void 0 : _b[0]);
                targetCalendarId = (primaryCalendar === null || primaryCalendar === void 0 ? void 0 : primaryCalendar.id) || 'primary';
            }
            const result = {
                success: true,
                eventsCreated: 0,
                eventsUpdated: 0,
                eventsDeleted: 0,
                errors: [],
            };
            const existingMappings = await this.getEventMappings(tripId);
            for (const day of trip.TripDay) {
                for (const item of day.ItineraryItem) {
                    try {
                        const existingMapping = existingMappings.find(m => m.itineraryItemId === item.id);
                        if (existingMapping) {
                            await this.googleCalendarService.updateEvent({
                                calendarId: existingMapping.calendarId,
                                eventId: existingMapping.eventId,
                                summary: this.getEventSummary(item, trip),
                                start: item.startTime ? {
                                    dateTime: item.startTime.toISOString(),
                                } : {
                                    date: day.date.toISOString().split('T')[0],
                                },
                                end: item.endTime ? {
                                    dateTime: item.endTime.toISOString(),
                                } : {
                                    date: day.date.toISOString().split('T')[0],
                                },
                                description: this.getEventDescription(item, trip),
                                location: ((_c = item.Place) === null || _c === void 0 ? void 0 : _c.address) || undefined,
                            });
                            await this.updateEventMapping(tripId, item.id, existingMapping.calendarId, existingMapping.eventId);
                            result.eventsUpdated++;
                        }
                        else {
                            const event = await this.googleCalendarService.createEvent({
                                calendarId: targetCalendarId,
                                summary: this.getEventSummary(item, trip),
                                start: item.startTime ? {
                                    dateTime: item.startTime.toISOString(),
                                } : {
                                    date: day.date.toISOString().split('T')[0],
                                },
                                end: item.endTime ? {
                                    dateTime: item.endTime.toISOString(),
                                } : {
                                    date: day.date.toISOString().split('T')[0],
                                },
                                description: this.getEventDescription(item, trip),
                                location: ((_d = item.Place) === null || _d === void 0 ? void 0 : _d.address) || undefined,
                            });
                            const eventId = event.id || event.eventId || ((_e = event.event) === null || _e === void 0 ? void 0 : _e.id);
                            if (eventId) {
                                await this.saveEventMapping(tripId, item.id, targetCalendarId, eventId);
                                result.eventsCreated++;
                            }
                            else {
                                this.logger.warn(`Failed to get event ID for item ${item.id}`);
                                result.errors.push({ itemId: item.id, error: 'Failed to get event ID' });
                            }
                        }
                    }
                    catch (error) {
                        this.logger.error(`Failed to sync item ${item.id}:`, error);
                        result.errors.push({ itemId: item.id, error: error.message });
                        result.success = false;
                    }
                }
            }
            const currentItemIds = new Set(trip.TripDay.flatMap(day => day.ItineraryItem.map(item => item.id)));
            const mappingsToDelete = existingMappings.filter(m => !currentItemIds.has(m.itineraryItemId));
            for (const mapping of mappingsToDelete) {
                try {
                    await this.googleCalendarService.deleteEvent({
                        calendarId: mapping.calendarId,
                        eventId: mapping.eventId,
                    });
                    await this.deleteEventMapping(tripId, mapping.itineraryItemId);
                    result.eventsDeleted++;
                }
                catch (error) {
                    this.logger.error(`Failed to delete event ${mapping.eventId}:`, error);
                    result.errors.push({ itemId: mapping.itineraryItemId, error: error.message });
                }
            }
            return result;
        }
        catch (error) {
            this.logger.error(`Failed to sync trip ${tripId}:`, error);
            return {
                success: false,
                eventsCreated: 0,
                eventsUpdated: 0,
                eventsDeleted: 0,
                errors: [{ itemId: tripId, error: error.message }],
            };
        }
    }
    async deleteTripEvents(tripId) {
        if (!this.googleCalendarService) {
            this.logger.warn('GoogleCalendarService not available, skipping delete');
            return {
                success: false,
                eventsCreated: 0,
                eventsUpdated: 0,
                eventsDeleted: 0,
                errors: [{ itemId: tripId, error: 'GoogleCalendarService not available' }],
            };
        }
        try {
            const mappings = await this.getEventMappings(tripId);
            const result = {
                success: true,
                eventsCreated: 0,
                eventsUpdated: 0,
                eventsDeleted: 0,
                errors: [],
            };
            for (const mapping of mappings) {
                try {
                    await this.googleCalendarService.deleteEvent({
                        calendarId: mapping.calendarId,
                        eventId: mapping.eventId,
                    });
                    await this.deleteEventMapping(tripId, mapping.itineraryItemId);
                    result.eventsDeleted++;
                }
                catch (error) {
                    this.logger.error(`Failed to delete event ${mapping.eventId}:`, error);
                    result.errors.push({ itemId: mapping.itineraryItemId, error: error.message });
                    result.success = false;
                }
            }
            return result;
        }
        catch (error) {
            this.logger.error(`Failed to delete trip events ${tripId}:`, error);
            return {
                success: false,
                eventsCreated: 0,
                eventsUpdated: 0,
                eventsDeleted: 0,
                errors: [{ itemId: tripId, error: error.message }],
            };
        }
    }
    async checkUserAvailability(timeMin, timeMax, durationMinutes = 60, calendarId) {
        if (!this.googleCalendarService) {
            this.logger.warn('GoogleCalendarService not available, skipping availability check');
            return { freeSlots: [] };
        }
        try {
            return await this.googleCalendarService.findFreeSlots({
                calendarId,
                timeMin,
                timeMax,
                durationMinutes,
            });
        }
        catch (error) {
            this.logger.error('Failed to check availability:', error);
            return { freeSlots: [], error: error.message };
        }
    }
    getEventSummary(item, trip) {
        var _a, _b;
        const placeName = ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || '行程项';
        const tripName = trip.name ? ` - ${trip.name}` : '';
        return `${placeName}${tripName}`;
    }
    getEventDescription(item, trip) {
        const parts = [];
        if (trip.name) {
            parts.push(`行程: ${trip.name}`);
        }
        if (item.Place) {
            const placeName = item.Place.nameCN || item.Place.nameEN;
            parts.push(`地点: ${placeName}`);
            if (item.Place.description) {
                parts.push(`\n${item.Place.description}`);
            }
        }
        if (item.note) {
            parts.push(`备注: ${item.note}`);
        }
        parts.push(`\n来源: TripNara`);
        return parts.join('\n');
    }
    async getEventMappings(tripId) {
        if (this.redisService) {
            try {
                const key = `google-calendar:mapping:${tripId}`;
                const cached = await this.redisService.get(key);
                if (cached) {
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached mappings:', error);
            }
        }
        return [];
    }
    async saveEventMapping(tripId, itineraryItemId, calendarId, eventId) {
        if (this.redisService) {
            try {
                const key = `google-calendar:mapping:${tripId}`;
                const mappings = await this.getEventMappings(tripId);
                mappings.push({
                    tripId,
                    itineraryItemId,
                    calendarId,
                    eventId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                await this.redisService.set(key, JSON.stringify(mappings), 86400 * 365);
            }
            catch (error) {
                this.logger.warn('Failed to save mapping:', error);
            }
        }
    }
    async updateEventMapping(tripId, itineraryItemId, calendarId, eventId) {
        if (this.redisService) {
            try {
                const key = `google-calendar:mapping:${tripId}`;
                const mappings = await this.getEventMappings(tripId);
                const index = mappings.findIndex(m => m.itineraryItemId === itineraryItemId);
                if (index >= 0) {
                    mappings[index] = {
                        ...mappings[index],
                        calendarId,
                        eventId,
                        updatedAt: new Date(),
                    };
                    await this.redisService.set(key, JSON.stringify(mappings), 86400 * 365);
                }
            }
            catch (error) {
                this.logger.warn('Failed to update mapping:', error);
            }
        }
    }
    async deleteEventMapping(tripId, itineraryItemId) {
        if (this.redisService) {
            try {
                const key = `google-calendar:mapping:${tripId}`;
                const mappings = await this.getEventMappings(tripId);
                const filtered = mappings.filter(m => m.itineraryItemId !== itineraryItemId);
                await this.redisService.set(key, JSON.stringify(filtered), 86400 * 365);
            }
            catch (error) {
                this.logger.warn('Failed to delete mapping:', error);
            }
        }
    }
};
exports.GoogleCalendarIntegrationService = GoogleCalendarIntegrationService;
exports.GoogleCalendarIntegrationService = GoogleCalendarIntegrationService = GoogleCalendarIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        google_calendar_service_1.GoogleCalendarService,
        redis_service_1.RedisService])
], GoogleCalendarIntegrationService);
//# sourceMappingURL=google-calendar-integration.service.js.map