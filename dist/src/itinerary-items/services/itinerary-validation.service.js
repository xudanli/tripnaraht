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
var ItineraryValidationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItineraryValidationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const validation_interface_1 = require("../interfaces/validation.interface");
const time_overlap_validator_1 = require("../validators/time-overlap.validator");
const travel_time_validator_1 = require("../validators/travel-time.validator");
const buffer_time_validator_1 = require("../validators/buffer-time.validator");
const luxon_1 = require("luxon");
let ItineraryValidationService = ItineraryValidationService_1 = class ItineraryValidationService {
    constructor(prisma, timeOverlapValidator, travelTimeValidator, bufferTimeValidator) {
        this.prisma = prisma;
        this.timeOverlapValidator = timeOverlapValidator;
        this.travelTimeValidator = travelTimeValidator;
        this.bufferTimeValidator = bufferTimeValidator;
        this.logger = new common_1.Logger(ItineraryValidationService_1.name);
        this.validators = [
            this.timeOverlapValidator,
            this.travelTimeValidator,
            this.bufferTimeValidator,
        ];
    }
    async validateCreate(dto) {
        var _a, _b, _c, _d;
        try {
            const context = await this.buildContext(dto);
            const results = [];
            let travelInfo;
            for (const validator of this.validators) {
                try {
                    const result = await validator.validate(context);
                    if (result) {
                        results.push(result);
                        if ((_a = result.details) === null || _a === void 0 ? void 0 : _a.distance) {
                            travelInfo = {
                                fromPlace: (_b = result.details.fromPlace) === null || _b === void 0 ? void 0 : _b.name,
                                toPlace: (_c = result.details.toPlace) === null || _c === void 0 ? void 0 : _c.name,
                                straightDistance: result.details.distance.straight,
                                roadDistance: result.details.distance.road,
                                estimatedDuration: ((_d = result.details.travelTime) === null || _d === void 0 ? void 0 : _d.estimated) || 0,
                                recommendedTransport: result.details.recommendedTransport,
                                availableTime: result.details.availableTime || 0,
                            };
                        }
                    }
                }
                catch (error) {
                    this.logger.error(`校验器 ${validator.getCode()} 执行失败:`, error);
                }
            }
            return this.aggregateResults(results, travelInfo);
        }
        catch (error) {
            this.logger.error('校验失败:', error);
            return {
                canProceed: false,
                requiresConfirmation: false,
                errors: [{
                        valid: false,
                        severity: validation_interface_1.ValidationSeverity.ERROR,
                        code: 'NOT_FOUND',
                        message: error instanceof Error ? error.message : '校验过程发生错误',
                        details: {},
                    }],
                warnings: [],
                infos: [],
            };
        }
    }
    async validateUpdate(itemId, dto, options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const { detectCascadeImpact = true } = options || {};
        const existingItem = await this.prisma.itineraryItem.findUnique({
            where: { id: itemId },
            include: {
                Place: true,
                TripDay: {
                    include: {
                        Trip: true,
                        ItineraryItem: {
                            include: { Place: true },
                            orderBy: { startTime: 'asc' },
                        },
                    },
                },
            },
        });
        if (!existingItem) {
            return {
                canProceed: false,
                requiresConfirmation: false,
                errors: [{
                        valid: false,
                        severity: validation_interface_1.ValidationSeverity.ERROR,
                        code: 'NOT_FOUND',
                        message: '找不到指定的行程项',
                        details: { itemId },
                    }],
                warnings: [],
                infos: [],
            };
        }
        let targetTripDayId = dto.tripDayId;
        let targetTripDay = existingItem.TripDay;
        if (dto.startTime && !targetTripDayId) {
            const startDate = luxon_1.DateTime.fromJSDate(new Date(dto.startTime), { zone: 'utc' });
            const dayStart = startDate.startOf('day').toJSDate();
            const dayEnd = startDate.endOf('day').toJSDate();
            const tripId = (_a = existingItem.TripDay.Trip) === null || _a === void 0 ? void 0 : _a.id;
            if (tripId) {
                const newTripDay = await this.prisma.tripDay.findFirst({
                    where: {
                        tripId,
                        date: {
                            gte: dayStart,
                            lte: dayEnd,
                        },
                    },
                    include: {
                        Trip: true,
                        ItineraryItem: {
                            include: { Place: true },
                            orderBy: { startTime: 'asc' },
                        },
                    },
                });
                if (newTripDay) {
                    targetTripDayId = newTripDay.id;
                    targetTripDay = newTripDay;
                }
            }
        }
        else if (targetTripDayId && targetTripDayId !== existingItem.tripDayId) {
            const newTripDay = await this.prisma.tripDay.findUnique({
                where: { id: targetTripDayId },
                include: {
                    Trip: true,
                    ItineraryItem: {
                        include: { Place: true },
                        orderBy: { startTime: 'asc' },
                    },
                },
            });
            if (newTripDay) {
                targetTripDay = newTripDay;
            }
        }
        const mergedDto = {
            tripDayId: targetTripDayId !== null && targetTripDayId !== void 0 ? targetTripDayId : existingItem.tripDayId,
            placeId: (_c = (_b = dto.placeId) !== null && _b !== void 0 ? _b : existingItem.placeId) !== null && _c !== void 0 ? _c : undefined,
            type: ((_d = dto.type) !== null && _d !== void 0 ? _d : existingItem.type),
            startTime: (_e = dto.startTime) !== null && _e !== void 0 ? _e : existingItem.startTime.toISOString(),
            endTime: (_f = dto.endTime) !== null && _f !== void 0 ? _f : existingItem.endTime.toISOString(),
        };
        const context = await this.buildContextForUpdate(mergedDto, itemId);
        const results = [];
        let travelInfo;
        for (const validator of this.validators) {
            try {
                const result = await validator.validate(context);
                if (result) {
                    results.push(result);
                    if ((_g = result.details) === null || _g === void 0 ? void 0 : _g.distance) {
                        travelInfo = {
                            fromPlace: (_h = result.details.fromPlace) === null || _h === void 0 ? void 0 : _h.name,
                            toPlace: (_j = result.details.toPlace) === null || _j === void 0 ? void 0 : _j.name,
                            straightDistance: result.details.distance.straight,
                            roadDistance: result.details.distance.road,
                            estimatedDuration: ((_k = result.details.travelTime) === null || _k === void 0 ? void 0 : _k.estimated) || 0,
                            recommendedTransport: result.details.recommendedTransport,
                            availableTime: result.details.availableTime || 0,
                        };
                    }
                }
            }
            catch (error) {
                this.logger.error(`校验器 ${validator.getCode()} 执行失败:`, error);
            }
        }
        const basicResult = this.aggregateResults(results, travelInfo);
        const cascadeImpact = detectCascadeImpact
            ? this.detectCascadeImpact(existingItem, dto, targetTripDay)
            : undefined;
        return {
            ...basicResult,
            cascadeImpact,
        };
    }
    async validateBatch(tripId, dates) {
        var _a;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    where: (dates === null || dates === void 0 ? void 0 : dates.length) ? {
                        date: {
                            in: dates.map(d => new Date(d)),
                        },
                    } : undefined,
                    include: {
                        ItineraryItem: {
                            include: { Place: true },
                            orderBy: { startTime: 'asc' },
                        },
                    },
                    orderBy: { date: 'asc' },
                },
            },
        });
        if (!trip) {
            return {
                valid: false,
                tripId,
                errors: [],
                warnings: [],
                summary: { errorCount: 0, warningCount: 0, infoCount: 0 },
            };
        }
        const allErrors = [];
        const allWarnings = [];
        for (const day of trip.TripDay) {
            const items = day.ItineraryItem;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const prevItem = i > 0 ? items[i - 1] : undefined;
                const context = {
                    tripDayId: day.id,
                    tripDayDate: day.date,
                    newItem: {
                        placeId: (_a = item.placeId) !== null && _a !== void 0 ? _a : undefined,
                        startTime: item.startTime,
                        endTime: item.endTime,
                        type: item.type,
                    },
                    newItemPlace: item.Place ? {
                        id: item.Place.id,
                        name: item.Place.nameCN || item.Place.nameEN || '',
                        coordinates: this.extractCoordinates(item.Place),
                        metadata: item.Place.metadata,
                    } : undefined,
                    existingItems: items.filter(it => it.id !== item.id).map(it => this.toContextItem(it)),
                    previousItem: prevItem ? this.toContextItem(prevItem) : undefined,
                };
                for (const validator of this.validators) {
                    try {
                        const result = await validator.validate(context);
                        if (result && !result.valid) {
                            const batchItem = {
                                day: luxon_1.DateTime.fromJSDate(day.date).toISODate() || '',
                                itemIds: [item.id],
                                type: result.code,
                                message: result.message,
                                severity: result.severity,
                            };
                            if (result.severity === validation_interface_1.ValidationSeverity.ERROR) {
                                allErrors.push(batchItem);
                            }
                            else if (result.severity === validation_interface_1.ValidationSeverity.WARNING) {
                                allWarnings.push(batchItem);
                            }
                        }
                    }
                    catch (error) {
                        this.logger.error(`批量校验失败: ${error}`);
                    }
                }
            }
        }
        return {
            valid: allErrors.length === 0,
            tripId,
            errors: allErrors,
            warnings: allWarnings,
            summary: {
                errorCount: allErrors.length,
                warningCount: allWarnings.length,
                infoCount: 0,
            },
        };
    }
    async buildContext(dto) {
        const tripDay = await this.prisma.tripDay.findUnique({
            where: { id: dto.tripDayId },
            include: {
                ItineraryItem: {
                    include: { Place: true },
                    orderBy: { startTime: 'asc' },
                },
            },
        });
        if (!tripDay) {
            throw new Error(`TripDay ${dto.tripDayId} 不存在`);
        }
        let newItemPlace;
        if (dto.placeId) {
            const place = await this.prisma.place.findUnique({
                where: { id: dto.placeId },
            });
            if (place) {
                newItemPlace = {
                    id: place.id,
                    name: place.nameCN || place.nameEN || '',
                    coordinates: this.extractCoordinates(place),
                    metadata: place.metadata,
                };
            }
        }
        const existingItems = tripDay.ItineraryItem.map(item => this.toContextItem(item));
        const newStart = new Date(dto.startTime);
        const newEnd = new Date(dto.endTime);
        let previousItem;
        let nextItem;
        for (let i = 0; i < existingItems.length; i++) {
            if (existingItems[i].endTime <= newStart) {
                previousItem = existingItems[i];
            }
            if (existingItems[i].startTime >= newEnd && !nextItem) {
                nextItem = existingItems[i];
            }
        }
        return {
            tripDayId: dto.tripDayId,
            tripDayDate: tripDay.date,
            newItem: {
                placeId: dto.placeId,
                startTime: new Date(dto.startTime),
                endTime: new Date(dto.endTime),
                type: dto.type,
            },
            newItemPlace,
            existingItems,
            previousItem,
            nextItem,
        };
    }
    async buildContextForUpdate(dto, excludeItemId) {
        const context = await this.buildContext(dto);
        context.existingItems = context.existingItems.filter(item => item.id !== excludeItemId);
        const newStart = new Date(dto.startTime);
        const newEnd = new Date(dto.endTime);
        context.previousItem = undefined;
        context.nextItem = undefined;
        for (const item of context.existingItems) {
            if (item.endTime <= newStart) {
                context.previousItem = item;
            }
            if (item.startTime >= newEnd && !context.nextItem) {
                context.nextItem = item;
            }
        }
        return context;
    }
    toContextItem(item) {
        var _a;
        return {
            id: item.id,
            placeId: (_a = item.placeId) !== null && _a !== void 0 ? _a : undefined,
            startTime: item.startTime,
            endTime: item.endTime,
            type: item.type,
            place: item.Place ? {
                id: item.Place.id,
                name: item.Place.nameCN || item.Place.nameEN || '',
                coordinates: this.extractCoordinates(item.Place),
            } : undefined,
        };
    }
    aggregateResults(results, travelInfo) {
        const errors = results.filter(r => r.severity === validation_interface_1.ValidationSeverity.ERROR);
        const warnings = results.filter(r => r.severity === validation_interface_1.ValidationSeverity.WARNING);
        const infos = results.filter(r => r.severity === validation_interface_1.ValidationSeverity.INFO);
        return {
            canProceed: errors.length === 0,
            requiresConfirmation: warnings.length > 0,
            errors,
            warnings,
            infos,
            travelInfo,
        };
    }
    detectCascadeImpact(existingItem, dto, tripDay) {
        var _a, _b;
        if (!dto.startTime && !dto.endTime) {
            return undefined;
        }
        const items = tripDay.ItineraryItem;
        const currentIndex = items.findIndex((i) => i.id === existingItem.id);
        if (currentIndex < 0 || currentIndex >= items.length - 1) {
            return undefined;
        }
        const newStartTime = dto.startTime ? new Date(dto.startTime) : existingItem.startTime;
        const newEndTime = dto.endTime
            ? new Date(dto.endTime)
            : existingItem.endTime;
        const affectedItems = [];
        let currentEndTime = luxon_1.DateTime.fromJSDate(newEndTime);
        let prevLocation = this.extractCoordinates(existingItem.Place);
        for (let i = currentIndex + 1; i < items.length; i++) {
            const nextItem = items[i];
            const nextStart = luxon_1.DateTime.fromJSDate(nextItem.startTime);
            const nextEnd = luxon_1.DateTime.fromJSDate(nextItem.endTime);
            const duration = nextEnd.diff(nextStart, 'minutes').minutes;
            const nextLocation = this.extractCoordinates(nextItem.Place);
            let travelTimeMinutes = 15;
            if (prevLocation && nextLocation) {
                const distance = this.calculateHaversineDistance(prevLocation.lat, prevLocation.lng, nextLocation.lat, nextLocation.lng);
                travelTimeMinutes = this.estimateTravelTime(distance);
            }
            const suggestedStart = currentEndTime.plus({ minutes: travelTimeMinutes });
            if (suggestedStart > nextStart) {
                const suggestedEnd = suggestedStart.plus({ minutes: duration });
                const delayMinutes = Math.ceil(suggestedStart.diff(nextStart, 'minutes').minutes);
                affectedItems.push({
                    id: nextItem.id,
                    name: ((_a = nextItem.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = nextItem.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || '未知活动',
                    originalTime: `${nextStart.toFormat('HH:mm')}-${nextEnd.toFormat('HH:mm')}`,
                    suggestedTime: `${suggestedStart.toFormat('HH:mm')}-${suggestedEnd.toFormat('HH:mm')}`,
                    delayMinutes,
                    originalTimeRange: {
                        start: nextStart.toFormat('HH:mm'),
                        end: nextEnd.toFormat('HH:mm'),
                    },
                    adjustedTimeRange: {
                        start: suggestedStart.toFormat('HH:mm'),
                        end: suggestedEnd.toFormat('HH:mm'),
                    },
                    timeDelta: this.formatTimeDelta(delayMinutes),
                });
                currentEndTime = suggestedEnd;
                prevLocation = nextLocation;
            }
            else {
                currentEndTime = nextEnd;
                prevLocation = nextLocation;
            }
        }
        if (affectedItems.length === 0) {
            return undefined;
        }
        const adjustmentSummary = affectedItems.length === 1
            ? `「${affectedItems[0].name}」将顺延${this.formatTimeDelta(affectedItems[0].delayMinutes)}`
            : `${affectedItems.length}个活动将顺延，最大延迟${this.formatTimeDelta(Math.max(...affectedItems.map(i => i.delayMinutes)))}`;
        return {
            affectedCount: affectedItems.length,
            affectedItems,
            autoAdjusted: false,
            autoAdjust: true,
            adjustmentSummary,
        };
    }
    estimateTravelTime(distanceKm) {
        const bufferMinutes = 15;
        if (distanceKm < 2) {
            return Math.ceil(distanceKm * 12) + bufferMinutes;
        }
        else if (distanceKm < 50) {
            return Math.ceil(distanceKm * 2) + bufferMinutes;
        }
        else {
            return Math.ceil(distanceKm * 1) + bufferMinutes;
        }
    }
    calculateHaversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(deg) {
        return deg * (Math.PI / 180);
    }
    formatTimeDelta(minutes) {
        if (minutes < 60) {
            return `+${minutes}分钟`;
        }
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (mins === 0) {
            return `+${hours}小时`;
        }
        return `+${hours}小时${mins}分钟`;
    }
    extractCoordinates(place) {
        if (!place)
            return undefined;
        const metadata = place.metadata;
        if ((metadata === null || metadata === void 0 ? void 0 : metadata.lat) && (metadata === null || metadata === void 0 ? void 0 : metadata.lng)) {
            return { lat: metadata.lat, lng: metadata.lng };
        }
        if ((metadata === null || metadata === void 0 ? void 0 : metadata.coordinates) && Array.isArray(metadata.coordinates)) {
            return { lat: metadata.coordinates[1], lng: metadata.coordinates[0] };
        }
        if (place.location) {
            if (typeof place.location === 'string') {
                const match = place.location.match(/POINT\(([^)]+)\)/);
                if (match) {
                    const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
                    return { lat, lng };
                }
            }
        }
        return undefined;
    }
};
exports.ItineraryValidationService = ItineraryValidationService;
exports.ItineraryValidationService = ItineraryValidationService = ItineraryValidationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        time_overlap_validator_1.TimeOverlapValidator,
        travel_time_validator_1.TravelTimeValidator,
        buffer_time_validator_1.BufferTimeValidator])
], ItineraryValidationService);
//# sourceMappingURL=itinerary-validation.service.js.map