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
var TripsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const create_trip_dto_1 = require("./dto/create-trip.dto");
const trip_status_dto_1 = require("./dto/trip-status.dto");
const luxon_1 = require("luxon");
const pacing_calculator_util_1 = require("./utils/pacing-calculator.util");
const flight_price_service_1 = require("./services/flight-price.service");
const schedule_converter_service_1 = require("./services/schedule-converter.service");
const action_history_service_1 = require("./services/action-history.service");
const crypto_1 = require("crypto");
const persona_alerts_dto_1 = require("./dto/persona-alerts.dto");
const tasks_dto_1 = require("./dto/tasks.dto");
const pipeline_status_dto_1 = require("./dto/pipeline-status.dto");
const decision_log_storage_service_1 = require("./decision/services/decision-log-storage.service");
const trip_draft_service_1 = require("./services/trip-draft.service");
const evidence_dto_1 = require("./dto/evidence.dto");
const attention_queue_dto_1 = require("./dto/attention-queue.dto");
const place_response_dto_1 = require("./dto/place-response.dto");
const evidence_management_service_1 = require("./services/evidence-management.service");
const evidence_filtering_service_1 = require("./services/evidence-filtering.service");
const evidence_completeness_checker_service_1 = require("./services/evidence-completeness-checker.service");
const evidence_trigger_service_1 = require("./services/evidence-trigger.service");
const evidence_dto_2 = require("./dto/evidence.dto");
const opening_hours_util_1 = require("../common/utils/opening-hours.util");
const booking_com_integration_service_1 = require("../mcp/booking-com-integration.service");
let TripsService = TripsService_1 = class TripsService {
    isValidUUID(uuid) {
        if (!uuid || typeof uuid !== 'string') {
            return false;
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid.trim());
    }
    async checkCarRentalNeeds(dto, countryCode, tripId) {
        if (tripId) {
            try {
                const trip = await this.prisma.trip.findUnique({
                    where: { id: tripId },
                });
                if (trip) {
                    const metadata = trip.metadata || {};
                    if (metadata.needsCarRental === true) {
                        return true;
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Failed to check car rental needs for trip ${tripId}: ${error.message}`);
            }
        }
        if (dto) {
            const metadata = dto.metadata || {};
            if (metadata.needsCarRental === true) {
                return true;
            }
            if (countryCode) {
                const carRentalFriendlyCountries = ['US', 'CA', 'AU', 'NZ', 'IS', 'NO', 'SE', 'FI'];
                if (carRentalFriendlyCountries.includes(countryCode.toUpperCase())) {
                }
            }
        }
        return false;
    }
    async estimateCarRentalCost(tripId) {
        if (!this.bookingComIntegration) {
            this.logger.debug('BookingComIntegrationService not available, skipping car rental cost estimation');
            return 0;
        }
        const needsCarRental = await this.checkCarRentalNeeds(undefined, undefined, tripId);
        if (!needsCarRental) {
            return 0;
        }
        try {
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
            });
            if (!trip) {
                return 0;
            }
            this.logger.debug(`Car rental cost estimation for trip ${tripId} requires RoutePlanDraft, skipping for now`);
            return 0;
        }
        catch (error) {
            this.logger.warn(`Car rental cost estimation failed: ${error.message}`);
            return 0;
        }
    }
    constructor(prisma, flightPriceService, scheduleConverter, actionHistory, decisionLogStorage, tripDraftService, evidenceManagement, evidenceFiltering, evidenceCompletenessChecker, evidenceTrigger, bookingComIntegration) {
        this.prisma = prisma;
        this.flightPriceService = flightPriceService;
        this.scheduleConverter = scheduleConverter;
        this.actionHistory = actionHistory;
        this.decisionLogStorage = decisionLogStorage;
        this.tripDraftService = tripDraftService;
        this.evidenceManagement = evidenceManagement;
        this.evidenceFiltering = evidenceFiltering;
        this.evidenceCompletenessChecker = evidenceCompletenessChecker;
        this.evidenceTrigger = evidenceTrigger;
        this.bookingComIntegration = bookingComIntegration;
        this.logger = new common_1.Logger(TripsService_1.name);
    }
    async create(dto, userId) {
        var _a;
        const normalizedCountryCode = dto.destination.toUpperCase().trim();
        if (!/^[A-Z]{2}$/.test(normalizedCountryCode)) {
            throw new common_1.BadRequestException(`无效的目的地国家代码: ${dto.destination}。必须是 ISO 3166-1 alpha-2 格式（2个大写字母，如 JP、IS、US）`);
        }
        const cityCount = await this.prisma.city.count({
            where: { countryCode: normalizedCountryCode },
        });
        if (cityCount === 0) {
            throw new common_1.NotFoundException(`目的地国家 ${normalizedCountryCode} 没有城市数据。系统暂不支持该目的地，或该国家尚未导入城市数据。`);
        }
        const start = luxon_1.DateTime.fromISO(dto.startDate);
        const end = luxon_1.DateTime.fromISO(dto.endDate);
        if (!start.isValid) {
            throw new common_1.BadRequestException(`无效的开始日期: ${dto.startDate}`);
        }
        if (!end.isValid) {
            throw new common_1.BadRequestException(`无效的结束日期: ${dto.endDate}`);
        }
        if (end <= start) {
            throw new common_1.BadRequestException('结束日期必须晚于开始日期');
        }
        const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
        if (durationDays < 1) {
            throw new common_1.BadRequestException('行程天数必须至少为 1 天');
        }
        let pacingConfig = pacing_calculator_util_1.PacingCalculator.calculateShortestStave(dto.travelers);
        if (dto.pace) {
            const paceToActivities = {
                [create_trip_dto_1.TripPace.RELAXED]: 3,
                [create_trip_dto_1.TripPace.STANDARD]: 5,
                [create_trip_dto_1.TripPace.TIGHT]: 7,
            };
            pacingConfig = {
                ...pacingConfig,
                level: dto.pace,
                maxDailyActivities: paceToActivities[dto.pace],
            };
        }
        const estimatedFlightVisa = await this.flightPriceService.getEstimatedCost(normalizedCountryCode, undefined, true);
        let estimatedCarRentalCost = 0;
        const needsCarRental = await this.checkCarRentalNeeds(dto, normalizedCountryCode);
        if (needsCarRental && this.bookingComIntegration) {
            try {
                this.logger.debug('Trip may need car rental, cost estimation will be done after route planning');
            }
            catch (error) {
                this.logger.warn(`Car rental cost estimation failed: ${error.message}`);
            }
        }
        const remainingBudget = dto.totalBudget - estimatedFlightVisa - estimatedCarRentalCost;
        const dailyBudget = remainingBudget / durationDays;
        let hotelTier = '3-Star';
        if (dailyBudget > 3000) {
            hotelTier = '5-Star';
        }
        else if (dailyBudget > 1500) {
            hotelTier = '4-Star';
        }
        const budgetConfig = {
            totalBudget: dto.totalBudget,
            currency: 'CNY',
            estimated_flight_visa: estimatedFlightVisa,
            remaining_for_ground: remainingBudget,
            daily_budget: Math.round(dailyBudget),
            hotel_tier_recommendation: hotelTier,
            travelers: dto.travelers.map(t => ({
                type: t.type,
                mobilityTag: t.mobilityTag,
            })),
        };
        const metadata = {};
        if (dto.preferences && dto.preferences.length > 0) {
            metadata.preferences = dto.preferences;
        }
        if (dto.mustPlaces && dto.mustPlaces.length > 0 || dto.avoidPlaces && dto.avoidPlaces.length > 0) {
            metadata.constraints = {
                mustPlaces: dto.mustPlaces || [],
                avoidPlaces: dto.avoidPlaces || [],
            };
        }
        const tripName = ((_a = dto.name) === null || _a === void 0 ? void 0 : _a.trim()) || this.generateDefaultTripName({
            destination: normalizedCountryCode,
            startDate: dto.startDate,
        });
        return this.prisma.$transaction(async (tx) => {
            const trip = await tx.trip.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    name: tripName,
                    destination: normalizedCountryCode,
                    startDate: start.toJSDate(),
                    endDate: end.toJSDate(),
                    status: dto.status || trip_status_dto_1.TripStatus.PLANNING,
                    budgetConfig: budgetConfig,
                    pacingConfig: pacingConfig,
                    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
                    updatedAt: new Date(),
                },
            });
            const tripDays = [];
            for (let i = 0; i < durationDays; i++) {
                const dayDate = start.plus({ days: i });
                const tripDay = await tx.tripDay.create({
                    data: {
                        id: (0, crypto_1.randomUUID)(),
                        date: dayDate.toJSDate(),
                        tripId: trip.id,
                    },
                });
                tripDays.push(tripDay);
            }
            if (userId) {
                await tx.tripCollaborator.create({
                    data: {
                        id: (0, crypto_1.randomUUID)(),
                        tripId: trip.id,
                        userId: userId,
                        role: 'OWNER',
                        updatedAt: new Date(),
                    },
                });
            }
            return {
                ...trip,
                days: tripDays,
                processedConfig: {
                    pacingConfig: pacingConfig,
                    budgetConfig: budgetConfig,
                    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
                },
            };
        });
    }
    async createFromDraft(dto, userId) {
        const draft = dto.draft;
        if (!draft.draftDays || draft.draftDays.length === 0) {
            throw new common_1.BadRequestException('草案数据为空');
        }
        const createTripDto = {
            destination: draft.destination,
            startDate: draft.startDate || draft.draftDays[0].date,
            endDate: draft.endDate || draft.draftDays[draft.draftDays.length - 1].date,
            totalBudget: 20000,
            travelers: [{ type: 'ADULT', mobilityTag: create_trip_dto_1.MobilityTag.CITY_POTATO }],
        };
        const trip = await this.create(createTripDto, userId);
        const itemsCount = await this.tripDraftService.createItineraryItemsFromDraft(trip.id, draft, dto.userEdits);
        return {
            ...trip,
            itemsCount,
        };
    }
    async findAll(userId) {
        const where = userId
            ? {
                TripCollaborator: {
                    some: {
                        userId: userId,
                    },
                },
            }
            : {};
        const trips = await this.prisma.trip.findMany({
            where,
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: true,
                    },
                },
                _count: {
                    select: {
                        TripCollection: true,
                    },
                },
                ...(userId ? {
                    TripCollection: {
                        where: { userId },
                        select: { id: true },
                    },
                } : {}),
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        return trips.map((trip) => {
            const { _count, TripCollection, ...tripData } = trip;
            return {
                ...tripData,
                isCollected: userId ? ((TripCollection === null || TripCollection === void 0 ? void 0 : TripCollection.length) > 0) : false,
                collectionCount: (_count === null || _count === void 0 ? void 0 : _count.TripCollection) || 0,
            };
        });
    }
    async findOne(id, userId) {
        if (!id || typeof id !== 'string' || !id.trim()) {
            throw new common_1.BadRequestException('tripId is required');
        }
        if (userId) {
            const collaborator = await this.prisma.tripCollaborator.findUnique({
                where: {
                    tripId_userId: {
                        tripId: id,
                        userId: userId,
                    },
                },
            });
            if (!collaborator) {
                throw new common_1.NotFoundException(`行程 ID ${id} 不存在或您没有权限访问`);
            }
        }
        const trip = await this.prisma.trip.findUnique({
            where: { id },
            include: {
                TripDay: {
                    orderBy: { date: 'asc' },
                    include: {
                        ItineraryItem: {
                            orderBy: {
                                startTime: 'asc',
                            },
                            include: {
                                Place: {
                                    select: {
                                        id: true,
                                        nameCN: true,
                                        nameEN: true,
                                        category: true,
                                        address: true,
                                        rating: true,
                                        metadata: true,
                                        description: true,
                                        physicalMetadata: true,
                                    },
                                },
                            }
                        }
                    }
                },
                _count: {
                    select: {
                        TripLike: true,
                        TripCollection: true,
                    },
                },
                ...(userId ? {
                    TripLike: {
                        where: { userId },
                        select: { id: true },
                    },
                    TripCollection: {
                        where: { userId },
                        select: { id: true },
                    },
                } : {}),
            }
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${id} 不存在`);
        }
        return await this.enrichTripData(trip, userId);
    }
    validateStatusTransition(currentStatus, newStatus) {
        if (!currentStatus) {
            return;
        }
        if (currentStatus === trip_status_dto_1.TripStatus.CANCELLED) {
            throw new common_1.BadRequestException('已取消的行程不能修改状态');
        }
        if (currentStatus === trip_status_dto_1.TripStatus.COMPLETED &&
            (newStatus === trip_status_dto_1.TripStatus.PLANNING || newStatus === trip_status_dto_1.TripStatus.IN_PROGRESS)) {
            throw new common_1.BadRequestException('已完成的行程不能改回规划中或进行中状态');
        }
        if (currentStatus === trip_status_dto_1.TripStatus.IN_PROGRESS && newStatus === trip_status_dto_1.TripStatus.PLANNING) {
            throw new common_1.BadRequestException('进行中的行程不能改回规划中状态。如需重新规划，请使用规划工作台功能');
        }
    }
    async update(id, dto) {
        const existingTrip = await this.prisma.trip.findUnique({
            where: { id },
        });
        if (!existingTrip) {
            throw new common_1.NotFoundException(`行程 ID ${id} 不存在`);
        }
        const updateData = {};
        if (dto.destination !== undefined) {
            updateData.destination = dto.destination.toUpperCase().trim();
        }
        if (dto.startDate !== undefined) {
            updateData.startDate = new Date(dto.startDate);
        }
        if (dto.endDate !== undefined) {
            updateData.endDate = new Date(dto.endDate);
        }
        if (dto.totalBudget !== undefined) {
            const existingBudgetConfig = existingTrip.budgetConfig || {};
            updateData.budgetConfig = {
                ...existingBudgetConfig,
                totalBudget: dto.totalBudget,
            };
        }
        if (dto.travelers !== undefined) {
            const existingMetadata = existingTrip.metadata || {};
            updateData.metadata = {
                ...existingMetadata,
                travelers: dto.travelers,
            };
        }
        if (dto.status !== undefined) {
            this.validateStatusTransition(existingTrip.status, dto.status);
            updateData.status = dto.status;
        }
        if (dto.name !== undefined) {
            const trimmedName = dto.name.trim();
            if (trimmedName.length === 0) {
                const { generateDefaultTripName } = require('./utils/trip-name.util');
                updateData.name = generateDefaultTripName({
                    destination: existingTrip.destination,
                    startDate: existingTrip.startDate,
                });
            }
            else {
                updateData.name = trimmedName;
            }
        }
        if (dto.startDate || dto.endDate) {
            const startDate = dto.startDate ? new Date(dto.startDate) : existingTrip.startDate;
            const endDate = dto.endDate ? new Date(dto.endDate) : existingTrip.endDate;
            if (startDate > endDate) {
                throw new common_1.BadRequestException('开始日期不能晚于结束日期');
            }
            const start = luxon_1.DateTime.fromJSDate(startDate).startOf('day');
            const end = luxon_1.DateTime.fromJSDate(endDate).startOf('day');
            const durationDays = end.diff(start, 'days').days + 1;
            updateData.durationDays = Math.round(durationDays);
        }
        const updatedTrip = await this.prisma.trip.update({
            where: { id },
            data: updateData,
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: true,
                    },
                },
            },
        });
        return await this.enrichTripData(updatedTrip);
    }
    async enrichTripData(trip, userId) {
        var _a, _b, _c, _d;
        let totalItems = 0;
        let totalActivities = 0;
        let totalMeals = 0;
        let totalRest = 0;
        let totalTransit = 0;
        const now = new Date();
        trip.TripDay.forEach((day) => {
            totalItems += day.ItineraryItem.length;
            day.ItineraryItem.forEach((item) => {
                switch (item.type) {
                    case 'ACTIVITY':
                        totalActivities++;
                        break;
                    case 'MEAL_ANCHOR':
                    case 'MEAL_FLOATING':
                        totalMeals++;
                        break;
                    case 'REST':
                        totalRest++;
                        break;
                    case 'TRANSIT':
                        totalTransit++;
                        break;
                }
            });
        });
        let status;
        if (trip.status && Object.values(trip_status_dto_1.TripStatus).includes(trip.status)) {
            status = trip.status;
        }
        else {
            if (trip.startDate && trip.endDate) {
                const startDate = new Date(trip.startDate);
                const endDate = new Date(trip.endDate);
                if (now < startDate) {
                    status = trip_status_dto_1.TripStatus.PLANNING;
                }
                else if (now >= startDate && now <= endDate) {
                    status = trip_status_dto_1.TripStatus.IN_PROGRESS;
                }
                else {
                    status = trip_status_dto_1.TripStatus.COMPLETED;
                }
            }
            else {
                status = trip_status_dto_1.TripStatus.PLANNING;
            }
        }
        const daysWithActivities = trip.TripDay.filter((day) => day.ItineraryItem.length > 0).length;
        const budgetConfig = trip.budgetConfig;
        let budgetStats = null;
        if (budgetConfig) {
            budgetStats = {
                total: budgetConfig.total,
                currency: budgetConfig.currency || 'CNY',
                daily_budget: budgetConfig.daily_budget,
                hotel_tier_recommendation: budgetConfig.hotel_tier_recommendation,
            };
        }
        let activeAlertsCount = 0;
        let pendingTasksCount = 0;
        let pipelineStatus = null;
        try {
            const decisionLogs = await this.decisionLogStorage.queryLogs({
                tripId: trip.id,
                limit: 50,
            });
            activeAlertsCount = decisionLogs.length;
            if (!trip.pacingConfig || !trip.pacingConfig.maxDrivingHours) {
                pendingTasksCount++;
            }
            const denseDays = trip.TripDay.filter((day) => day.ItineraryItem.length > 8);
            pendingTasksCount += denseDays.length;
            const safetyAlerts = decisionLogs.filter(log => log.persona === 'ABU' && log.action === 'REJECT');
            pendingTasksCount += safetyAlerts.length;
            const hasRoute = trip.metadata && trip.metadata.routeDirectionId;
            const totalItems = trip.TripDay.reduce((sum, day) => sum + day.ItineraryItem.length, 0);
            pipelineStatus = {
                stages: [
                    {
                        id: '1',
                        name: '明确旅行目标',
                        status: trip.destination && trip.startDate && trip.endDate ? 'completed' : 'pending',
                    },
                    {
                        id: '2',
                        name: '判断路线是否成立',
                        status: hasRoute ? 'completed' : 'in-progress',
                    },
                    {
                        id: '3',
                        name: '生成可执行日程',
                        status: totalItems > 0 ? 'in-progress' : 'pending',
                    },
                    {
                        id: '4',
                        name: '风险评估与缓冲',
                        status: safetyAlerts.length > 0 ? 'risk' : (totalItems > 0 ? 'in-progress' : 'pending'),
                    },
                    {
                        id: '5',
                        name: 'Plan B 备选系统',
                        status: 'pending',
                    },
                    {
                        id: '6',
                        name: '行前准备清单',
                        status: 'pending',
                    },
                ],
            };
        }
        catch (error) {
            console.error('Failed to enrich trip data:', error);
        }
        const likeCount = ((_a = trip._count) === null || _a === void 0 ? void 0 : _a.TripLike) || 0;
        const isLiked = userId ? (((_b = trip.TripLike) === null || _b === void 0 ? void 0 : _b.length) > 0) : false;
        const isCollected = userId ? (((_c = trip.TripCollection) === null || _c === void 0 ? void 0 : _c.length) > 0) : false;
        const { _count, TripLike, TripCollection, ...tripData } = trip;
        const metadata = tripData.metadata || {};
        const dayThemes = metadata.dayThemes || {};
        const transformedTripDays = (_d = tripData.TripDay) === null || _d === void 0 ? void 0 : _d.map((day, index) => {
            var _a;
            const dayNumber = index + 1;
            const theme = dayThemes[dayNumber] || day.theme || null;
            return {
                ...day,
                theme: theme,
                ItineraryItem: (_a = day.ItineraryItem) === null || _a === void 0 ? void 0 : _a.map((item) => {
                    var _a;
                    const isRequired = ((_a = item.note) === null || _a === void 0 ? void 0 : _a.includes('[必游]')) || false;
                    return {
                        ...item,
                        Place: item.Place ? (0, place_response_dto_1.toPlaceResponseDto)(item.Place) : null,
                        crossDayInfo: this.calculateCrossDayInfo(item, day.date),
                        isRequired: isRequired,
                    };
                }),
            };
        });
        return {
            ...tripData,
            TripDay: transformedTripDays,
            status: status,
            isLiked,
            isCollected,
            likeCount,
            stats: {
                totalDays: trip.TripDay.length,
                daysWithActivities: daysWithActivities,
                totalItems: totalItems,
                totalActivities: totalActivities,
                totalMeals: totalMeals,
                totalRest: totalRest,
                totalTransit: totalTransit,
                progress: status,
                budgetStats: budgetStats,
            },
            pipelineStatus,
            activeAlertsCount,
            pendingTasksCount,
        };
    }
    calculateCrossDayInfo(item, tripDayDate) {
        const startDate = luxon_1.DateTime.fromJSDate(new Date(item.startTime), { zone: 'utc' });
        const endDate = luxon_1.DateTime.fromJSDate(new Date(item.endTime), { zone: 'utc' });
        const startDay = startDate.startOf('day');
        const endDay = endDate.startOf('day');
        const crossDays = Math.floor(endDay.diff(startDay, 'days').days);
        const isCrossDay = crossDays > 0;
        const isCheckoutItem = false;
        const timeLabels = this.getTimeLabelsForType(item.type, isCheckoutItem);
        return {
            isCrossDay,
            crossDays,
            isCheckoutItem,
            displayMode: isCrossDay ? 'checkin' : 'normal',
            timeLabels,
        };
    }
    getTimeLabelsForType(itemType, isCheckoutItem) {
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
    async getTripState(tripId, nowISO) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
                            },
                            orderBy: { startTime: 'asc' },
                        },
                    },
                    orderBy: { date: 'asc' },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const now = nowISO ? luxon_1.DateTime.fromISO(nowISO) : luxon_1.DateTime.now();
        const timezone = 'Asia/Tokyo';
        let currentDayId = null;
        let currentItemId = null;
        let nextStop = null;
        for (const day of trip.TripDay) {
            const dayDate = luxon_1.DateTime.fromJSDate(day.date);
            if (dayDate.hasSame(now, 'day')) {
                currentDayId = day.id;
                for (const item of day.ItineraryItem) {
                    if (!item.startTime || !item.endTime)
                        continue;
                    const startTime = luxon_1.DateTime.fromJSDate(item.startTime);
                    const endTime = luxon_1.DateTime.fromJSDate(item.endTime);
                    if (now >= startTime && now <= endTime) {
                        currentItemId = item.id;
                    }
                    else if (now < startTime && !nextStop) {
                        nextStop = await this.buildNextStopInfo(item, startTime);
                        break;
                    }
                }
                if (!currentItemId && !nextStop && day.ItineraryItem.length > 0) {
                    const firstItem = day.ItineraryItem.find(item => item.startTime && luxon_1.DateTime.fromJSDate(item.startTime) > now);
                    if (firstItem && firstItem.startTime) {
                        const startTime = luxon_1.DateTime.fromJSDate(firstItem.startTime);
                        nextStop = await this.buildNextStopInfo(firstItem, startTime);
                    }
                }
                break;
            }
        }
        return {
            currentDayId,
            currentItemId,
            nextStop,
            timezone,
            now: now.toISO(),
        };
    }
    async buildNextStopInfo(item, startTime) {
        var _a, _b;
        const place = item.Place;
        if (!place) {
            return {
                itemId: item.id,
                placeId: item.placeId,
                placeName: '未知地点',
                startTime: startTime.toISO(),
                estimatedArrivalTime: startTime.toISO(),
            };
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
                this.logger.debug(`[buildNextStopInfo] 从 PostGIS 提取坐标成功: Place ${place.id}, lat=${latitude}, lng=${longitude}`);
            }
            else {
                this.logger.debug(`[buildNextStopInfo] Place ${place.id} PostGIS location 字段为空或查询无结果`);
            }
        }
        catch (error) {
            this.logger.debug(`[buildNextStopInfo] PostGIS 查询失败: Place ${place.id}, error: ${error.message}`);
        }
        if (!latitude || !longitude) {
            const metadata = place.metadata || {};
            if (metadata.lat && metadata.lng) {
                latitude = Number(metadata.lat);
                longitude = Number(metadata.lng);
                this.logger.debug(`[buildNextStopInfo] 从 metadata.lat/lng 提取坐标成功: Place ${place.id}, lat=${latitude}, lng=${longitude}`);
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
        const metadata = place.metadata || {};
        let businessHours = undefined;
        if (metadata.openingHours || metadata.opening_hours) {
            const openingHours = metadata.openingHours || metadata.opening_hours;
            const timezone = metadata.timezone || 'Asia/Tokyo';
            let todayHours = opening_hours_util_1.OpeningHoursUtil.getTodayHours(metadata, timezone);
            if (typeof todayHours !== 'string') {
                if (Array.isArray(todayHours) && todayHours.length > 0) {
                    todayHours = typeof todayHours[0] === 'string' ? todayHours[0] : String(todayHours[0]);
                }
                else {
                    todayHours = String(todayHours);
                }
            }
            todayHours = String(todayHours);
            try {
                if (todayHours && todayHours !== 'Closed' && todayHours !== 'undefined' && todayHours !== 'null' && typeof todayHours === 'string') {
                    const parts = todayHours.split('-');
                    if (parts.length >= 2) {
                        businessHours = {
                            open: (_a = parts[0]) === null || _a === void 0 ? void 0 : _a.trim(),
                            close: (_b = parts[1]) === null || _b === void 0 ? void 0 : _b.trim(),
                            timezone: timezone,
                            raw: openingHours,
                        };
                    }
                    else {
                        businessHours = {
                            timezone: timezone,
                            raw: openingHours,
                            formatted: todayHours,
                        };
                    }
                }
                else {
                    businessHours = {
                        timezone: timezone,
                        raw: openingHours,
                    };
                }
            }
            catch (error) {
                this.logger.warn(`无法解析营业时间: ${error.message}, todayHours类型: ${typeof todayHours}, 值: ${todayHours}`);
                businessHours = {
                    timezone: timezone,
                    raw: openingHours,
                };
            }
        }
        if (!latitude || !longitude) {
            const metadata = place.metadata || {};
            this.logger.warn(`[buildNextStopInfo] Place ${place.id} (${place.nameEN || place.nameCN}) 无法提取坐标: ` +
                `location=${!!place.location}, ` +
                `metadata.lat=${metadata.lat || 'N/A'}, ` +
                `metadata.lng=${metadata.lng || 'N/A'}, ` +
                `metadata.coordinates=${metadata.coordinates ? JSON.stringify(metadata.coordinates) : 'N/A'}`);
        }
        else {
            this.logger.debug(`[buildNextStopInfo] Place ${place.id} 坐标提取成功: lat=${latitude}, lng=${longitude}`);
        }
        return {
            itemId: item.id,
            placeId: item.placeId,
            placeName: place.nameEN || place.nameCN || '未知地点',
            startTime: startTime.toISO(),
            estimatedArrivalTime: startTime.toISO(),
            Place: {
                id: place.id,
                nameEN: place.nameEN || undefined,
                nameCN: place.nameCN || undefined,
                latitude: latitude !== null && latitude !== void 0 ? latitude : null,
                longitude: longitude !== null && longitude !== void 0 ? longitude : null,
                address: place.address || undefined,
                category: place.category || undefined,
                rating: place.rating || undefined,
                businessHours: businessHours,
                metadata: place.metadata || undefined,
                ...(latitude && longitude ? {} : {
                    lat: latitude !== null && latitude !== void 0 ? latitude : null,
                    lng: longitude !== null && longitude !== void 0 ? longitude : null,
                }),
            },
        };
    }
    async getSchedule(tripId, dateISO) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: true,
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const date = luxon_1.DateTime.fromISO(dateISO);
        const tripDay = trip.TripDay.find(day => {
            const dayDate = luxon_1.DateTime.fromJSDate(day.date);
            return dayDate.hasSame(date, 'day');
        });
        if (!tripDay) {
            return {
                date: dateISO,
                schedule: null,
                persisted: false,
            };
        }
        const schedule = await this.scheduleConverter.loadScheduleFromDatabase(tripDay.id, dateISO);
        return {
            date: dateISO,
            schedule,
            persisted: schedule !== null,
        };
    }
    async saveSchedule(tripId, dateISO, schedule) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: true,
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const date = luxon_1.DateTime.fromISO(dateISO);
        let tripDay = trip.TripDay.find(day => {
            const dayDate = luxon_1.DateTime.fromJSDate(day.date);
            return dayDate.hasSame(date, 'day');
        });
        if (!tripDay) {
            tripDay = await this.prisma.tripDay.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    date: date.toJSDate(),
                    tripId: trip.id,
                },
            });
        }
        await this.scheduleConverter.saveScheduleToDatabase(tripId, tripDay.id, schedule, dateISO);
        return {
            date: dateISO,
            schedule,
            persisted: true,
        };
    }
    async getActionHistory(tripId, dateISO) {
        return this.actionHistory.getActionHistory(tripId, dateISO);
    }
    async undoAction(tripId, dateISO) {
        return this.actionHistory.undoAction(tripId, dateISO);
    }
    async redoAction(tripId, dateISO) {
        return this.actionHistory.redoAction(tripId, dateISO);
    }
    async remove(id, confirmText) {
        const trip = await this.prisma.trip.findUnique({
            where: { id },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${id} 不存在`);
        }
        if (confirmText.trim().toUpperCase() !== trip.destination.toUpperCase()) {
            throw new common_1.BadRequestException(`确认文字不匹配。请输入目的地国家代码"${trip.destination}"来确认删除。`);
        }
        await this.prisma.$transaction(async (tx) => {
            const tripDays = await tx.tripDay.findMany({
                where: { tripId: id },
                select: { id: true },
            });
            const tripDayIds = tripDays.map(day => day.id);
            if (tripDayIds.length > 0) {
                await tx.itineraryItem.deleteMany({
                    where: { tripDayId: { in: tripDayIds } },
                });
            }
            await tx.tripDay.deleteMany({
                where: { tripId: id },
            });
            await tx.tripOfflinePack.deleteMany({
                where: { tripId: id },
            });
            await tx.trip.delete({
                where: { id },
            });
        });
        return { message: '行程删除成功' };
    }
    async getPersonaAlerts(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const decisionLogs = await this.decisionLogStorage.queryLogs({
            tripId,
            limit: 50,
        });
        const alerts = [];
        const personaNames = {
            ABU: 'Abu',
            DR_DRE: 'Dr.Dre',
            NEPTUNE: 'Neptune',
        };
        const personaTitles = {
            ABU: '安全守护者 Abu（北极熊 🐻‍❄️）',
            DR_DRE: '节奏设计师 Dr.Dre（牧羊犬 🐕）',
            NEPTUNE: '空间魔法师 Neptune（海獭 🦦）',
        };
        for (const log of decisionLogs) {
            if (this.isNoRiskEntry(log)) {
                continue;
            }
            const severity = log.action === 'REJECT' ? persona_alerts_dto_1.AlertSeverity.WARNING :
                log.action === 'ADJUST' ? persona_alerts_dto_1.AlertSeverity.INFO :
                    persona_alerts_dto_1.AlertSeverity.SUCCESS;
            let message = log.explanation;
            if (log.reasonCodes && log.reasonCodes.length > 0) {
                message += `\n相关原因：${log.reasonCodes.join('、')}`;
            }
            alerts.push({
                id: `alert-${log.timestamp}`,
                persona: log.persona,
                name: personaNames[log.persona] || log.persona,
                title: personaTitles[log.persona] || log.persona,
                message,
                severity,
                createdAt: log.timestamp,
                metadata: {
                    decisionSource: log.decisionSource,
                    action: log.action,
                    reasonCodes: log.reasonCodes,
                },
            });
        }
        if (alerts.length === 0) {
            const tripDays = await this.prisma.tripDay.findMany({
                where: { tripId },
                include: {
                    ItineraryItem: {
                        orderBy: { startTime: 'asc' },
                    },
                },
                orderBy: { date: 'asc' },
            });
            for (let i = 0; i < tripDays.length; i++) {
                const day = tripDays[i];
                const itemCount = day.ItineraryItem.length;
                if (itemCount > 8) {
                    alerts.push({
                        id: `alert-day-${i + 1}`,
                        persona: persona_alerts_dto_1.PersonaType.DR_DRE,
                        name: personaNames[persona_alerts_dto_1.PersonaType.DR_DRE],
                        title: personaTitles[persona_alerts_dto_1.PersonaType.DR_DRE],
                        message: `第 ${i + 1} 天行程稍密集\n如果你想更轻松，我建议拆成两天\n这样会舒服一点`,
                        severity: persona_alerts_dto_1.AlertSeverity.INFO,
                        createdAt: new Date().toISOString(),
                        metadata: {
                            day: i + 1,
                            suggestion: 'SPLIT_DAY',
                            itemCount,
                        },
                    });
                }
            }
        }
        return alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    async getEvidence(tripId, query) {
        var _a, _b;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
                            },
                            orderBy: { startTime: 'asc' },
                        },
                    },
                    orderBy: { date: 'asc' },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const limit = query.limit || 50;
        const offset = query.offset || 0;
        const decisionLogs = await this.decisionLogStorage.queryLogs({
            tripId,
            limit: 100,
        });
        const evidenceItems = [];
        for (const log of decisionLogs) {
            if (this.isNoRiskEntry(log)) {
                continue;
            }
            if (log.evidenceRefs && log.evidenceRefs.length > 0) {
                for (const evidenceRef of log.evidenceRefs) {
                    evidenceItems.push({
                        id: `ev-${evidenceRef}-${log.timestamp}`,
                        type: evidence_dto_1.EvidenceType.OTHER,
                        title: '决策证据',
                        description: log.explanation,
                        source: `决策日志 (${log.persona})`,
                        timestamp: log.timestamp,
                        metadata: {
                            decisionSource: log.decisionSource,
                            action: log.action,
                            reasonCodes: log.reasonCodes,
                            evidenceRef,
                        },
                    });
                }
            }
        }
        let dayIndex = 0;
        for (const tripDay of trip.TripDay) {
            dayIndex++;
            if (query.day && dayIndex !== query.day) {
                continue;
            }
            for (const item of tripDay.ItineraryItem) {
                if (item.Place) {
                    const place = item.Place;
                    const metadata = place.metadata;
                    if (metadata === null || metadata === void 0 ? void 0 : metadata.openingHours) {
                        const openingHours = metadata.openingHours;
                        const hoursStr = typeof openingHours === 'string'
                            ? openingHours
                            : JSON.stringify(openingHours);
                        evidenceItems.push({
                            id: `ev-place-${place.id}-opening-hours`,
                            type: evidence_dto_1.EvidenceType.OPENING_HOURS,
                            title: '营业时间',
                            description: `${place.nameCN || place.nameEN} 营业时间：${hoursStr}`,
                            source: 'Google Places API',
                            timestamp: ((_a = place.updatedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || new Date().toISOString(),
                            poiId: place.id.toString(),
                            day: dayIndex,
                            severity: evidence_dto_1.EvidenceSeverity.LOW,
                            metadata: {
                                placeId: place.id,
                                openingHours: metadata.openingHours,
                            },
                        });
                    }
                    if (place.rating) {
                        evidenceItems.push({
                            id: `ev-place-${place.id}-rating`,
                            type: evidence_dto_1.EvidenceType.OTHER,
                            title: '地点评分',
                            description: `${place.nameCN || place.nameEN} 评分：${place.rating}`,
                            source: 'Google Places API',
                            timestamp: ((_b = place.updatedAt) === null || _b === void 0 ? void 0 : _b.toISOString()) || new Date().toISOString(),
                            poiId: place.id.toString(),
                            day: dayIndex,
                            severity: evidence_dto_1.EvidenceSeverity.LOW,
                            metadata: {
                                placeId: place.id,
                                rating: place.rating,
                            },
                        });
                    }
                }
            }
        }
        let filteredItems = evidenceItems;
        if (query.type) {
            filteredItems = filteredItems.filter(item => item.type === query.type);
        }
        filteredItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const metadata = trip.metadata || {};
        const evidenceStatus = metadata.evidenceStatus || {};
        const placeMap = new Map();
        for (const tripDay of trip.TripDay) {
            for (const item of tripDay.ItineraryItem) {
                if (item.Place) {
                    placeMap.set(item.Place.id, item.Place);
                }
            }
        }
        const itemsWithStatus = filteredItems.map(item => {
            const statusInfo = evidenceStatus[item.id];
            if (statusInfo) {
                return {
                    ...item,
                    status: statusInfo.status,
                    userNote: statusInfo.userNote,
                    acknowledgedAt: statusInfo.acknowledgedAt,
                    resolvedAt: statusInfo.resolvedAt,
                    dismissedAt: statusInfo.dismissedAt,
                };
            }
            return {
                ...item,
                status: evidence_dto_1.EvidenceStatus.NEW,
            };
        });
        const enrichedItems = await this.evidenceManagement.enrichEvidenceItems(itemsWithStatus, placeMap);
        const priority = query.priority || evidence_dto_2.EvidencePriorityFilter.ALL;
        const groupBy = query.groupBy || evidence_dto_2.EvidenceGroupBy.NONE;
        const sortBy = query.sortBy || evidence_dto_2.EvidenceSortBy.TIME;
        const currentDay = query.day;
        const filteredAndSorted = this.evidenceFiltering.filterAndSort(enrichedItems, priority, groupBy, sortBy, currentDay);
        const total = filteredAndSorted.length;
        const paginatedItems = filteredAndSorted.slice(offset, offset + limit);
        return {
            items: paginatedItems,
            total,
            limit,
            offset,
        };
    }
    async checkEvidenceCompleteness(tripId) {
        var _a;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const places = [];
        for (const tripDay of trip.TripDay) {
            for (const item of tripDay.ItineraryItem) {
                if (item.Place) {
                    places.push(item.Place);
                }
            }
        }
        const evidenceResult = await this.getEvidence(tripId, { limit: 1000 });
        const existingEvidence = evidenceResult.items.map(item => ({
            poiId: item.poiId,
            type: item.type,
        }));
        return this.evidenceCompletenessChecker.checkCompleteness(places, existingEvidence, (_a = trip.startDate) === null || _a === void 0 ? void 0 : _a.toISOString());
    }
    async getEvidenceFetchSuggestions(tripId) {
        return this.evidenceTrigger.checkAndSuggest(tripId);
    }
    async shouldAutoTriggerEvidenceFetch(tripId, threshold = 0.7) {
        return this.evidenceTrigger.shouldAutoTrigger(tripId, threshold);
    }
    async validateEvidenceAccess(tripId, userId) {
        var _a;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripCollaborator: true,
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        if (!userId) {
            this.logger.warn(`未提供userId，跳过权限检查（仅用于测试）`);
            return;
        }
        const collaborator = (_a = trip.TripCollaborator) === null || _a === void 0 ? void 0 : _a.find((c) => c.userId === userId && (c.role === 'OWNER' || c.role === 'EDITOR'));
        if (!collaborator) {
            throw new common_1.ForbiddenException('无权修改该行程的证据，只有OWNER和EDITOR可以修改');
        }
    }
    validateEvidenceStatusTransition(currentStatus, newStatus) {
        const ALLOWED_TRANSITIONS = {
            [evidence_dto_1.EvidenceStatus.NEW]: [evidence_dto_1.EvidenceStatus.ACKNOWLEDGED, evidence_dto_1.EvidenceStatus.RESOLVED, evidence_dto_1.EvidenceStatus.DISMISSED],
            [evidence_dto_1.EvidenceStatus.ACKNOWLEDGED]: [evidence_dto_1.EvidenceStatus.RESOLVED, evidence_dto_1.EvidenceStatus.DISMISSED],
            [evidence_dto_1.EvidenceStatus.RESOLVED]: [],
            [evidence_dto_1.EvidenceStatus.DISMISSED]: [evidence_dto_1.EvidenceStatus.ACKNOWLEDGED],
        };
        const current = currentStatus || evidence_dto_1.EvidenceStatus.NEW;
        const allowed = ALLOWED_TRANSITIONS[current] || [];
        return allowed.includes(newStatus);
    }
    getEvidenceStatus(trip, evidenceId) {
        var _a;
        const metadata = trip.metadata || {};
        const evidenceStatus = metadata.evidenceStatus || {};
        return (_a = evidenceStatus[evidenceId]) === null || _a === void 0 ? void 0 : _a.status;
    }
    async updateEvidenceStatus(tripId, evidenceId, status, userNote, userId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const metadata = trip.metadata || {};
        const evidenceStatus = metadata.evidenceStatus || {};
        const now = new Date().toISOString();
        evidenceStatus[evidenceId] = {
            status,
            updatedAt: now,
            ...(userNote && { userNote }),
            ...(status === evidence_dto_1.EvidenceStatus.ACKNOWLEDGED && { acknowledgedAt: now }),
            ...(status === evidence_dto_1.EvidenceStatus.RESOLVED && { resolvedAt: now }),
            ...(status === evidence_dto_1.EvidenceStatus.DISMISSED && {
                dismissedAt: now,
                dismissedBy: userId,
            }),
        };
        await this.prisma.trip.update({
            where: { id: tripId },
            data: {
                metadata: {
                    ...metadata,
                    evidenceStatus,
                },
            },
        });
    }
    async updateEvidence(tripId, evidenceId, dto, userId) {
        await this.validateEvidenceAccess(tripId, userId);
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const evidenceQuery = { limit: 1000 };
        const evidenceList = await this.getEvidence(tripId, evidenceQuery);
        const evidence = evidenceList.items.find((item) => item.id === evidenceId);
        if (!evidence) {
            throw new common_1.NotFoundException(`证据项 ${evidenceId} 不存在`);
        }
        if (dto.status) {
            const currentStatus = this.getEvidenceStatus(trip, evidenceId);
            if (!this.validateEvidenceStatusTransition(currentStatus, dto.status)) {
                throw new common_1.BadRequestException(`不允许的状态转换：${currentStatus || evidence_dto_1.EvidenceStatus.NEW} → ${dto.status}`);
            }
        }
        const status = dto.status || this.getEvidenceStatus(trip, evidenceId) || evidence_dto_1.EvidenceStatus.NEW;
        await this.updateEvidenceStatus(tripId, evidenceId, status, dto.userNote, userId);
        return {
            evidenceId,
            status,
            updatedAt: new Date().toISOString(),
            userNote: dto.userNote,
        };
    }
    async batchUpdateEvidence(tripId, dto, userId) {
        await this.validateEvidenceAccess(tripId, userId);
        if (dto.updates.length > 100) {
            throw new common_1.BadRequestException('批量更新最多支持100个证据项');
        }
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const evidenceQuery = { limit: 1000 };
        const evidenceList = await this.getEvidence(tripId, evidenceQuery);
        const evidenceMap = new Map(evidenceList.items.map((item) => [item.id, item]));
        const errors = [];
        let updatedCount = 0;
        for (const update of dto.updates) {
            try {
                if (!evidenceMap.has(update.evidenceId)) {
                    errors.push({
                        evidenceId: update.evidenceId,
                        error: '证据项不存在',
                    });
                    continue;
                }
                if (update.status) {
                    const currentStatus = this.getEvidenceStatus(trip, update.evidenceId);
                    if (!this.validateEvidenceStatusTransition(currentStatus, update.status)) {
                        errors.push({
                            evidenceId: update.evidenceId,
                            error: `不允许的状态转换：${currentStatus || evidence_dto_1.EvidenceStatus.NEW} → ${update.status}`,
                        });
                        continue;
                    }
                }
                const status = update.status || this.getEvidenceStatus(trip, update.evidenceId) || evidence_dto_1.EvidenceStatus.NEW;
                await this.updateEvidenceStatus(tripId, update.evidenceId, status, update.userNote, userId);
                updatedCount++;
            }
            catch (error) {
                errors.push({
                    evidenceId: update.evidenceId,
                    error: error.message || '更新失败',
                });
            }
        }
        return {
            updated: updatedCount,
            failed: errors.length,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    async getAttentionQueue(query) {
        const limit = query.limit || 20;
        const offset = query.offset || 0;
        const attentionItems = [];
        if (query.tripId) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(query.tripId)) {
                this.logger.warn(`无效的 tripId 格式: ${query.tripId}，返回空结果`);
                return {
                    items: [],
                    total: 0,
                    limit,
                    offset,
                };
            }
            try {
                const alerts = await this.getPersonaAlerts(query.tripId);
                for (const alert of alerts) {
                    let severity;
                    if (alert.severity === persona_alerts_dto_1.AlertSeverity.WARNING) {
                        severity = attention_queue_dto_1.AttentionSeverity.HIGH;
                    }
                    else if (alert.severity === persona_alerts_dto_1.AlertSeverity.INFO) {
                        severity = attention_queue_dto_1.AttentionSeverity.MEDIUM;
                    }
                    else {
                        severity = attention_queue_dto_1.AttentionSeverity.LOW;
                    }
                    let type;
                    if (alert.persona === persona_alerts_dto_1.PersonaType.ABU) {
                        type = attention_queue_dto_1.AttentionItemType.SAFETY_RISK;
                    }
                    else if (alert.persona === persona_alerts_dto_1.PersonaType.DR_DRE) {
                        type = attention_queue_dto_1.AttentionItemType.SCHEDULE_CONFLICT;
                    }
                    else {
                        type = attention_queue_dto_1.AttentionItemType.OTHER;
                    }
                    attentionItems.push({
                        id: alert.id,
                        type,
                        title: alert.title,
                        description: alert.message,
                        tripId: query.tripId,
                        severity,
                        createdAt: alert.createdAt,
                        status: attention_queue_dto_1.AttentionStatus.NEW,
                        metadata: {
                            ...alert.metadata,
                            persona: alert.persona,
                        },
                    });
                }
            }
            catch (error) {
                if (error instanceof common_1.NotFoundException) {
                    this.logger.warn(`行程 ID ${query.tripId} 不存在，返回空关注队列`);
                    return {
                        items: [],
                        total: 0,
                        limit,
                        offset,
                    };
                }
                throw error;
            }
        }
        else {
            const trips = await this.prisma.trip.findMany({
                take: 10,
                orderBy: { updatedAt: 'desc' },
                select: { id: true },
            });
            for (const trip of trips) {
                try {
                    const alerts = await this.getPersonaAlerts(trip.id);
                    for (const alert of alerts) {
                        let severity;
                        if (alert.severity === persona_alerts_dto_1.AlertSeverity.WARNING) {
                            severity = attention_queue_dto_1.AttentionSeverity.HIGH;
                        }
                        else if (alert.severity === persona_alerts_dto_1.AlertSeverity.INFO) {
                            severity = attention_queue_dto_1.AttentionSeverity.MEDIUM;
                        }
                        else {
                            severity = attention_queue_dto_1.AttentionSeverity.LOW;
                        }
                        let type;
                        if (alert.persona === persona_alerts_dto_1.PersonaType.ABU) {
                            type = attention_queue_dto_1.AttentionItemType.SAFETY_RISK;
                        }
                        else if (alert.persona === persona_alerts_dto_1.PersonaType.DR_DRE) {
                            type = attention_queue_dto_1.AttentionItemType.SCHEDULE_CONFLICT;
                        }
                        else {
                            type = attention_queue_dto_1.AttentionItemType.OTHER;
                        }
                        attentionItems.push({
                            id: `${trip.id}-${alert.id}`,
                            type,
                            title: alert.title,
                            description: alert.message,
                            tripId: trip.id,
                            severity,
                            createdAt: alert.createdAt,
                            status: attention_queue_dto_1.AttentionStatus.NEW,
                            metadata: {
                                ...alert.metadata,
                                persona: alert.persona,
                                actionUrl: `/dashboard/trips/${trip.id}`,
                            },
                        });
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
        let filteredItems = attentionItems;
        if (query.severity) {
            filteredItems = filteredItems.filter(item => item.severity === query.severity);
        }
        if (query.type) {
            filteredItems = filteredItems.filter(item => item.type === query.type);
        }
        const severityOrder = {
            [attention_queue_dto_1.AttentionSeverity.CRITICAL]: 4,
            [attention_queue_dto_1.AttentionSeverity.HIGH]: 3,
            [attention_queue_dto_1.AttentionSeverity.MEDIUM]: 2,
            [attention_queue_dto_1.AttentionSeverity.LOW]: 1,
        };
        filteredItems.sort((a, b) => {
            const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
            if (severityDiff !== 0)
                return severityDiff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        const total = filteredItems.length;
        const paginatedItems = filteredItems.slice(offset, offset + limit);
        return {
            items: paginatedItems,
            total,
            limit,
            offset,
        };
    }
    async getDecisionLog(tripId, limit = 10, offset = 0) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const allLogs = await this.prisma.decisionLog.findMany({
            where: { tripId },
            orderBy: { timestamp: 'desc' },
        });
        const filteredLogs = allLogs.filter(log => !this.isNoRiskEntry(log));
        const total = filteredLogs.length;
        const paginatedLogs = filteredLogs.slice(offset, offset + limit);
        const items = paginatedLogs.map(log => ({
            id: log.id,
            date: log.timestamp.toISOString(),
            description: log.explanation,
            source: log.decisionSource,
            persona: log.persona,
            action: log.action,
            metadata: {
                reasonCodes: log.reasonCodes,
                evidenceRefs: log.evidenceRefs,
                ...(log.metadata || {}),
            },
        }));
        return {
            items,
            total,
            limit,
            offset,
        };
    }
    isNoRiskEntry(log) {
        if (log.action !== 'ALLOW') {
            return false;
        }
        const explanation = log.explanation || '';
        const noRiskKeywords = [
            '未发现',
            '无需',
            '均在可接受范围内',
            '允许继续',
            '无问题',
            '没有问题',
            '未发现问题',
        ];
        return noRiskKeywords.some(keyword => explanation.includes(keyword));
    }
    async getTasks(tripId) {
        var _a;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: true,
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const tasks = [];
        if (!trip.pacingConfig || !trip.pacingConfig.maxDrivingHours) {
            tasks.push({
                id: `task-preference-1`,
                text: '确认你能接受的最长驾驶时长',
                completed: false,
                priority: tasks_dto_1.TaskPriority.HIGH,
                category: tasks_dto_1.TaskCategory.PREFERENCE,
                route: `/dashboard/trips/${tripId}`,
                metadata: {
                    relatedField: 'maxDrivingHours',
                },
            });
        }
        for (let i = 0; i < trip.TripDay.length; i++) {
            const day = trip.TripDay[i];
            if (day.ItineraryItem.length > 8) {
                tasks.push({
                    id: `task-schedule-${i + 1}`,
                    text: `选择第 ${i + 1} 天住宿位置偏好`,
                    completed: false,
                    priority: tasks_dto_1.TaskPriority.MEDIUM,
                    category: tasks_dto_1.TaskCategory.SCHEDULE,
                    route: `/dashboard/trips/${tripId}/schedule`,
                    metadata: {
                        day: i + 1,
                    },
                });
            }
        }
        const alerts = await this.getPersonaAlerts(tripId);
        const safetyAlerts = alerts.filter(a => a.persona === persona_alerts_dto_1.PersonaType.ABU && a.severity === persona_alerts_dto_1.AlertSeverity.WARNING);
        for (const alert of safetyAlerts) {
            if ((_a = alert.metadata) === null || _a === void 0 ? void 0 : _a.roadId) {
                tasks.push({
                    id: `task-safety-${alert.id}`,
                    text: `查看 ${alert.metadata.roadId} 道路通行建议`,
                    completed: false,
                    priority: tasks_dto_1.TaskPriority.HIGH,
                    category: tasks_dto_1.TaskCategory.SAFETY,
                    route: `/dashboard/trips/${tripId}/decision`,
                    metadata: {
                        roadId: alert.metadata.roadId,
                        alertId: alert.id,
                    },
                });
            }
        }
        return tasks;
    }
    async updateTaskStatus(tripId, taskId, completed) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const tasks = await this.getTasks(tripId);
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
            throw new common_1.NotFoundException(`任务 ID ${taskId} 不存在`);
        }
        task.completed = completed;
        return task;
    }
    async getPipelineStatus(tripId) {
        var _a;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: true,
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const stages = [];
        stages.push({
            id: '1',
            name: '明确旅行目标',
            status: trip.destination && trip.startDate && trip.endDate ? pipeline_status_dto_1.PipelineStageStatus.COMPLETED : pipeline_status_dto_1.PipelineStageStatus.PENDING,
            completedAt: (_a = trip.createdAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
        });
        const hasRoute = trip.metadata && trip.metadata.routeDirectionId;
        stages.push({
            id: '2',
            name: '判断路线是否成立',
            status: hasRoute ? pipeline_status_dto_1.PipelineStageStatus.COMPLETED : pipeline_status_dto_1.PipelineStageStatus.IN_PROGRESS,
        });
        const totalItems = trip.TripDay.reduce((sum, day) => sum + day.ItineraryItem.length, 0);
        const daysWithItems = trip.TripDay.filter(day => day.ItineraryItem.length > 0).length;
        let stage3Status = pipeline_status_dto_1.PipelineStageStatus.PENDING;
        let stage3Summary = '';
        if (totalItems > 0) {
            stage3Status = pipeline_status_dto_1.PipelineStageStatus.IN_PROGRESS;
            const avgItemsPerDay = totalItems / trip.TripDay.length;
            const denseDays = trip.TripDay.filter(day => day.ItineraryItem.length > 8);
            stage3Summary = `建议驾驶时长：每天 3–5 小时\n`;
            stage3Summary += `已安排活动：${totalItems} 个（${daysWithItems}/${trip.TripDay.length} 天）\n`;
            if (denseDays.length > 0) {
                stage3Summary += `🚨 第 ${denseDays.map((_, idx) => trip.TripDay.indexOf(denseDays[idx]) + 1).join('、')} 天稍紧张`;
            }
            else {
                stage3Summary += `疲劳指数：中`;
            }
        }
        stages.push({
            id: '3',
            name: '生成可执行日程',
            status: stage3Status,
            summary: stage3Summary || undefined,
        });
        let alerts = [];
        try {
            alerts = await this.getPersonaAlerts(tripId);
        }
        catch (error) {
            this.logger.warn(`获取 Persona Alerts 失败: ${error.message}`);
            alerts = [];
        }
        const riskAlerts = alerts.filter(a => a.severity === persona_alerts_dto_1.AlertSeverity.WARNING);
        stages.push({
            id: '4',
            name: '风险评估与缓冲',
            status: riskAlerts.length > 0 ? pipeline_status_dto_1.PipelineStageStatus.RISK : (totalItems > 0 ? pipeline_status_dto_1.PipelineStageStatus.IN_PROGRESS : pipeline_status_dto_1.PipelineStageStatus.PENDING),
        });
        stages.push({
            id: '5',
            name: 'Plan B 备选系统',
            status: pipeline_status_dto_1.PipelineStageStatus.PENDING,
        });
        const now = new Date();
        const startDate = new Date(trip.startDate);
        const daysUntilTrip = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        stages.push({
            id: '6',
            name: '行前准备清单',
            status: daysUntilTrip <= 7 && daysUntilTrip > 0 ? pipeline_status_dto_1.PipelineStageStatus.IN_PROGRESS : pipeline_status_dto_1.PipelineStageStatus.PENDING,
        });
        return { stages };
    }
    async findAllAdmin(query) {
        const page = query.page || 1;
        const limit = Math.min(query.limit || 20, 100);
        const skip = (page - 1) * limit;
        const where = {};
        if (query.status) {
            where.status = query.status;
        }
        if (query.destination) {
            where.destination = query.destination.toUpperCase();
        }
        if (query.startDateFrom || query.startDateTo) {
            where.startDate = {};
            if (query.startDateFrom) {
                where.startDate.gte = new Date(query.startDateFrom);
            }
            if (query.startDateTo) {
                where.startDate.lte = new Date(query.startDateTo);
            }
        }
        if (query.createdAtFrom || query.createdAtTo) {
            where.createdAt = {};
            if (query.createdAtFrom) {
                where.createdAt.gte = new Date(query.createdAtFrom);
            }
            if (query.createdAtTo) {
                where.createdAt.lte = new Date(query.createdAtTo);
            }
        }
        if (query.userId) {
            where.TripCollaborator = {
                some: {
                    userId: query.userId,
                    role: 'OWNER',
                },
            };
        }
        if (query.search) {
            const searchTerm = query.search.toLowerCase();
            where.OR = [
                { destination: { contains: searchTerm, mode: 'insensitive' } },
                {
                    TripCollaborator: {
                        some: {
                            role: 'OWNER',
                            User: {
                                OR: [
                                    { email: { contains: searchTerm, mode: 'insensitive' } },
                                    { displayName: { contains: searchTerm, mode: 'insensitive' } },
                                ],
                            },
                        },
                    },
                },
            ];
        }
        const sortBy = query.sortBy || 'createdAt';
        const sortOrder = query.sortOrder || 'desc';
        const orderBy = {};
        orderBy[sortBy] = sortOrder;
        const [trips, total] = await Promise.all([
            this.prisma.trip.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                include: {
                    TripCollaborator: {
                        where: { role: 'OWNER' },
                        take: 1,
                    },
                    TripDay: {
                        include: {
                            ItineraryItem: true,
                        },
                    },
                    _count: {
                        select: {
                            TripDay: true,
                            TripCollection: true,
                            TripLike: true,
                            TripShare: true,
                            TripCollaborator: true,
                        },
                    },
                },
            }),
            this.prisma.trip.count({ where }),
        ]);
        const items = trips.map((trip) => {
            var _a, _b;
            const ownerCollaborator = ((_a = trip.TripCollaborator) === null || _a === void 0 ? void 0 : _a[0]) || null;
            const owner = ownerCollaborator ? {
                userId: ownerCollaborator.userId,
                role: ownerCollaborator.role,
            } : null;
            const daysCount = trip._count.TripDay || 0;
            const itemsCount = ((_b = trip.TripDay) === null || _b === void 0 ? void 0 : _b.reduce((sum, day) => { var _a; return sum + (((_a = day.ItineraryItem) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0)) || 0;
            return {
                id: trip.id,
                destination: trip.destination,
                startDate: trip.startDate,
                endDate: trip.endDate,
                status: trip.status,
                durationDays: Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1,
                budgetConfig: trip.budgetConfig,
                pacingConfig: trip.pacingConfig,
                createdAt: trip.createdAt,
                updatedAt: trip.updatedAt,
                owner: owner ? {
                    userId: owner.userId,
                    role: owner.role,
                } : null,
                stats: {
                    daysCount,
                    itemsCount,
                    collaboratorsCount: trip._count.TripCollaborator || 0,
                    likesCount: trip._count.TripLike || 0,
                    collectionsCount: trip._count.TripCollection || 0,
                    sharesCount: trip._count.TripShare || 0,
                },
            };
        });
        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async getAdminStats(query) {
        var _a;
        const startDate = query.startDate ? new Date(query.startDate) : null;
        const endDate = query.endDate ? new Date(query.endDate) : null;
        const destination = (_a = query.destination) === null || _a === void 0 ? void 0 : _a.toUpperCase();
        const where = {};
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = startDate;
            if (endDate)
                where.createdAt.lte = endDate;
        }
        if (destination) {
            where.destination = destination;
        }
        const [totalTrips, planningTrips, inProgressTrips, completedTrips, cancelledTrips] = await Promise.all([
            this.prisma.trip.count({ where }),
            this.prisma.trip.count({ where: { ...where, status: 'PLANNING' } }),
            this.prisma.trip.count({ where: { ...where, status: 'IN_PROGRESS' } }),
            this.prisma.trip.count({ where: { ...where, status: 'COMPLETED' } }),
            this.prisma.trip.count({ where: { ...where, status: 'CANCELLED' } }),
        ]);
        const byStatus = {
            PLANNING: { count: planningTrips, percentage: totalTrips > 0 ? (planningTrips / totalTrips) * 100 : 0 },
            IN_PROGRESS: { count: inProgressTrips, percentage: totalTrips > 0 ? (inProgressTrips / totalTrips) * 100 : 0 },
            COMPLETED: { count: completedTrips, percentage: totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0 },
            CANCELLED: { count: cancelledTrips, percentage: totalTrips > 0 ? (cancelledTrips / totalTrips) * 100 : 0 },
        };
        const destinations = await this.prisma.trip.groupBy({
            by: ['destination'],
            where,
            _count: true,
        });
        const byDestination = {};
        destinations.forEach((d) => {
            byDestination[d.destination] = {
                count: d._count,
                percentage: totalTrips > 0 ? (d._count / totalTrips) * 100 : 0,
            };
        });
        const now = new Date();
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        const lastYear = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        const [last7DaysCount, last30DaysCount, last90DaysCount, lastYearCount] = await Promise.all([
            this.prisma.trip.count({ where: { ...where, createdAt: { gte: last7Days } } }),
            this.prisma.trip.count({ where: { ...where, createdAt: { gte: last30Days } } }),
            this.prisma.trip.count({ where: { ...where, createdAt: { gte: last90Days } } }),
            this.prisma.trip.count({ where: { ...where, createdAt: { gte: lastYear } } }),
        ]);
        const [last7DaysNew, last30DaysNew, last90DaysNew, lastYearNew] = await Promise.all([
            this.prisma.trip.count({ where: { createdAt: { gte: last7Days } } }),
            this.prisma.trip.count({ where: { createdAt: { gte: last30Days } } }),
            this.prisma.trip.count({ where: { createdAt: { gte: last90Days } } }),
            this.prisma.trip.count({ where: { createdAt: { gte: lastYear } } }),
        ]);
        const tripsWithDays = await this.prisma.trip.findMany({
            where,
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: true,
                    },
                },
                TripCollaborator: true,
                TripLike: true,
                TripCollection: true,
                TripShare: true,
            },
        });
        const totalDays = tripsWithDays.reduce((sum, t) => sum + t.TripDay.length, 0);
        const totalItems = tripsWithDays.reduce((sum, t) => sum + t.TripDay.reduce((s, d) => s + d.ItineraryItem.length, 0), 0);
        const totalCollaborators = tripsWithDays.reduce((sum, t) => sum + t.TripCollaborator.length, 0);
        const totalLikes = tripsWithDays.reduce((sum, t) => sum + t.TripLike.length, 0);
        const totalCollections = tripsWithDays.reduce((sum, t) => sum + t.TripCollection.length, 0);
        const totalShares = tripsWithDays.reduce((sum, t) => sum + t.TripShare.length, 0);
        const tripsWithBudget = await this.prisma.trip.findMany({
            where,
            select: {
                budgetConfig: true,
            },
        });
        const budgets = tripsWithBudget
            .map((t) => { var _a; return (_a = t.budgetConfig) === null || _a === void 0 ? void 0 : _a.totalBudget; })
            .filter((b) => typeof b === 'number');
        const avgBudget = budgets.length > 0 ? budgets.reduce((a, b) => a + b, 0) / budgets.length : 0;
        const sortedBudgets = [...budgets].sort((a, b) => a - b);
        const medianBudget = sortedBudgets.length > 0
            ? sortedBudgets[Math.floor(sortedBudgets.length / 2)]
            : 0;
        const totalBudget = budgets.reduce((a, b) => a + b, 0);
        const budgetDistribution = {
            '0-5000': 0,
            '5000-10000': 0,
            '10000-20000': 0,
            '20000-50000': 0,
            '50000+': 0,
        };
        budgets.forEach((budget) => {
            if (budget < 5000)
                budgetDistribution['0-5000']++;
            else if (budget < 10000)
                budgetDistribution['5000-10000']++;
            else if (budget < 20000)
                budgetDistribution['10000-20000']++;
            else if (budget < 50000)
                budgetDistribution['20000-50000']++;
            else
                budgetDistribution['50000+']++;
        });
        return {
            summary: {
                totalTrips,
                activeTrips: inProgressTrips,
                completedTrips,
                cancelledTrips,
                planningTrips,
            },
            byStatus,
            byDestination,
            byTimeRange: {
                last7Days: { count: last7DaysCount, newTrips: last7DaysNew },
                last30Days: { count: last30DaysCount, newTrips: last30DaysNew },
                last90Days: { count: last90DaysCount, newTrips: last90DaysNew },
                lastYear: { count: lastYearCount, newTrips: lastYearNew },
            },
            engagement: {
                avgDaysPerTrip: totalTrips > 0 ? totalDays / totalTrips : 0,
                avgItemsPerTrip: totalTrips > 0 ? totalItems / totalTrips : 0,
                avgCollaboratorsPerTrip: totalTrips > 0 ? totalCollaborators / totalTrips : 0,
                totalLikes,
                totalCollections,
                totalShares,
            },
            budget: {
                avgBudget,
                medianBudget,
                totalBudget,
                budgetDistribution,
            },
            trends: {
                newTripsByMonth: [],
                completionRateByMonth: [],
            },
        };
    }
    async findOneAdmin(id) {
        const trip = await this.prisma.trip.findUnique({
            where: { id },
            include: {
                TripCollaborator: true,
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
                TripLike: true,
                TripCollection: true,
                TripShare: true,
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${id} 不存在`);
        }
        const ownerCollaborator = trip.TripCollaborator.find((c) => c.role === 'OWNER') || null;
        let ownerUser = null;
        if (ownerCollaborator && this.isValidUUID(ownerCollaborator.userId)) {
            try {
                ownerUser = await this.prisma.user.findUnique({
                    where: { id: ownerCollaborator.userId },
                    select: {
                        id: true,
                        email: true,
                        displayName: true,
                        avatarUrl: true,
                    },
                });
            }
            catch (error) {
                this.logger.warn(`查询用户信息失败: ${ownerCollaborator.userId}`, error);
            }
        }
        const collaboratorUserIds = trip.TripCollaborator
            .filter((c) => c.role !== 'OWNER')
            .map((c) => c.userId)
            .filter((id) => this.isValidUUID(id));
        const collaboratorUsers = collaboratorUserIds.length > 0
            ? await this.prisma.user.findMany({
                where: { id: { in: collaboratorUserIds } },
                select: {
                    id: true,
                    email: true,
                    displayName: true,
                },
            })
            : [];
        const collaboratorUserMap = new Map(collaboratorUsers.map(u => [u.id, u]));
        const likeUserIds = trip.TripLike.map((l) => l.userId).filter((id) => this.isValidUUID(id));
        const collectionUserIds = trip.TripCollection.map((c) => c.userId).filter((id) => this.isValidUUID(id));
        const allUserIds = [...new Set([...likeUserIds, ...collectionUserIds])];
        const socialUsers = allUserIds.length > 0
            ? await this.prisma.user.findMany({
                where: { id: { in: allUserIds } },
                select: {
                    id: true,
                    email: true,
                    displayName: true,
                },
            })
            : [];
        const socialUserMap = new Map(socialUsers.map(u => [u.id, u]));
        return {
            id: trip.id,
            destination: trip.destination,
            startDate: trip.startDate,
            endDate: trip.endDate,
            status: trip.status,
            durationDays: Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1,
            budgetConfig: trip.budgetConfig,
            pacingConfig: trip.pacingConfig,
            metadata: trip.metadata,
            createdAt: trip.createdAt,
            updatedAt: trip.updatedAt,
            owner: ownerUser ? {
                userId: ownerUser.id,
                email: ownerUser.email,
                displayName: ownerUser.displayName,
                avatarUrl: ownerUser.avatarUrl,
            } : (ownerCollaborator ? {
                userId: ownerCollaborator.userId,
                role: ownerCollaborator.role,
            } : null),
            collaborators: trip.TripCollaborator
                .filter((c) => c.role !== 'OWNER')
                .map((c) => {
                const user = collaboratorUserMap.get(c.userId);
                return {
                    userId: c.userId,
                    email: (user === null || user === void 0 ? void 0 : user.email) || null,
                    displayName: (user === null || user === void 0 ? void 0 : user.displayName) || null,
                    role: c.role,
                    createdAt: c.createdAt,
                };
            }),
            days: trip.TripDay.map((day) => ({
                id: day.id,
                date: day.date,
                itemsCount: day.ItineraryItem.length,
                items: day.ItineraryItem.map((item) => ({
                    id: item.id,
                    startTime: item.startTime,
                    endTime: item.endTime,
                    type: item.type,
                    place: item.Place ? {
                        id: item.Place.id,
                        nameCN: item.Place.nameCN,
                        nameEN: item.Place.nameEN,
                        category: item.Place.category,
                    } : null,
                })),
            })),
            stats: {
                daysCount: trip.TripDay.length,
                itemsCount: trip.TripDay.reduce((sum, d) => sum + d.ItineraryItem.length, 0),
                collaboratorsCount: trip.TripCollaborator.length,
                likesCount: trip.TripLike.length,
                collectionsCount: trip.TripCollection.length,
                sharesCount: trip.TripShare.length,
            },
            social: {
                likes: trip.TripLike.map((like) => {
                    const user = socialUserMap.get(like.userId);
                    return {
                        userId: like.userId,
                        email: (user === null || user === void 0 ? void 0 : user.email) || null,
                        displayName: (user === null || user === void 0 ? void 0 : user.displayName) || null,
                        createdAt: like.createdAt,
                    };
                }),
                collections: trip.TripCollection.map((col) => {
                    const user = socialUserMap.get(col.userId);
                    return {
                        userId: col.userId,
                        email: (user === null || user === void 0 ? void 0 : user.email) || null,
                        displayName: (user === null || user === void 0 ? void 0 : user.displayName) || null,
                        createdAt: col.createdAt,
                    };
                }),
                shares: trip.TripShare.map((share) => ({
                    id: share.id,
                    shareToken: share.shareToken,
                    permission: share.permission,
                    expiresAt: share.expiresAt,
                    createdAt: share.createdAt,
                })),
            },
            decisionLogs: {
                total: 0,
                recent: [],
            },
        };
    }
    async batchOperation(body) {
        const { action, tripIds, params } = body;
        const errors = [];
        let successCount = 0;
        for (const tripId of tripIds) {
            try {
                if (action === 'DELETE') {
                    await this.remove(tripId, 'CONFIRM');
                    successCount++;
                }
                else if (action === 'UPDATE_STATUS' && (params === null || params === void 0 ? void 0 : params.status)) {
                    await this.update(tripId, { status: params.status });
                    successCount++;
                }
                else {
                    errors.push({ tripId, error: '不支持的操作或缺少参数' });
                }
            }
            catch (error) {
                errors.push({ tripId, error: error.message || '操作失败' });
            }
        }
        return {
            action,
            total: tripIds.length,
            success: successCount,
            failed: errors.length,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    async exportTrip(id, format = 'json') {
        const trip = await this.findOneAdmin(id);
        if (format === 'csv') {
            throw new common_1.BadRequestException('CSV 导出功能暂未实现');
        }
        return trip;
    }
    generateDefaultTripName(params) {
        const { generateDefaultTripName } = require('./utils/trip-name.util');
        return generateDefaultTripName(params);
    }
    getDestinationName(countryCode) {
        const { getDestinationName } = require('./utils/trip-name.util');
        return getDestinationName(countryCode);
    }
};
exports.TripsService = TripsService;
exports.TripsService = TripsService = TripsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        flight_price_service_1.FlightPriceService,
        schedule_converter_service_1.ScheduleConverterService,
        action_history_service_1.ActionHistoryService,
        decision_log_storage_service_1.DecisionLogStorageService,
        trip_draft_service_1.TripDraftService,
        evidence_management_service_1.EvidenceManagementService,
        evidence_filtering_service_1.EvidenceFilteringService,
        evidence_completeness_checker_service_1.EvidenceCompletenessChecker,
        evidence_trigger_service_1.EvidenceTriggerService,
        booking_com_integration_service_1.BookingComIntegrationService])
], TripsService);
//# sourceMappingURL=trips.service.js.map