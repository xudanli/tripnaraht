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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItineraryItemsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const create_itinerary_item_dto_1 = require("./dto/create-itinerary-item.dto");
const opening_hours_util_1 = require("../common/utils/opening-hours.util");
const luxon_1 = require("luxon");
const crypto_1 = require("crypto");
const smart_routes_service_1 = require("../transport/services/smart-routes.service");
const places_service_1 = require("../places/places.service");
const google_maps_direct_service_1 = require("../mcp/google-maps-direct.service");
const search_nearby_poi_dto_1 = require("./dto/search-nearby-poi.dto");
const client_1 = require("@prisma/client");
let ItineraryItemsService = class ItineraryItemsService {
    constructor(prisma, smartRoutesService, placesService, googleMapsService) {
        this.prisma = prisma;
        this.smartRoutesService = smartRoutesService;
        this.placesService = placesService;
        this.googleMapsService = googleMapsService;
    }
    async create(dto) {
        const start = new Date(dto.startTime);
        const end = new Date(dto.endTime);
        if (isNaN(start.getTime())) {
            throw new common_1.BadRequestException('无效的开始时间');
        }
        if (isNaN(end.getTime())) {
            throw new common_1.BadRequestException('无效的结束时间');
        }
        if (start >= end) {
            throw new common_1.BadRequestException('结束时间必须晚于开始时间');
        }
        const tripDay = await this.prisma.tripDay.findUnique({
            where: { id: dto.tripDayId },
            include: { Trip: true }
        });
        if (!tripDay) {
            throw new common_1.NotFoundException(`找不到指定的行程日期 (ID: ${dto.tripDayId})`);
        }
        const tripDayDate = luxon_1.DateTime.fromJSDate(tripDay.date, { zone: 'utc' });
        const startDateTime = luxon_1.DateTime.fromJSDate(start, { zone: 'utc' });
        const dayStart = tripDayDate.startOf('day');
        const dayEnd = tripDayDate.plus({ days: 1, hours: 3 });
        if (startDateTime < dayStart || startDateTime >= dayEnd) {
            const expectedDate = tripDayDate.toFormat('yyyy-MM-dd');
            const actualDate = startDateTime.toFormat('yyyy-MM-dd HH:mm');
            throw new common_1.BadRequestException(`行程项开始时间 (${actualDate}) 与所属日期 (${expectedDate}) 不匹配。请检查日期或选择正确的行程日`);
        }
        if (dto.placeId && (dto.type === create_itinerary_item_dto_1.ItemType.ACTIVITY || dto.type === create_itinerary_item_dto_1.ItemType.MEAL_ANCHOR)) {
            const place = await this.prisma.place.findUnique({
                where: { id: dto.placeId },
                include: { City: true }
            });
            if (!place) {
                throw new common_1.NotFoundException(`找不到指定地点 (ID: ${dto.placeId})`);
            }
            const meta = place.metadata;
            const openingHours = meta === null || meta === void 0 ? void 0 : meta.openingHours;
            const timezone = (meta === null || meta === void 0 ? void 0 : meta.timezone) || 'Atlantic/Reykjavik';
            if (openingHours) {
                const hoursStr = opening_hours_util_1.OpeningHoursUtil.getHoursForDate(meta, start, timezone);
                if (hoursStr === 'Closed' || !hoursStr) {
                    const dateStr = luxon_1.DateTime.fromJSDate(start).setZone(timezone).toFormat('yyyy-MM-dd cccc', { locale: 'zh-CN' });
                    throw new common_1.BadRequestException(`${place.nameEN || place.nameCN} 在 ${dateStr} 不营业`);
                }
                const isOpenAtStart = opening_hours_util_1.OpeningHoursUtil.isOpenAt(hoursStr, start, timezone);
                if (!isOpenAtStart) {
                    const startTimeStr = luxon_1.DateTime.fromJSDate(start).setZone(timezone).toFormat('HH:mm');
                    const dateStr = luxon_1.DateTime.fromJSDate(start).setZone(timezone).toFormat('yyyy-MM-dd cccc', { locale: 'zh-CN' });
                    throw new common_1.BadRequestException(`时间冲突警告：${place.nameEN || place.nameCN} 在 ${dateStr} ${startTimeStr} 可能未营业 (营业时间: ${hoursStr})`);
                }
            }
        }
        if (dto.trailId) {
            const trail = await this.prisma.trail.findUnique({
                where: { id: dto.trailId },
            });
            if (!trail) {
                throw new common_1.NotFoundException(`找不到指定徒步路线 (ID: ${dto.trailId})`);
            }
            if (trail.estimatedDurationHours) {
                const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                const minDuration = trail.estimatedDurationHours * 0.8;
                if (durationHours < minDuration) {
                    throw new common_1.BadRequestException(`徒步路线预计耗时 ${trail.estimatedDurationHours} 小时，但行程时间仅 ${durationHours.toFixed(1)} 小时，可能不够`);
                }
            }
        }
        let finalType = dto.type;
        if (!finalType && dto.placeId) {
            const placeForType = await this.prisma.place.findUnique({
                where: { id: dto.placeId },
                select: { category: true, nameCN: true, nameEN: true, metadata: true },
            });
            if (placeForType) {
                finalType = this.inferItemType(placeForType);
            }
        }
        if (!finalType) {
            finalType = create_itinerary_item_dto_1.ItemType.ACTIVITY;
        }
        let orderValue = dto.order;
        if (orderValue === undefined || orderValue === null) {
            const maxOrderItem = await this.prisma.itineraryItem.findFirst({
                where: { tripDayId: dto.tripDayId },
                orderBy: { order: 'desc' },
                select: { order: true },
            });
            orderValue = (maxOrderItem === null || maxOrderItem === void 0 ? void 0 : maxOrderItem.order) !== null && (maxOrderItem === null || maxOrderItem === void 0 ? void 0 : maxOrderItem.order) !== undefined
                ? maxOrderItem.order + 1
                : 1;
        }
        const newItem = await this.prisma.itineraryItem.create({
            data: {
                id: (0, crypto_1.randomUUID)(),
                tripDayId: dto.tripDayId,
                placeId: dto.placeId,
                trailId: dto.trailId,
                type: finalType,
                startTime: start,
                endTime: end,
                note: dto.note,
                order: orderValue,
            },
            include: {
                Place: {
                    include: {
                        City: true,
                    },
                },
                Trail: {
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
                },
                TripDay: {
                    include: {
                        Trip: true,
                    },
                },
            },
        });
        this.calculateTravelInfoForItem(newItem.id, tripDay.Trip.id).catch(err => {
            console.warn('自动计算交通信息失败:', err.message);
        });
        return this.enrichItemWithCoordinates(newItem);
    }
    inferItemType(place) {
        const category = (place.category || '').toUpperCase();
        const nameCN = (place.nameCN || '').toLowerCase();
        const nameEN = (place.nameEN || '').toLowerCase();
        const name = `${nameCN} ${nameEN}`;
        const meta = place.metadata;
        const metaCategory = ((meta === null || meta === void 0 ? void 0 : meta.category) || '').toLowerCase();
        if (category === 'HOTEL') {
            return create_itinerary_item_dto_1.ItemType.REST;
        }
        if (category === 'RESTAURANT') {
            return create_itinerary_item_dto_1.ItemType.MEAL_ANCHOR;
        }
        if (category === 'TRANSIT_HUB') {
            return create_itinerary_item_dto_1.ItemType.TRANSIT;
        }
        if (name.includes('酒店') || name.includes('hotel') ||
            name.includes('旅馆') || name.includes('民宿') ||
            name.includes('套房') || name.includes('hostel') ||
            name.includes('resort') || name.includes('度假') ||
            name.includes('guesthouse') || name.includes('inn')) {
            return create_itinerary_item_dto_1.ItemType.REST;
        }
        if (name.includes('餐厅') || name.includes('restaurant') ||
            name.includes('饭店') || name.includes('cafe') ||
            name.includes('咖啡') || name.includes('bar') ||
            name.includes('酒吧') || name.includes('小吃') ||
            name.includes('food') || name.includes('bakery')) {
            return create_itinerary_item_dto_1.ItemType.MEAL_ANCHOR;
        }
        if (metaCategory.includes('hotel') || metaCategory.includes('lodging') ||
            metaCategory.includes('accommodation')) {
            return create_itinerary_item_dto_1.ItemType.REST;
        }
        if (metaCategory.includes('restaurant') || metaCategory.includes('food') ||
            metaCategory.includes('cafe') || metaCategory.includes('dining')) {
            return create_itinerary_item_dto_1.ItemType.MEAL_ANCHOR;
        }
        return create_itinerary_item_dto_1.ItemType.ACTIVITY;
    }
    async findAll() {
        const items = await this.prisma.itineraryItem.findMany({
            include: {
                Place: true,
                Trail: {
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
                },
                TripDay: {
                    include: {
                        Trip: true,
                    },
                },
            },
            orderBy: {
                startTime: 'asc',
            },
        });
        return Promise.all(items.map(item => this.enrichItemWithCoordinates(item)));
    }
    async findOne(id) {
        const item = await this.prisma.itineraryItem.findUnique({
            where: { id },
            include: {
                Place: {
                    include: {
                        City: true,
                    },
                },
                Trail: {
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
                },
                TripDay: {
                    include: {
                        Trip: true,
                        ItineraryItem: {
                            orderBy: {
                                startTime: 'asc',
                            },
                        },
                    },
                },
            },
        });
        if (!item) {
            return null;
        }
        return this.enrichItemWithCoordinates(item);
    }
    async findByTripDay(tripDayId) {
        const currentTripDay = await this.prisma.tripDay.findUnique({
            where: { id: tripDayId },
            include: { Trip: true },
        });
        if (!currentTripDay) {
            return [];
        }
        const todayItems = await this.prisma.itineraryItem.findMany({
            where: { tripDayId },
            include: {
                Place: true,
                Trail: {
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
                },
                TripDay: true,
            },
            orderBy: {
                startTime: 'asc',
            },
        });
        const checkoutItems = await this.findCheckoutItemsForDay(currentTripDay);
        const allItems = [...checkoutItems, ...todayItems];
        const enrichedItems = await Promise.all(allItems.map(item => this.enrichItemWithCoordinates(item)));
        return enrichedItems.map(item => this.addCrossDayInfo(item, currentTripDay.date));
    }
    async findCheckoutItemsForDay(currentTripDay) {
        const currentDate = luxon_1.DateTime.fromJSDate(currentTripDay.date, { zone: 'utc' });
        const currentDayStart = currentDate.startOf('day');
        const currentDayEnd = currentDate.endOf('day');
        const previousTripDay = await this.prisma.tripDay.findFirst({
            where: {
                tripId: currentTripDay.tripId,
                date: {
                    lt: currentTripDay.date,
                },
            },
            orderBy: {
                date: 'desc',
            },
        });
        if (!previousTripDay) {
            return [];
        }
        const checkoutItems = await this.prisma.itineraryItem.findMany({
            where: {
                AND: [
                    {
                        tripDayId: previousTripDay.id,
                        type: 'REST',
                    },
                    {
                        Place: {
                            OR: [
                                {
                                    category: 'HOTEL',
                                },
                                {
                                    nameCN: { contains: '酒店', mode: 'insensitive' },
                                },
                                {
                                    nameCN: { contains: '旅馆', mode: 'insensitive' },
                                },
                                {
                                    nameCN: { contains: '民宿', mode: 'insensitive' },
                                },
                                {
                                    nameEN: { contains: 'hotel', mode: 'insensitive' },
                                },
                                {
                                    nameEN: { contains: 'hostel', mode: 'insensitive' },
                                },
                                {
                                    nameEN: { contains: 'resort', mode: 'insensitive' },
                                },
                                {
                                    nameEN: { contains: 'guesthouse', mode: 'insensitive' },
                                },
                                {
                                    nameEN: { contains: 'inn', mode: 'insensitive' },
                                },
                            ],
                        },
                    },
                    {
                        OR: [
                            {
                                endTime: {
                                    gte: currentDayStart.toJSDate(),
                                    lte: currentDayEnd.plus({ hours: 14 }).toJSDate(),
                                },
                            },
                            {
                                AND: [
                                    { endTime: null },
                                    {
                                        startTime: {
                                            lt: currentDayStart.toJSDate(),
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            include: {
                Place: true,
                Trail: {
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
                },
                TripDay: true,
            },
        });
        return checkoutItems.map(item => ({
            ...item,
            _isCheckoutItem: true,
            _checkoutDate: currentTripDay.date,
        }));
    }
    addCrossDayInfo(item, tripDayDate) {
        const startDate = luxon_1.DateTime.fromJSDate(item.startTime, { zone: 'utc' });
        const endDate = luxon_1.DateTime.fromJSDate(item.endTime, { zone: 'utc' });
        const tripDate = luxon_1.DateTime.fromJSDate(tripDayDate, { zone: 'utc' });
        const startDay = startDate.startOf('day');
        const endDay = endDate.startOf('day');
        const crossDays = Math.floor(endDay.diff(startDay, 'days').days);
        const isCheckoutItem = item._isCheckoutItem === true;
        return {
            ...item,
            crossDayInfo: {
                isCrossDay: crossDays > 0,
                crossDays: crossDays,
                isCheckoutItem: isCheckoutItem,
                displayMode: isCheckoutItem ? 'checkout' : (crossDays > 0 ? 'checkin' : 'normal'),
                timeLabels: this.getTimeLabels(item.type, isCheckoutItem),
            },
        };
    }
    getTimeLabels(itemType, isCheckoutItem) {
        if (isCheckoutItem) {
            return { start: '退房时间', end: '' };
        }
        switch (itemType) {
            case 'REST':
                return { start: '入住时间', end: '退房时间' };
            case 'MEAL_ANCHOR':
            case 'MEAL_FLOATING':
                return { start: '用餐时间', end: '结束时间' };
            case 'TRANSIT':
                return { start: '出发时间', end: '到达时间' };
            default:
                return { start: '开始时间', end: '结束时间' };
        }
    }
    async update(id, updateDto, options) {
        var _a, _b, _c, _d;
        const { forceUpdate = false } = options || {};
        const cascadeMode = (_a = updateDto.cascadeMode) !== null && _a !== void 0 ? _a : 'auto';
        const existing = await this.prisma.itineraryItem.findUnique({
            where: { id },
            include: {
                Place: {
                    include: {
                        City: true,
                    },
                },
                TripDay: {
                    include: {
                        Trip: true,
                        ItineraryItem: {
                            include: {
                                Place: {
                                    include: {
                                        City: true,
                                    },
                                },
                            },
                            orderBy: {
                                startTime: 'asc',
                            },
                        },
                    },
                },
            },
        });
        if (!existing) {
            throw new common_1.NotFoundException(`找不到指定的行程项 (ID: ${id})`);
        }
        const start = updateDto.startTime ? new Date(updateDto.startTime) : existing.startTime;
        const end = updateDto.endTime ? new Date(updateDto.endTime) : existing.endTime;
        if (!start || !end) {
            throw new common_1.BadRequestException('开始时间和结束时间不能为空');
        }
        if (start >= end) {
            throw new common_1.BadRequestException('结束时间必须晚于开始时间');
        }
        let targetTripDayId = updateDto.tripDayId;
        if (targetTripDayId) {
            const tripDay = await this.prisma.tripDay.findUnique({
                where: { id: targetTripDayId },
            });
            if (!tripDay) {
                throw new common_1.NotFoundException(`找不到指定的行程日期 (ID: ${targetTripDayId})`);
            }
        }
        else if (updateDto.startTime) {
            const startDate = luxon_1.DateTime.fromJSDate(start, { zone: 'utc' });
            const dayStart = startDate.startOf('day').toJSDate();
            const dayEnd = startDate.endOf('day').toJSDate();
            const tripId = existing.TripDay.Trip.id;
            const targetTripDay = await this.prisma.tripDay.findFirst({
                where: {
                    tripId,
                    date: {
                        gte: dayStart,
                        lte: dayEnd,
                    },
                },
            });
            if (targetTripDay) {
                targetTripDayId = targetTripDay.id;
            }
            else {
                targetTripDayId = existing.tripDayId;
            }
        }
        else {
            targetTripDayId = existing.tripDayId;
        }
        if (updateDto.startTime || updateDto.endTime) {
            if (existing.placeId && existing.Place && start) {
                const meta = (_b = existing.Place) === null || _b === void 0 ? void 0 : _b.metadata;
                const timezone = (meta === null || meta === void 0 ? void 0 : meta.timezone) || 'Atlantic/Reykjavik';
                const hoursStr = opening_hours_util_1.OpeningHoursUtil.getHoursForDate(meta, start, timezone);
                if (hoursStr !== 'Closed' && hoursStr) {
                    const isOpen = opening_hours_util_1.OpeningHoursUtil.isOpenAt(hoursStr, start, timezone);
                    if (!isOpen) {
                        throw new common_1.BadRequestException(`时间冲突警告：${((_c = existing.Place) === null || _c === void 0 ? void 0 : _c.nameEN) || ((_d = existing.Place) === null || _d === void 0 ? void 0 : _d.nameCN)} 在指定时间可能未营业 (营业时间: ${hoursStr})`);
                    }
                }
            }
            if (updateDto.startTime && cascadeMode === 'auto' && this.smartRoutesService) {
                const targetTripDay = targetTripDayId !== existing.tripDayId
                    ? await this.prisma.tripDay.findUnique({
                        where: { id: targetTripDayId },
                        include: {
                            ItineraryItem: {
                                include: {
                                    Place: {
                                        include: {
                                            City: true,
                                        },
                                    },
                                },
                                orderBy: {
                                    startTime: 'asc',
                                },
                            },
                        },
                    })
                    : existing.TripDay;
                if (targetTripDay && start) {
                    await this.adjustSubsequentItemsBasedOnTravelTime(existing, start, targetTripDay, { skipTimeValidation: forceUpdate });
                }
            }
        }
        const updatedItem = await this.prisma.itineraryItem.update({
            where: { id },
            data: {
                ...(updateDto.placeId !== undefined && { placeId: updateDto.placeId }),
                ...(updateDto.trailId !== undefined && { trailId: updateDto.trailId }),
                ...(updateDto.type && { type: updateDto.type }),
                ...(updateDto.startTime && { startTime: new Date(updateDto.startTime) }),
                ...(updateDto.endTime && { endTime: new Date(updateDto.endTime) }),
                ...(updateDto.note !== undefined && { note: updateDto.note }),
                ...(targetTripDayId !== existing.tripDayId && { tripDayId: targetTripDayId }),
                ...(updateDto.estimatedCost !== undefined && { estimatedCost: updateDto.estimatedCost }),
                ...(updateDto.actualCost !== undefined && { actualCost: updateDto.actualCost }),
                ...(updateDto.currency !== undefined && { currency: updateDto.currency }),
                ...(updateDto.costCategory !== undefined && { costCategory: updateDto.costCategory }),
                ...(updateDto.costNote !== undefined && { costNote: updateDto.costNote }),
                ...(updateDto.isPaid !== undefined && { isPaid: updateDto.isPaid }),
                ...(updateDto.paidBy !== undefined && { paidBy: updateDto.paidBy }),
            },
            include: {
                Place: {
                    include: {
                        City: true,
                    },
                },
                Trail: {
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
                },
                TripDay: true,
            },
        });
        return this.enrichItemWithCoordinates(updatedItem);
    }
    async adjustSubsequentItemsBasedOnTravelTime(currentItem, newStartTime, tripDay, options) {
        const { skipTimeValidation = false } = options || {};
        if (!tripDay || !tripDay.ItineraryItem) {
            return;
        }
        const items = tripDay.ItineraryItem;
        const currentIndex = items.findIndex((item) => item.id === currentItem.id);
        if (currentIndex < 0) {
            return;
        }
        let fromLocation = null;
        if (currentIndex > 0) {
            const prevItem = items[currentIndex - 1];
            fromLocation = this.extractPlaceCoordinates(prevItem.Place);
            if (!fromLocation && currentIndex === 1) {
            }
        }
        else {
        }
        const toLocation = this.extractPlaceCoordinates(currentItem.Place);
        if (fromLocation && toLocation && this.smartRoutesService) {
            try {
                const distance = this.calculateHaversineDistance(fromLocation.lat, fromLocation.lng, toLocation.lat, toLocation.lng);
                const travelMode = distance < 2 ? 'WALKING' :
                    distance < 50 ? 'DRIVING' :
                        'TRANSIT';
                const routes = await this.smartRoutesService.getRoutes(fromLocation.lat, fromLocation.lng, toLocation.lat, toLocation.lng, travelMode);
                if (routes.length > 0) {
                    const travelTimeMinutes = routes[0].durationMinutes;
                    let prevEndTime;
                    if (currentIndex > 0) {
                        const prevItem = items[currentIndex - 1];
                        prevEndTime = prevItem.endTime || new Date(prevItem.startTime.getTime() + 2 * 60 * 60 * 1000);
                    }
                    else {
                        const dayStart = luxon_1.DateTime.fromJSDate(tripDay.date).set({ hour: 9, minute: 0 }).toJSDate();
                        prevEndTime = dayStart;
                    }
                    const bufferMinutes = 15;
                    const calculatedStartTime = luxon_1.DateTime.fromJSDate(prevEndTime)
                        .plus({ minutes: travelTimeMinutes + bufferMinutes })
                        .toJSDate();
                    const newStart = luxon_1.DateTime.fromJSDate(newStartTime);
                    const calculatedStart = luxon_1.DateTime.fromJSDate(calculatedStartTime);
                    if (newStart < calculatedStart) {
                        const diffMinutes = calculatedStart.diff(newStart, 'minutes').minutes;
                        if (diffMinutes > 30) {
                            if (skipTimeValidation) {
                                console.warn(`[时间偏差警告] 用户已确认。实际距离 ${distance.toFixed(1)}km，` +
                                    `交通方式 ${travelMode}，预计需要 ${travelTimeMinutes} 分钟，` +
                                    `建议时间 ${calculatedStart.toFormat('HH:mm')}，用户选择 ${newStart.toFormat('HH:mm')}`);
                            }
                            else {
                                throw new common_1.BadRequestException(`时间可能不合理：根据实际距离（${distance.toFixed(1)}km）和交通方式（${travelMode}），预计需要 ${travelTimeMinutes} 分钟，建议开始时间不早于 ${calculatedStart.toFormat('HH:mm')}`);
                            }
                        }
                    }
                    let currentEndTime = luxon_1.DateTime.fromJSDate(newStartTime);
                    if (currentItem.endTime) {
                        const duration = luxon_1.DateTime.fromJSDate(currentItem.endTime).diff(luxon_1.DateTime.fromJSDate(currentItem.startTime), 'minutes').minutes;
                        currentEndTime = luxon_1.DateTime.fromJSDate(newStartTime).plus({ minutes: duration });
                    }
                    else {
                        currentEndTime = luxon_1.DateTime.fromJSDate(newStartTime).plus({ hours: 2 });
                    }
                    for (let i = currentIndex + 1; i < items.length; i++) {
                        const nextItem = items[i];
                        if (!nextItem.Place) {
                            continue;
                        }
                        const nextLocation = this.extractPlaceCoordinates(nextItem.Place);
                        if (!nextLocation) {
                            continue;
                        }
                        const nextDistance = this.calculateHaversineDistance(toLocation.lat, toLocation.lng, nextLocation.lat, nextLocation.lng);
                        const nextTravelMode = nextDistance < 2 ? 'WALKING' :
                            nextDistance < 50 ? 'DRIVING' :
                                'TRANSIT';
                        const nextRoutes = await this.smartRoutesService.getRoutes(toLocation.lat, toLocation.lng, nextLocation.lat, nextLocation.lng, nextTravelMode);
                        if (nextRoutes.length > 0) {
                            const nextTravelTime = nextRoutes[0].durationMinutes;
                            const bufferMinutes = 15;
                            const nextStartTime = currentEndTime.plus({ minutes: nextTravelTime + bufferMinutes });
                            let nextEndTime;
                            if (nextItem.endTime && nextItem.startTime) {
                                const duration = luxon_1.DateTime.fromJSDate(nextItem.endTime).diff(luxon_1.DateTime.fromJSDate(nextItem.startTime), 'minutes').minutes;
                                nextEndTime = nextStartTime.plus({ minutes: duration });
                            }
                            else {
                                nextEndTime = nextStartTime.plus({ hours: 2 });
                            }
                            await this.prisma.itineraryItem.update({
                                where: { id: nextItem.id },
                                data: {
                                    startTime: nextStartTime.toJSDate(),
                                    endTime: nextEndTime.toJSDate(),
                                },
                            });
                            toLocation.lat = nextLocation.lat;
                            toLocation.lng = nextLocation.lng;
                            currentEndTime = nextEndTime;
                        }
                    }
                }
            }
            catch (error) {
                console.warn(`计算旅行时间失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    extractPlaceCoordinates(place) {
        if (!place) {
            return null;
        }
        const metadata = place.metadata || {};
        if (metadata.lat && metadata.lng) {
            return { lat: metadata.lat, lng: metadata.lng };
        }
        if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
            return { lat: metadata.coordinates[1], lng: metadata.coordinates[0] };
        }
        const location = place.location;
        if (location) {
            if (typeof location === 'string') {
                const match = location.match(/POINT\(([^)]+)\)/);
                if (match) {
                    const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
                    return { lat, lng };
                }
            }
            if (typeof location === 'object') {
                if (location.coordinates && Array.isArray(location.coordinates)) {
                    return { lng: location.coordinates[0], lat: location.coordinates[1] };
                }
                if (location.lat && location.lng) {
                    return { lat: location.lat, lng: location.lng };
                }
            }
        }
        if (place._coordinates) {
            return { lat: place._coordinates.lat, lng: place._coordinates.lng };
        }
        return null;
    }
    async extractPlaceCoordinatesAsync(place) {
        if (!place || !place.id) {
            return null;
        }
        let latitude;
        let longitude;
        try {
            const locationResult = await this.prisma.$queryRaw `
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${place.id} AND location IS NOT NULL
      `;
            if (locationResult.length > 0 && locationResult[0].lat != null && locationResult[0].lng != null) {
                latitude = Number(locationResult[0].lat);
                longitude = Number(locationResult[0].lng);
            }
        }
        catch (error) {
        }
        if (!latitude || !longitude) {
            const metadata = place.metadata || {};
            if (metadata.lat && metadata.lng) {
                latitude = Number(metadata.lat);
                longitude = Number(metadata.lng);
            }
            else if (metadata.coordinates && Array.isArray(metadata.coordinates) && metadata.coordinates.length >= 2) {
                const coord1 = Number(metadata.coordinates[0]);
                const coord2 = Number(metadata.coordinates[1]);
                if (Math.abs(coord1) <= 90 && Math.abs(coord2) <= 180) {
                    latitude = coord1;
                    longitude = coord2;
                }
                else if (Math.abs(coord1) <= 180 && Math.abs(coord2) <= 90) {
                    latitude = coord2;
                    longitude = coord1;
                }
                else {
                    latitude = coord1;
                    longitude = coord2;
                }
            }
            else if (metadata.location) {
                if (metadata.location.lat && metadata.location.lng) {
                    latitude = Number(metadata.location.lat);
                    longitude = Number(metadata.location.lng);
                }
                else if (metadata.location.coordinates && Array.isArray(metadata.location.coordinates)) {
                    const coord1 = Number(metadata.location.coordinates[0]);
                    const coord2 = Number(metadata.location.coordinates[1]);
                    if (Math.abs(coord1) <= 90 && Math.abs(coord2) <= 180) {
                        latitude = coord1;
                        longitude = coord2;
                    }
                    else if (Math.abs(coord1) <= 180 && Math.abs(coord2) <= 90) {
                        latitude = coord2;
                        longitude = coord1;
                    }
                }
            }
        }
        if (latitude != null && longitude != null) {
            return { lat: latitude, lng: longitude };
        }
        return null;
    }
    async enrichItemWithCoordinates(item) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        if (!item) {
            return item;
        }
        if (item.Place) {
            const coords = await this.extractPlaceCoordinatesAsync(item.Place);
            item.Place = {
                ...item.Place,
                lat: (_a = coords === null || coords === void 0 ? void 0 : coords.lat) !== null && _a !== void 0 ? _a : null,
                lng: (_b = coords === null || coords === void 0 ? void 0 : coords.lng) !== null && _b !== void 0 ? _b : null,
                latitude: (_c = coords === null || coords === void 0 ? void 0 : coords.lat) !== null && _c !== void 0 ? _c : null,
                longitude: (_d = coords === null || coords === void 0 ? void 0 : coords.lng) !== null && _d !== void 0 ? _d : null,
                coordinates: coords ? { lat: coords.lat, lng: coords.lng } : undefined,
            };
        }
        if (item.Trail) {
            if (item.Trail.Place_Trail_startPlaceIdToPlace) {
                const startCoords = await this.extractPlaceCoordinatesAsync(item.Trail.Place_Trail_startPlaceIdToPlace);
                item.Trail.Place_Trail_startPlaceIdToPlace = {
                    ...item.Trail.Place_Trail_startPlaceIdToPlace,
                    lat: (_e = startCoords === null || startCoords === void 0 ? void 0 : startCoords.lat) !== null && _e !== void 0 ? _e : null,
                    lng: (_f = startCoords === null || startCoords === void 0 ? void 0 : startCoords.lng) !== null && _f !== void 0 ? _f : null,
                    latitude: (_g = startCoords === null || startCoords === void 0 ? void 0 : startCoords.lat) !== null && _g !== void 0 ? _g : null,
                    longitude: (_h = startCoords === null || startCoords === void 0 ? void 0 : startCoords.lng) !== null && _h !== void 0 ? _h : null,
                    coordinates: startCoords ? { lat: startCoords.lat, lng: startCoords.lng } : undefined,
                };
            }
            if (item.Trail.Place_Trail_endPlaceIdToPlace) {
                const endCoords = await this.extractPlaceCoordinatesAsync(item.Trail.Place_Trail_endPlaceIdToPlace);
                item.Trail.Place_Trail_endPlaceIdToPlace = {
                    ...item.Trail.Place_Trail_endPlaceIdToPlace,
                    lat: (_j = endCoords === null || endCoords === void 0 ? void 0 : endCoords.lat) !== null && _j !== void 0 ? _j : null,
                    lng: (_k = endCoords === null || endCoords === void 0 ? void 0 : endCoords.lng) !== null && _k !== void 0 ? _k : null,
                    latitude: (_l = endCoords === null || endCoords === void 0 ? void 0 : endCoords.lat) !== null && _l !== void 0 ? _l : null,
                    longitude: (_m = endCoords === null || endCoords === void 0 ? void 0 : endCoords.lng) !== null && _m !== void 0 ? _m : null,
                    coordinates: endCoords ? { lat: endCoords.lat, lng: endCoords.lng } : undefined,
                };
            }
            if (item.Trail.TrailWaypoint && Array.isArray(item.Trail.TrailWaypoint)) {
                for (const waypoint of item.Trail.TrailWaypoint) {
                    if (waypoint.Place) {
                        const waypointCoords = await this.extractPlaceCoordinatesAsync(waypoint.Place);
                        waypoint.Place = {
                            ...waypoint.Place,
                            lat: (_o = waypointCoords === null || waypointCoords === void 0 ? void 0 : waypointCoords.lat) !== null && _o !== void 0 ? _o : null,
                            lng: (_p = waypointCoords === null || waypointCoords === void 0 ? void 0 : waypointCoords.lng) !== null && _p !== void 0 ? _p : null,
                            latitude: (_q = waypointCoords === null || waypointCoords === void 0 ? void 0 : waypointCoords.lat) !== null && _q !== void 0 ? _q : null,
                            longitude: (_r = waypointCoords === null || waypointCoords === void 0 ? void 0 : waypointCoords.lng) !== null && _r !== void 0 ? _r : null,
                            coordinates: waypointCoords ? { lat: waypointCoords.lat, lng: waypointCoords.lng } : undefined,
                        };
                    }
                }
            }
        }
        return item;
    }
    async getPlaceCoordinates(placeId) {
        if (!placeId)
            return null;
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${placeId} AND location IS NOT NULL
      `;
            if (result.length > 0 && result[0].lat && result[0].lng) {
                return { lat: result[0].lat, lng: result[0].lng };
            }
        }
        catch (e) {
        }
        return null;
    }
    calculateHaversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
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
    async remove(id) {
        const item = await this.prisma.itineraryItem.findUnique({
            where: { id },
        });
        if (!item) {
            throw new common_1.NotFoundException(`找不到指定的行程项 (ID: ${id})`);
        }
        return this.prisma.itineraryItem.delete({
            where: { id },
        });
    }
    async calculateTravelInfoForItem(itemId, tripId) {
        var _a, _b, _c, _d;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
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
        if (!trip)
            return;
        const allItems = [];
        trip.TripDay.forEach((day, dayIndex) => {
            day.ItineraryItem.forEach(item => {
                allItems.push({
                    id: item.id,
                    placeId: item.placeId,
                    Place: item.Place,
                    startTime: item.startTime,
                    dayIndex,
                });
            });
        });
        allItems.sort((a, b) => {
            if (!a.startTime || !b.startTime)
                return 0;
            return a.startTime.getTime() - b.startTime.getTime();
        });
        const currentIndex = allItems.findIndex(item => item.id === itemId);
        if (currentIndex <= 0) {
            return;
        }
        const currentItem = allItems[currentIndex];
        const prevItem = allItems[currentIndex - 1];
        let fromCoords = this.extractPlaceCoordinates(prevItem.Place);
        let toCoords = this.extractPlaceCoordinates(currentItem.Place);
        if (!fromCoords && prevItem.placeId) {
            fromCoords = await this.getPlaceCoordinates(prevItem.placeId);
        }
        if (!toCoords && currentItem.placeId) {
            toCoords = await this.getPlaceCoordinates(currentItem.placeId);
        }
        if (!fromCoords || !toCoords) {
            return;
        }
        const straightDistance = this.calculateHaversineDistance(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng);
        let travelMode;
        if (straightDistance < 1) {
            travelMode = 'WALKING';
        }
        else if (straightDistance < 50) {
            travelMode = 'DRIVING';
        }
        else {
            travelMode = 'DRIVING';
        }
        let duration = null;
        let distance = null;
        if (this.smartRoutesService && ['DRIVING', 'WALKING', 'TRANSIT'].includes(travelMode)) {
            try {
                const routes = await this.smartRoutesService.getRoutes(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng, travelMode);
                if (routes.length > 0) {
                    duration = routes[0].durationMinutes;
                    const routeData = routes[0];
                    if (routeData.distanceMeters) {
                        distance = routeData.distanceMeters;
                    }
                    else if (routeData.distanceKm) {
                        distance = Math.round(routeData.distanceKm * 1000);
                    }
                    else {
                        distance = Math.round(straightDistance * 1000);
                    }
                }
                else {
                    distance = Math.round(straightDistance * 1000);
                    duration = this.estimateDuration(straightDistance, travelMode);
                }
            }
            catch (e) {
                distance = Math.round(straightDistance * 1000);
                duration = this.estimateDuration(straightDistance, travelMode);
            }
        }
        else {
            distance = Math.round(straightDistance * 1000);
            duration = this.estimateDuration(straightDistance, travelMode);
        }
        await this.prisma.itineraryItem.update({
            where: { id: itemId },
            data: {
                travelFromPreviousDuration: duration,
                travelFromPreviousDistance: distance,
                travelMode: travelMode,
            },
        });
        return {
            itemId,
            fromPlace: ((_a = prevItem.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = prevItem.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || '未知',
            toPlace: ((_c = currentItem.Place) === null || _c === void 0 ? void 0 : _c.nameCN) || ((_d = currentItem.Place) === null || _d === void 0 ? void 0 : _d.nameEN) || '未知',
            duration,
            distance,
            travelMode,
            crossDay: currentItem.dayIndex !== prevItem.dayIndex,
        };
    }
    async calculateAllTravelInfo(tripId, defaultTravelMode = 'DRIVING') {
        var _a, _b, _c, _d;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
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
            throw new common_1.NotFoundException(`找不到行程 (ID: ${tripId})`);
        }
        const allItems = [];
        trip.TripDay.forEach((day, dayIndex) => {
            day.ItineraryItem.forEach(item => {
                allItems.push({
                    id: item.id,
                    placeId: item.placeId,
                    Place: item.Place,
                    startTime: item.startTime,
                    travelMode: item.travelMode,
                    dayIndex,
                    dayDate: day.date,
                });
            });
        });
        allItems.sort((a, b) => {
            if (!a.startTime || !b.startTime)
                return 0;
            return a.startTime.getTime() - b.startTime.getTime();
        });
        const results = [];
        for (let i = 1; i < allItems.length; i++) {
            const fromItem = allItems[i - 1];
            const toItem = allItems[i];
            const crossDay = toItem.dayIndex !== fromItem.dayIndex;
            const resultEntry = {
                itemId: toItem.id,
                fromPlace: ((_a = fromItem.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = fromItem.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || '未知地点',
                toPlace: ((_c = toItem.Place) === null || _c === void 0 ? void 0 : _c.nameCN) || ((_d = toItem.Place) === null || _d === void 0 ? void 0 : _d.nameEN) || '未知地点',
                duration: null,
                distance: null,
                travelMode: toItem.travelMode || defaultTravelMode,
                crossDay,
                calculated: false,
                error: undefined,
            };
            let fromCoords = this.extractPlaceCoordinates(fromItem.Place);
            let toCoords = this.extractPlaceCoordinates(toItem.Place);
            if (!fromCoords && fromItem.placeId) {
                fromCoords = await this.getPlaceCoordinates(fromItem.placeId);
            }
            if (!toCoords && toItem.placeId) {
                toCoords = await this.getPlaceCoordinates(toItem.placeId);
            }
            if (!fromCoords || !toCoords) {
                resultEntry.error = '缺少坐标信息';
                results.push(resultEntry);
                continue;
            }
            try {
                const straightDistance = this.calculateHaversineDistance(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng);
                let travelMode = toItem.travelMode;
                if (!travelMode) {
                    if (straightDistance < 1) {
                        travelMode = 'WALKING';
                    }
                    else if (straightDistance < 50) {
                        travelMode = 'DRIVING';
                    }
                    else {
                        travelMode = 'DRIVING';
                    }
                }
                let duration = null;
                let distance = null;
                if (this.smartRoutesService && ['DRIVING', 'WALKING', 'TRANSIT'].includes(travelMode)) {
                    try {
                        const routes = await this.smartRoutesService.getRoutes(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng, travelMode);
                        if (routes.length > 0) {
                            duration = routes[0].durationMinutes;
                            const routeData = routes[0];
                            if (routeData.distanceMeters) {
                                distance = routeData.distanceMeters;
                            }
                            else if (routeData.distanceKm) {
                                distance = Math.round(routeData.distanceKm * 1000);
                            }
                            else {
                                distance = Math.round(straightDistance * 1000);
                            }
                        }
                        else {
                            distance = Math.round(straightDistance * 1000);
                            duration = this.estimateDuration(straightDistance, travelMode);
                        }
                    }
                    catch (e) {
                        distance = Math.round(straightDistance * 1000);
                        duration = this.estimateDuration(straightDistance, travelMode);
                    }
                }
                else {
                    distance = Math.round(straightDistance * 1000);
                    duration = this.estimateDuration(straightDistance, travelMode);
                }
                await this.prisma.itineraryItem.update({
                    where: { id: toItem.id },
                    data: {
                        travelFromPreviousDuration: duration,
                        travelFromPreviousDistance: distance,
                        travelMode: travelMode,
                    },
                });
                resultEntry.duration = duration;
                resultEntry.distance = distance;
                resultEntry.travelMode = travelMode;
                resultEntry.calculated = true;
                results.push(resultEntry);
            }
            catch (error) {
                resultEntry.error = error instanceof Error ? error.message : String(error);
                results.push(resultEntry);
            }
        }
        const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
        const totalDistance = results.reduce((sum, r) => sum + (r.distance || 0), 0);
        const successCount = results.filter(r => r.calculated).length;
        const crossDayCount = results.filter(r => r.crossDay).length;
        return {
            tripId,
            totalDays: trip.TripDay.length,
            totalItems: allItems.length,
            calculatedCount: successCount,
            crossDaySegments: crossDayCount,
            results,
            summary: {
                totalDuration,
                totalDistance,
                successRate: allItems.length > 1 ? successCount / (allItems.length - 1) : 1,
            },
        };
    }
    async calculateAndSaveTravelInfo(tripId, dayId, defaultTravelMode = 'DRIVING') {
        var _a, _b, _c, _d;
        const tripDay = await this.prisma.tripDay.findFirst({
            where: {
                id: dayId,
                Trip: { id: tripId },
            },
            include: {
                ItineraryItem: {
                    include: {
                        Place: true,
                    },
                    orderBy: { startTime: 'asc' },
                },
            },
        });
        if (!tripDay) {
            throw new common_1.NotFoundException(`找不到指定的行程日期 (tripId: ${tripId}, dayId: ${dayId})`);
        }
        const items = tripDay.ItineraryItem;
        const results = [];
        for (let i = 1; i < items.length; i++) {
            const fromItem = items[i - 1];
            const toItem = items[i];
            let fromCoords = this.extractPlaceCoordinates(fromItem.Place);
            let toCoords = this.extractPlaceCoordinates(toItem.Place);
            if (!fromCoords && fromItem.placeId) {
                fromCoords = await this.getPlaceCoordinates(fromItem.placeId);
            }
            if (!toCoords && toItem.placeId) {
                toCoords = await this.getPlaceCoordinates(toItem.placeId);
            }
            const resultEntry = {
                itemId: toItem.id,
                fromPlace: ((_a = fromItem.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = fromItem.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || '未知地点',
                toPlace: ((_c = toItem.Place) === null || _c === void 0 ? void 0 : _c.nameCN) || ((_d = toItem.Place) === null || _d === void 0 ? void 0 : _d.nameEN) || '未知地点',
                duration: null,
                distance: null,
                travelMode: toItem.travelMode || defaultTravelMode,
                calculated: false,
                error: undefined,
            };
            if (!fromCoords || !toCoords) {
                resultEntry.error = '缺少坐标信息';
                results.push(resultEntry);
                continue;
            }
            try {
                const straightDistance = this.calculateHaversineDistance(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng);
                let travelMode = toItem.travelMode;
                if (!travelMode) {
                    if (straightDistance < 1) {
                        travelMode = 'WALKING';
                    }
                    else if (straightDistance < 50) {
                        travelMode = 'DRIVING';
                    }
                    else {
                        travelMode = 'DRIVING';
                    }
                }
                let duration = null;
                let distance = null;
                if (this.smartRoutesService && ['DRIVING', 'WALKING', 'TRANSIT'].includes(travelMode)) {
                    try {
                        const routes = await this.smartRoutesService.getRoutes(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng, travelMode);
                        if (routes.length > 0) {
                            duration = routes[0].durationMinutes;
                            const routeData = routes[0];
                            if (routeData.distanceMeters) {
                                distance = routeData.distanceMeters;
                            }
                            else if (routeData.distanceKm) {
                                distance = Math.round(routeData.distanceKm * 1000);
                            }
                            else {
                                distance = Math.round(straightDistance * 1000);
                            }
                        }
                        else {
                            distance = Math.round(straightDistance * 1000);
                            duration = this.estimateDuration(straightDistance, travelMode);
                        }
                    }
                    catch (routeError) {
                        distance = Math.round(straightDistance * 1000);
                        duration = this.estimateDuration(straightDistance, travelMode);
                    }
                }
                else {
                    distance = Math.round(straightDistance * 1000);
                    duration = this.estimateDuration(straightDistance, travelMode);
                }
                await this.prisma.itineraryItem.update({
                    where: { id: toItem.id },
                    data: {
                        travelFromPreviousDuration: duration,
                        travelFromPreviousDistance: distance,
                        travelMode: travelMode,
                    },
                });
                resultEntry.duration = duration;
                resultEntry.distance = distance;
                resultEntry.travelMode = travelMode;
                resultEntry.calculated = true;
                results.push(resultEntry);
            }
            catch (error) {
                resultEntry.error = error instanceof Error ? error.message : String(error);
                results.push(resultEntry);
            }
        }
        const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
        const totalDistance = results.reduce((sum, r) => sum + (r.distance || 0), 0);
        const successCount = results.filter(r => r.calculated).length;
        return {
            dayId,
            date: tripDay.date,
            itemCount: items.length,
            calculatedCount: successCount,
            results,
            summary: {
                totalDuration,
                totalDistance,
                successRate: items.length > 1 ? successCount / (items.length - 1) : 1,
            },
        };
    }
    estimateDuration(distanceKm, travelMode) {
        switch (travelMode) {
            case 'WALKING':
                return Math.round(distanceKm / 5 * 60);
            case 'BICYCLE':
                return Math.round(distanceKm / 15 * 60);
            case 'DRIVING':
            case 'TAXI':
                return Math.round(distanceKm / 60 * 60);
            case 'TRANSIT':
                return Math.round(distanceKm / 30 * 60);
            case 'TRAIN':
                return Math.round(distanceKm / 250 * 60) + 60;
            case 'FLIGHT':
                return Math.round(distanceKm / 800 * 60) + 180;
            case 'FERRY':
                return Math.round(distanceKm / 30 * 60) + 30;
            default:
                return Math.round(distanceKm / 50 * 60);
        }
    }
    async getDayTravelInfo(tripId, dayId) {
        var _a, _b, _c, _d;
        const tripDay = await this.prisma.tripDay.findFirst({
            where: {
                id: dayId,
                Trip: { id: tripId },
            },
            include: {
                ItineraryItem: {
                    include: {
                        Place: true,
                    },
                    orderBy: { startTime: 'asc' },
                },
            },
        });
        if (!tripDay) {
            throw new common_1.NotFoundException(`找不到指定的行程日期 (tripId: ${tripId}, dayId: ${dayId})`);
        }
        const items = tripDay.ItineraryItem;
        const travelSegments = [];
        for (let i = 0; i < items.length - 1; i++) {
            const fromItem = items[i];
            const toItem = items[i + 1];
            let fromCoords = this.extractPlaceCoordinates(fromItem.Place);
            let toCoords = this.extractPlaceCoordinates(toItem.Place);
            if (!fromCoords && fromItem.placeId) {
                fromCoords = await this.getPlaceCoordinates(fromItem.placeId);
            }
            if (!toCoords && toItem.placeId) {
                toCoords = await this.getPlaceCoordinates(toItem.placeId);
            }
            let duration = toItem.travelFromPreviousDuration;
            let distance = toItem.travelFromPreviousDistance;
            let travelMode = toItem.travelMode;
            if ((!duration || !distance) && fromCoords && toCoords) {
                const calculatedDistance = this.calculateHaversineDistance(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng);
                distance = Math.round(calculatedDistance * 1000);
                if (calculatedDistance < 2) {
                    travelMode = 'WALKING';
                    duration = Math.round(calculatedDistance / 5 * 60);
                }
                else if (calculatedDistance < 50) {
                    travelMode = 'DRIVING';
                    duration = Math.round(calculatedDistance / 60 * 60);
                }
                else {
                    travelMode = 'TRANSIT';
                    duration = Math.round(calculatedDistance / 80 * 60);
                }
                if (this.smartRoutesService) {
                    try {
                        const routes = await this.smartRoutesService.getRoutes(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng, travelMode);
                        if (routes.length > 0) {
                            duration = routes[0].durationMinutes;
                            const routeData = routes[0];
                            if (routeData.distanceMeters) {
                                distance = routeData.distanceMeters;
                            }
                            else if (routeData.distanceKm) {
                                distance = Math.round(routeData.distanceKm * 1000);
                            }
                        }
                    }
                    catch (e) {
                    }
                }
            }
            travelSegments.push({
                fromItemId: fromItem.id,
                toItemId: toItem.id,
                fromPlace: ((_a = fromItem.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = fromItem.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || '未知地点',
                toPlace: ((_c = toItem.Place) === null || _c === void 0 ? void 0 : _c.nameCN) || ((_d = toItem.Place) === null || _d === void 0 ? void 0 : _d.nameEN) || '未知地点',
                duration,
                distance,
                travelMode,
            });
        }
        const totalDuration = travelSegments.reduce((sum, s) => sum + (s.duration || 0), 0);
        const totalDistance = travelSegments.reduce((sum, s) => sum + (s.distance || 0), 0);
        return {
            dayId,
            date: tripDay.date,
            itemCount: items.length,
            segments: travelSegments,
            summary: {
                totalDuration,
                totalDistance,
                segmentCount: travelSegments.length,
            },
        };
    }
    async updateBookingStatus(id, bookingData) {
        const item = await this.prisma.itineraryItem.findUnique({
            where: { id },
        });
        if (!item) {
            throw new common_1.NotFoundException(`找不到指定的行程项 (ID: ${id})`);
        }
        const updatedItem = await this.prisma.itineraryItem.update({
            where: { id },
            data: {
                bookingStatus: bookingData.bookingStatus,
                bookingConfirmation: bookingData.bookingConfirmation,
                bookingUrl: bookingData.bookingUrl,
                bookedAt: bookingData.bookedAt ? new Date(bookingData.bookedAt) : undefined,
            },
            include: {
                Place: true,
                TripDay: true,
            },
        });
        return this.enrichItemWithCoordinates(updatedItem);
    }
    async fixItemDateConsistency(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: true,
                    },
                    orderBy: { date: 'asc' },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`找不到行程 (ID: ${tripId})`);
        }
        const fixes = [];
        for (const day of trip.TripDay) {
            const tripDayDate = luxon_1.DateTime.fromJSDate(day.date, { zone: 'utc' });
            for (const item of day.ItineraryItem) {
                if (!item.startTime)
                    continue;
                const startDateTime = luxon_1.DateTime.fromJSDate(item.startTime, { zone: 'utc' });
                const startDateOnly = startDateTime.toFormat('yyyy-MM-dd');
                const tripDayDateOnly = tripDayDate.toFormat('yyyy-MM-dd');
                if (startDateOnly !== tripDayDateOnly) {
                    const timeOfDay = startDateTime.toFormat('HH:mm:ss');
                    const newStartTime = luxon_1.DateTime.fromFormat(`${tripDayDateOnly} ${timeOfDay}`, 'yyyy-MM-dd HH:mm:ss', { zone: 'utc' });
                    const timeDiff = newStartTime.toMillis() - startDateTime.toMillis();
                    let newEndTime = null;
                    if (item.endTime) {
                        newEndTime = luxon_1.DateTime.fromJSDate(item.endTime, { zone: 'utc' }).plus({ milliseconds: timeDiff });
                    }
                    await this.prisma.itineraryItem.update({
                        where: { id: item.id },
                        data: {
                            startTime: newStartTime.toJSDate(),
                            ...(newEndTime && { endTime: newEndTime.toJSDate() }),
                        },
                    });
                    fixes.push({
                        itemId: item.id,
                        placeName: item.id,
                        oldStartTime: startDateTime.toISO() || '',
                        newStartTime: newStartTime.toISO() || '',
                        fixed: true,
                    });
                }
            }
        }
        return {
            tripId,
            totalDays: trip.TripDay.length,
            fixedCount: fixes.length,
            fixes,
        };
    }
    async updateTravelInfo(id, travelData) {
        const item = await this.prisma.itineraryItem.findUnique({
            where: { id },
        });
        if (!item) {
            throw new common_1.NotFoundException(`找不到指定的行程项 (ID: ${id})`);
        }
        const updatedItem = await this.prisma.itineraryItem.update({
            where: { id },
            data: {
                travelFromPreviousDuration: travelData.travelFromPreviousDuration,
                travelFromPreviousDistance: travelData.travelFromPreviousDistance,
                travelMode: travelData.travelMode,
            },
            include: {
                Place: true,
                TripDay: true,
            },
        });
        return this.enrichItemWithCoordinates(updatedItem);
    }
    async searchNearbyPoi(query) {
        var _a, _b, _c;
        console.log(`[searchNearbyPoi] 开始搜索:`, { itemId: query.itemId, lat: query.lat, lng: query.lng, radius: query.radius, categories: query.categories });
        try {
            let lat;
            let lng;
            if (query.itemId) {
                const item = await this.findOne(query.itemId);
                if (!item) {
                    throw new common_1.NotFoundException(`找不到指定的行程项 (ID: ${query.itemId})`);
                }
                if (!item.Place) {
                    throw new common_1.BadRequestException(`行程项 ${query.itemId} 没有关联的地点`);
                }
                const coords = await this.extractPlaceCoordinatesAsync(item.Place);
                if (!coords) {
                    throw new common_1.BadRequestException(`行程项 ${query.itemId} 的地点没有坐标信息`);
                }
                lat = coords.lat;
                lng = coords.lng;
            }
            else if (query.lat !== undefined && query.lng !== undefined) {
                lat = query.lat;
                lng = query.lng;
            }
            else {
                throw new common_1.BadRequestException('必须提供 itemId 或 lat/lng 坐标');
            }
            const radius = query.radius || 5000;
            const categories = query.categories || [
                search_nearby_poi_dto_1.NearbyPoiCategory.ATTRACTION,
                search_nearby_poi_dto_1.NearbyPoiCategory.RESTAURANT,
                search_nearby_poi_dto_1.NearbyPoiCategory.HOTEL,
                search_nearby_poi_dto_1.NearbyPoiCategory.GAS_STATION,
                search_nearby_poi_dto_1.NearbyPoiCategory.REST_AREA,
            ];
            const limit = query.limit || 20;
            const results = [];
            const dbCategories = [];
            if (categories.includes(search_nearby_poi_dto_1.NearbyPoiCategory.ATTRACTION)) {
                dbCategories.push(client_1.PlaceCategory.ATTRACTION);
            }
            if (categories.includes(search_nearby_poi_dto_1.NearbyPoiCategory.RESTAURANT)) {
                dbCategories.push(client_1.PlaceCategory.RESTAURANT);
            }
            if (categories.includes(search_nearby_poi_dto_1.NearbyPoiCategory.HOTEL)) {
                dbCategories.push(client_1.PlaceCategory.HOTEL);
            }
            if (dbCategories.length > 0) {
                if (!this.placesService) {
                    console.warn('[searchNearbyPoi] PlacesService 未注入，跳过数据库搜索');
                }
                else {
                    for (const category of dbCategories) {
                        const places = await this.placesService.findNearby(lat, lng, radius, category);
                        for (const place of places) {
                            if (query.minRating && place.rating && place.rating < query.minRating) {
                                continue;
                            }
                            const placeCoords = await this.extractPlaceCoordinatesAsync(place);
                            if (!placeCoords) {
                                continue;
                            }
                            const placeAny = place;
                            const metadata = placeAny.metadata || placeAny.status || {};
                            let openingHours = undefined;
                            if (metadata.openingHours || metadata.opening_hours) {
                                const openingHoursData = metadata.openingHours || metadata.opening_hours;
                                const timezone = metadata.timezone || 'UTC';
                                const todayHours = opening_hours_util_1.OpeningHoursUtil.getTodayHours(metadata, timezone);
                                if (todayHours && todayHours !== 'Closed') {
                                    const parts = todayHours.split('-');
                                    openingHours = {
                                        open: (_a = parts[0]) === null || _a === void 0 ? void 0 : _a.trim(),
                                        close: (_b = parts[1]) === null || _b === void 0 ? void 0 : _b.trim(),
                                        openNow: query.openNow !== undefined ? (todayHours !== 'Closed') : undefined,
                                    };
                                }
                            }
                            results.push({
                                id: place.id,
                                nameCN: place.nameCN,
                                nameEN: place.nameEN || undefined,
                                category: category,
                                address: place.address || undefined,
                                rating: place.rating || undefined,
                                lat: placeCoords.lat,
                                lng: placeCoords.lng,
                                distanceMeters: place.distance || 0,
                                openingHours: openingHours,
                                metadata: placeAny.metadata || undefined,
                            });
                        }
                    }
                }
            }
            const googleCategories = [];
            if (categories.includes(search_nearby_poi_dto_1.NearbyPoiCategory.GAS_STATION)) {
                googleCategories.push('gas_station');
            }
            if (categories.includes(search_nearby_poi_dto_1.NearbyPoiCategory.REST_AREA)) {
                googleCategories.push('rest_stop');
            }
            if (googleCategories.length > 0 && ((_c = this.googleMapsService) === null || _c === void 0 ? void 0 : _c.isServiceAvailable())) {
                const googleSearchPromises = googleCategories.map(async (googleType) => {
                    try {
                        const googleResults = await this.googleMapsService.nearbySearch({
                            location: { lat, lng },
                            radius: radius,
                            type: googleType,
                            language: 'en',
                        });
                        return { googleType, googleResults, error: null };
                    }
                    catch (error) {
                        console.warn(`Google Places API 搜索失败 (${googleType}):`, error.message);
                        return { googleType, googleResults: null, error: error.message };
                    }
                });
                const googleSearchResults = await Promise.allSettled(googleSearchPromises);
                for (const settledResult of googleSearchResults) {
                    if (settledResult.status === 'fulfilled') {
                        const { googleType, googleResults, error } = settledResult.value;
                        if (error || !(googleResults === null || googleResults === void 0 ? void 0 : googleResults.success) || !googleResults.data.results) {
                            continue;
                        }
                        for (const result of googleResults.data.results.slice(0, limit)) {
                            const geometry = result.geometry;
                            const location = geometry === null || geometry === void 0 ? void 0 : geometry.location;
                            if (!location) {
                                continue;
                            }
                            const distanceMeters = this.calculateDistance(lat, lng, location.lat, location.lng);
                            if (query.minRating && result.rating && result.rating < query.minRating) {
                                continue;
                            }
                            let category;
                            if (googleType === 'gas_station') {
                                category = client_1.PlaceCategory.TRANSIT_HUB;
                            }
                            else {
                                category = client_1.PlaceCategory.ATTRACTION;
                            }
                            let openingHours = undefined;
                            if (result.opening_hours) {
                                const periods = result.opening_hours.periods;
                                const openNow = result.opening_hours.open_now;
                                if (periods && periods.length > 0) {
                                    const today = new Date().getDay();
                                    const todayPeriod = periods.find((p) => { var _a; return ((_a = p.open) === null || _a === void 0 ? void 0 : _a.day) === today; });
                                    if (todayPeriod === null || todayPeriod === void 0 ? void 0 : todayPeriod.open) {
                                        openingHours = {
                                            open: this.formatTime(todayPeriod.open.time),
                                            close: todayPeriod.close ? this.formatTime(todayPeriod.close.time) : undefined,
                                            openNow: openNow,
                                        };
                                    }
                                }
                            }
                            results.push({
                                id: result.place_id ? parseInt(result.place_id.replace(/\D/g, '')) || 0 : 0,
                                nameCN: result.name,
                                nameEN: result.name,
                                category: category,
                                address: result.vicinity || result.formatted_address,
                                rating: result.rating,
                                lat: location.lat,
                                lng: location.lng,
                                distanceMeters: distanceMeters,
                                openingHours: openingHours,
                                metadata: {
                                    placeId: result.place_id,
                                    types: result.types,
                                    priceLevel: result.price_level,
                                },
                            });
                        }
                    }
                }
            }
            results.sort((a, b) => a.distanceMeters - b.distanceMeters);
            const finalResults = results.slice(0, limit);
            console.log(`[searchNearbyPoi] 搜索完成: 坐标(${lat}, ${lng}), 半径${radius}m, 找到${finalResults.length}个结果`);
            return Array.isArray(finalResults) ? finalResults : [];
        }
        catch (error) {
            console.error('[searchNearbyPoi] 搜索失败:', error);
            console.error('[searchNearbyPoi] 错误堆栈:', error.stack);
            throw error;
        }
    }
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) *
                Math.cos(this.toRad(lat2)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(degrees) {
        return degrees * (Math.PI / 180);
    }
    formatTime(time) {
        if (time.length === 4) {
            return `${time.substring(0, 2)}:${time.substring(2, 4)}`;
        }
        return time;
    }
};
exports.ItineraryItemsService = ItineraryItemsService;
exports.ItineraryItemsService = ItineraryItemsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => places_service_1.PlacesService))),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        smart_routes_service_1.SmartRoutesService,
        places_service_1.PlacesService,
        google_maps_direct_service_1.GoogleMapsDirectService])
], ItineraryItemsService);
//# sourceMappingURL=itinerary-items.service.js.map