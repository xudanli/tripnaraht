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
var TripDraftService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripDraftService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const client_1 = require("@prisma/client");
const luxon_1 = require("luxon");
const crypto_1 = require("crypto");
const trip_draft_dto_1 = require("../dto/trip-draft.dto");
const create_itinerary_item_dto_1 = require("../../itinerary-items/dto/create-itinerary-item.dto");
const client_2 = require("@prisma/client");
let TripDraftService = TripDraftService_1 = class TripDraftService {
    constructor(prisma, llmService) {
        this.prisma = prisma;
        this.llmService = llmService;
        this.logger = new common_1.Logger(TripDraftService_1.name);
        this.SLOT_TIMES = {
            morning: { start: 9, end: 12 },
            lunch: { start: 12, end: 13.5 },
            afternoon: { start: 13.5, end: 17.5 },
            dinner: { start: 18, end: 20 },
            evening: { start: 20, end: 22 },
        };
    }
    async generateDraft(dto, onProgress) {
        const startTime = Date.now();
        const countryCode = dto.destination.toUpperCase().trim();
        if (!/^[A-Z]{2}$/.test(countryCode)) {
            throw new common_1.BadRequestException(`无效的国家代码: ${dto.destination}`);
        }
        if (dto.days < 1 || dto.days > 14) {
            throw new common_1.BadRequestException('行程天数必须在 1-14 天之间');
        }
        this.logger.log(`开始检索候选地点（国家: ${countryCode}, 风格: ${dto.style || 'balanced'}）`);
        const candidates = await this.retrieveCandidates(dto);
        if (candidates.length < 20) {
            throw new common_1.BadRequestException(`候选地点不足（${candidates.length} 个）。系统暂不支持该目的地，或该国家尚未导入足够的地点数据。`);
        }
        const days = this.buildDayList(dto);
        this.logger.log(`使用 LLM 从 ${candidates.length} 个候选中编排 ${dto.days} 天行程`);
        const llmResult = await this.llmOrchestrate(dto, candidates, days, onProgress);
        const validationWarnings = [];
        const validatedDays = await this.validateAndRepair(days, llmResult, candidates, validationWarnings);
        const generationTime = Date.now() - startTime;
        return {
            destination: countryCode,
            days: dto.days,
            startDate: dto.startDate || days[0].date,
            endDate: dto.endDate || days[days.length - 1].date,
            draftDays: validatedDays,
            candidatesCount: candidates.length,
            validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
            metadata: {
                generationTime,
                llmProvider: 'deepseek',
            },
        };
    }
    async retrieveCandidates(dto) {
        const countryCode = dto.destination.toUpperCase().trim();
        const categoryFilter = dto.style
            ? this.getCategoryFilterByStyle(dto.style)
            : [];
        const categorySql = categoryFilter.length > 0
            ? client_1.Prisma.sql `AND category = ANY(${categoryFilter}::"PlaceCategory"[])`
            : client_1.Prisma.sql ``;
        const rawPlaces = await this.prisma.$queryRaw `
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.category,
        p.metadata,
        p."physicalMetadata",
        p.rating,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = ${countryCode}
        AND p.location IS NOT NULL
        ${categorySql}
      ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
      LIMIT 200
    `;
        return rawPlaces.map(place => {
            const metadata = place.metadata;
            const physicalMetadata = place.physicalMetadata;
            return {
                id: place.id,
                nameCN: place.nameCN,
                nameEN: place.nameEN,
                type: place.category,
                category: place.category,
                lat: place.lat,
                lng: place.lng,
                openingHours: metadata === null || metadata === void 0 ? void 0 : metadata.openingHours,
                avgVisitDuration: (physicalMetadata === null || physicalMetadata === void 0 ? void 0 : physicalMetadata.estimated_duration_min) || 60,
                tags: (metadata === null || metadata === void 0 ? void 0 : metadata.rawTags) || [],
                popularity: place.rating ? place.rating * 2 : 5,
                rating: place.rating || undefined,
            };
        });
    }
    async retrieveCandidatesByCity(cityId, countryCode, style, constraints) {
        const categoryFilter = style
            ? this.getCategoryFilterByStyle(style)
            : [];
        const categorySql = categoryFilter.length > 0
            ? client_1.Prisma.sql `AND p.category = ANY(${categoryFilter}::"PlaceCategory"[])`
            : client_1.Prisma.sql ``;
        const avoidCategorySql = (constraints === null || constraints === void 0 ? void 0 : constraints.avoidCategories) && constraints.avoidCategories.length > 0
            ? client_1.Prisma.sql `AND p.category != ALL(${constraints.avoidCategories}::"PlaceCategory"[])`
            : client_1.Prisma.sql ``;
        const rawPlaces = await this.prisma.$queryRaw `
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.category,
        p.metadata,
        p."physicalMetadata",
        p.rating,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c.id = ${cityId}
        AND c."countryCode" = ${countryCode}
        AND p.location IS NOT NULL
        ${categorySql}
        ${avoidCategorySql}
      ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
      LIMIT 50
    `;
        return rawPlaces.map(place => {
            const metadata = place.metadata;
            const physicalMetadata = place.physicalMetadata;
            return {
                id: place.id,
                nameCN: place.nameCN,
                nameEN: place.nameEN,
                type: place.category,
                category: place.category,
                lat: place.lat,
                lng: place.lng,
                openingHours: metadata === null || metadata === void 0 ? void 0 : metadata.openingHours,
                avgVisitDuration: (physicalMetadata === null || physicalMetadata === void 0 ? void 0 : physicalMetadata.estimated_duration_min) || 60,
                tags: (metadata === null || metadata === void 0 ? void 0 : metadata.rawTags) || [],
                popularity: place.rating ? place.rating * 2 : 5,
                rating: place.rating || undefined,
            };
        });
    }
    getCategoryFilterByStyle(style) {
        const styleMap = {
            [trip_draft_dto_1.TravelStyle.NATURE]: ['ATTRACTION'],
            [trip_draft_dto_1.TravelStyle.CULTURE]: ['ATTRACTION'],
            [trip_draft_dto_1.TravelStyle.FOOD]: ['RESTAURANT'],
            [trip_draft_dto_1.TravelStyle.CITYWALK]: ['ATTRACTION', 'SHOPPING'],
            [trip_draft_dto_1.TravelStyle.PHOTOGRAPHY]: ['ATTRACTION'],
            [trip_draft_dto_1.TravelStyle.ADVENTURE]: ['ATTRACTION'],
        };
        return styleMap[style] || ['ATTRACTION', 'RESTAURANT'];
    }
    buildDayList(dto) {
        const days = [];
        let startDate;
        if (dto.startDate) {
            startDate = luxon_1.DateTime.fromISO(dto.startDate);
        }
        else {
            startDate = luxon_1.DateTime.now().plus({ days: 1 }).startOf('day');
        }
        for (let i = 0; i < dto.days; i++) {
            const date = startDate.plus({ days: i });
            days.push({
                day: i + 1,
                date: date.toFormat('yyyy-MM-dd'),
            });
        }
        return days;
    }
    async llmOrchestrate(dto, candidates, days, onProgress) {
        const prompt = this.buildOrchestrationPrompt(dto, candidates, days);
        const slotItemSchema = {
            type: 'object',
            properties: {
                placeId: { type: 'number' },
                reason: { type: 'string' },
                alternatives: { type: 'array', items: { type: 'number' } },
            },
            required: ['placeId', 'reason'],
        };
        const schema = {
            type: 'object',
            properties: {
                days: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            day: { type: 'number' },
                            slots: {
                                type: 'object',
                                properties: {
                                    morning: slotItemSchema,
                                    lunch: slotItemSchema,
                                    afternoon: slotItemSchema,
                                    dinner: slotItemSchema,
                                    evening: slotItemSchema,
                                },
                            },
                        },
                        required: ['day', 'slots'],
                    },
                },
            },
            required: ['days'],
        };
        let response;
        try {
            this.logger.log(`开始调用 LLM 编排行程（${candidates.length} 个候选地点，${days.length} 天）`);
            const startTime = Date.now();
            response = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt, schema);
            const elapsed = Date.now() - startTime;
            this.logger.log(`LLM 编排完成，耗时 ${elapsed}ms`);
            const parsed = this.extractJSON(response);
            if (response.includes('```')) {
                this.logger.debug(`LLM 响应包含 markdown 代码块，已清理`);
            }
            if (!parsed.days || !Array.isArray(parsed.days)) {
                this.logger.warn(`LLM 返回结果格式异常: ${JSON.stringify(parsed).substring(0, 200)}`);
                throw new common_1.BadRequestException('LLM 返回结果格式不正确');
            }
            this.logger.log(`LLM 返回了 ${parsed.days.length} 天的编排结果`);
            if (onProgress) {
                try {
                    await onProgress({
                        status: 'generating',
                        stage: 'llm_completed',
                        message: `LLM 编排完成，已生成 ${parsed.days.length} 天的行程规划`,
                    });
                }
                catch (progressError) {
                    this.logger.warn(`进度回调失败: ${progressError.message}`);
                }
            }
            return parsed;
        }
        catch (error) {
            this.logger.error(`LLM 编排失败: ${error.message}`, error.stack);
            if (response) {
                this.logger.error(`LLM 原始响应（前500字符）: ${response.substring(0, 500)}`);
            }
            if (onProgress) {
                try {
                    await onProgress({
                        status: 'failed',
                        stage: 'llm_error',
                        message: `LLM 编排失败: ${error.message}`,
                    });
                }
                catch (progressError) {
                    this.logger.warn(`进度回调失败: ${progressError.message}`);
                }
            }
            throw new common_1.BadRequestException(`行程生成失败: ${error.message}`);
        }
    }
    buildOrchestrationPrompt(dto, candidates, days) {
        const candidatesJson = JSON.stringify(candidates.slice(0, 150), null, 2);
        return `你是一个专业的旅行规划助手。请根据用户需求和候选地点，为 ${dto.days} 天的行程安排每天的时段活动。

用户需求：
- 目的地：${dto.destination}
- 风格：${dto.style || 'balanced'}
- 强度：${dto.intensity || 'balanced'}
- 交通方式：${dto.transport || 'walk'}
- 约束：${JSON.stringify(dto.constraints || {})}

时段定义：
- morning: 9:00-12:00 (上午活动)
- lunch: 12:00-13:30 (午餐)
- afternoon: 13:30-17:30 (下午活动)
- dinner: 18:00-20:00 (晚餐)
- evening: 20:00-22:00 (晚上活动，可选)

候选地点（只能从以下列表中选择 placeId）：
${candidatesJson}

要求：
1. 每天至少安排 morning, lunch, afternoon, dinner 四个时段
2. 每个时段选择一个地点（placeId 必须来自候选列表）
3. **每天内不能重复选择同一个地点（同一个 placeId 在同一天只能出现一次）**
4. **整个行程中，同一个地点最多出现 2 次（允许跨天重复，但不应过度）**
5. **餐厅（RESTAURANT 类别）在同一天内不能重复（午餐和晚餐不能选择同一家餐厅，除非只有一家餐厅可选）**
6. **lunch 和 dinner 时段必须选择 RESTAURANT 类别的地点（确保包含具体的餐厅）**
7. 考虑地理位置连续性（相邻时段的地点不要太远）
8. 考虑用户的风格偏好和强度要求
9. 为每个选择提供简短的原因（reason）

注意：
- **候选列表中包含餐厅（RESTAURANT），lunch 和 dinner 时段必须从 RESTAURANT 类别中选择**
- **酒店（HOTEL）不在候选列表中，因为酒店是住宿地点，需要根据行程中的景点位置单独推荐**

请返回 JSON 格式，包含每天的时段安排。`;
    }
    async validateAndRepair(days, llmResult, candidates, warnings) {
        var _a;
        const validatedDays = [];
        const dailyPlaceIds = new Map();
        const globalPlaceIds = new Map();
        const dailyRestaurantIds = new Map();
        for (const dayData of days) {
            const llmDay = (_a = llmResult.days) === null || _a === void 0 ? void 0 : _a.find((d) => d.day === dayData.day);
            if (!llmDay) {
                warnings.push(`第 ${dayData.day} 天缺少 LLM 编排结果`);
                continue;
            }
            const slots = {};
            const dayPlaceIds = new Set();
            const dayRestaurantIds = new Set();
            for (const [slotKey, slotValue] of Object.entries(llmDay.slots || {})) {
                if (!slotValue || typeof slotValue !== 'object')
                    continue;
                const slot = slotKey;
                const item = slotValue;
                const candidate = candidates.find(c => c.id === item.placeId);
                if (!candidate) {
                    warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段的 placeId ${item.placeId} 不在候选中`);
                    continue;
                }
                if (dayPlaceIds.has(item.placeId)) {
                    warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段重复选择了地点 ${item.placeId}（${candidate.nameCN}），已跳过`);
                    continue;
                }
                const isRestaurant = candidate.category === 'RESTAURANT';
                const isMealSlot = slot === trip_draft_dto_1.TimeSlot.LUNCH || slot === trip_draft_dto_1.TimeSlot.DINNER;
                if (isRestaurant && isMealSlot && dayRestaurantIds.has(item.placeId)) {
                    const restaurantCandidates = candidates.filter(c => c.category === 'RESTAURANT');
                    if (restaurantCandidates.length > 1) {
                        warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段重复选择了餐厅 ${item.placeId}（${candidate.nameCN}），已跳过`);
                        continue;
                    }
                    else {
                        warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段重复选择餐厅 ${item.placeId}（${candidate.nameCN}），但当天只有一家餐厅候选，允许重复`);
                    }
                }
                const globalCount = globalPlaceIds.get(item.placeId) || 0;
                if (globalCount >= 2) {
                    warnings.push(`地点 ${item.placeId}（${candidate.nameCN}）在整个行程中已出现 ${globalCount} 次，跳过重复`);
                    continue;
                }
                dayPlaceIds.add(item.placeId);
                globalPlaceIds.set(item.placeId, globalCount + 1);
                if (isRestaurant) {
                    dayRestaurantIds.add(item.placeId);
                }
                const slotTime = this.SLOT_TIMES[slot];
                const startDateTime = luxon_1.DateTime.fromISO(`${dayData.date}T${slotTime.start.toString().padStart(2, '0')}:00:00`);
                const endDateTime = luxon_1.DateTime.fromISO(`${dayData.date}T${slotTime.end.toString().padStart(2, '0')}:00:00`);
                const draftItem = {
                    placeId: item.placeId,
                    slot: slot,
                    startTime: startDateTime.toISO() || new Date().toISOString(),
                    endTime: endDateTime.toISO() || new Date().toISOString(),
                    reason: item.reason || '推荐',
                    alternatives: item.alternatives || [],
                    evidence: {
                        openingHours: this.formatOpeningHours(candidate.openingHours),
                        rating: candidate.rating,
                        source: 'database',
                    },
                };
                const hoursStr = this.getOpeningHoursForDate(candidate.openingHours, dayData.date);
                if (hoursStr && hoursStr !== 'Closed') {
                }
                slots[slot] = draftItem;
            }
            dailyPlaceIds.set(dayData.day, dayPlaceIds);
            dailyRestaurantIds.set(dayData.day, dayRestaurantIds);
            const slotCount = Object.keys(slots).length;
            if (slotCount < 3) {
                warnings.push(`第 ${dayData.day} 天去重后只有 ${slotCount} 个行程项，尝试从候选列表填充`);
                await this.fillMissingSlots(dayData, slots, candidates, dayPlaceIds, dayRestaurantIds, warnings);
            }
            validatedDays.push({
                day: dayData.day,
                date: dayData.date,
                slots,
            });
        }
        return validatedDays;
    }
    async fillMissingSlots(dayData, slots, candidates, dayPlaceIds, dayRestaurantIds, warnings) {
        const requiredSlots = [trip_draft_dto_1.TimeSlot.MORNING, trip_draft_dto_1.TimeSlot.LUNCH, trip_draft_dto_1.TimeSlot.AFTERNOON, trip_draft_dto_1.TimeSlot.DINNER];
        const missingSlots = requiredSlots.filter(slot => !slots[slot]);
        if (missingSlots.length === 0)
            return;
        for (const slot of missingSlots) {
            const isMealSlot = slot === trip_draft_dto_1.TimeSlot.LUNCH || slot === trip_draft_dto_1.TimeSlot.DINNER;
            let filteredCandidates = candidates.filter(c => {
                if (dayPlaceIds.has(c.id))
                    return false;
                if (isMealSlot) {
                    if (c.category === 'RESTAURANT') {
                        if (dayRestaurantIds.has(c.id)) {
                            const restaurantCandidates = candidates.filter(c => c.category === 'RESTAURANT');
                            return restaurantCandidates.length === 1;
                        }
                        return true;
                    }
                    return false;
                }
                return c.category !== 'RESTAURANT';
            });
            if (filteredCandidates.length === 0) {
                warnings.push(`第 ${dayData.day} 天 ${slot} 时段无法找到合适的候选地点`);
                continue;
            }
            filteredCandidates.sort((a, b) => {
                const ratingA = a.rating || 0;
                const ratingB = b.rating || 0;
                return ratingB - ratingA;
            });
            const bestCandidate = filteredCandidates[0];
            const slotTime = this.SLOT_TIMES[slot];
            const startDateTime = luxon_1.DateTime.fromISO(`${dayData.date}T${slotTime.start.toString().padStart(2, '0')}:00:00`);
            const endDateTime = luxon_1.DateTime.fromISO(`${dayData.date}T${slotTime.end.toString().padStart(2, '0')}:00:00`);
            slots[slot] = {
                placeId: bestCandidate.id,
                slot: slot,
                startTime: startDateTime.toISO() || new Date().toISOString(),
                endTime: endDateTime.toISO() || new Date().toISOString(),
                reason: `自动填充：${bestCandidate.nameCN}`,
                alternatives: filteredCandidates.slice(1, 4).map(c => c.id),
                evidence: {
                    openingHours: this.formatOpeningHours(bestCandidate.openingHours),
                    rating: bestCandidate.rating,
                    source: 'database',
                },
            };
            dayPlaceIds.add(bestCandidate.id);
            if (bestCandidate.category === 'RESTAURANT') {
                dayRestaurantIds.add(bestCandidate.id);
            }
            warnings.push(`第 ${dayData.day} 天 ${slot} 时段已自动填充：${bestCandidate.nameCN}`);
        }
    }
    formatOpeningHours(openingHours) {
        if (!openingHours)
            return undefined;
        if (typeof openingHours === 'string') {
            return openingHours;
        }
        if (openingHours.weekday) {
            return openingHours.weekday;
        }
        return undefined;
    }
    getOpeningHoursForDate(openingHours, date) {
        if (!openingHours)
            return undefined;
        const dateTime = luxon_1.DateTime.fromISO(date);
        const dayKey = dateTime.toFormat('ccc').toLowerCase();
        if (openingHours[dayKey]) {
            return openingHours[dayKey];
        }
        const isWeekend = dateTime.weekday >= 6;
        return isWeekend ? openingHours.weekend : openingHours.weekday;
    }
    async saveDraftAsTrip(dto) {
        var _a, _b;
        const draft = dto.draft;
        const allItems = [];
        for (const draftDay of draft.draftDays) {
            const removedItemIds = ((_a = dto.userEdits) === null || _a === void 0 ? void 0 : _a.removedItems) || [];
            for (const [slotKey, slotValue] of Object.entries(draftDay.slots)) {
                if (!slotValue)
                    continue;
                const itemKey = `${draftDay.day}-${slotKey}`;
                if (removedItemIds.includes(itemKey))
                    continue;
                allItems.push({
                    draftItem: slotValue,
                    day: draftDay.day,
                    date: draftDay.date,
                });
            }
        }
        if ((_b = dto.userEdits) === null || _b === void 0 ? void 0 : _b.addedItems) {
            for (const addedItem of dto.userEdits.addedItems) {
            }
        }
        throw new Error('Use TripsService.createFromDraft instead');
    }
    async createItineraryItemsFromDraft(tripId, draft, userEdits) {
        var _a;
        const tripDays = await this.prisma.tripDay.findMany({
            where: { tripId },
            orderBy: { date: 'asc' },
        });
        const dateToTripDay = new Map();
        for (const tripDay of tripDays) {
            const dateStr = luxon_1.DateTime.fromJSDate(tripDay.date).toFormat('yyyy-MM-dd');
            dateToTripDay.set(dateStr, tripDay.id);
        }
        const itemsToCreate = [];
        const dailyPlaceIds = new Map();
        for (const draftDay of draft.draftDays) {
            const tripDayId = dateToTripDay.get(draftDay.date);
            if (!tripDayId) {
                this.logger.warn(`找不到日期 ${draftDay.date} 对应的 TripDay`);
                continue;
            }
            const dayPlaceIds = new Set();
            for (const [slotKey, slotValue] of Object.entries(draftDay.slots)) {
                if (!slotValue)
                    continue;
                const itemKey = `${draftDay.day}-${slotKey}`;
                if ((_a = userEdits === null || userEdits === void 0 ? void 0 : userEdits.removedItems) === null || _a === void 0 ? void 0 : _a.includes(itemKey))
                    continue;
                if (dayPlaceIds.has(slotValue.placeId)) {
                    this.logger.warn(`跳过重复项：第 ${draftDay.day} 天 ${slotKey} 时段，placeId ${slotValue.placeId}`);
                    continue;
                }
                dayPlaceIds.add(slotValue.placeId);
                itemsToCreate.push({
                    tripDayId,
                    placeId: slotValue.placeId,
                    type: create_itinerary_item_dto_1.ItemType.ACTIVITY,
                    startTime: new Date(slotValue.startTime),
                    endTime: new Date(slotValue.endTime),
                    note: slotValue.reason || null,
                });
            }
            dailyPlaceIds.set(draftDay.day, dayPlaceIds);
        }
        if (userEdits === null || userEdits === void 0 ? void 0 : userEdits.addedItems) {
            for (const addedItem of userEdits.addedItems) {
            }
        }
        const placeIds = itemsToCreate.map(item => item.placeId).filter((id) => id !== null);
        const places = placeIds.length > 0
            ? await this.prisma.place.findMany({
                where: { id: { in: placeIds } },
                select: { id: true, category: true },
            })
            : [];
        const placeCategoryMap = new Map(places.map(p => [p.id, p.category]));
        for (const item of itemsToCreate) {
            const itemHour = new Date(item.startTime).getHours();
            let slot;
            if (itemHour >= 9 && itemHour < 12)
                slot = trip_draft_dto_1.TimeSlot.MORNING;
            else if (itemHour >= 12 && itemHour < 14)
                slot = trip_draft_dto_1.TimeSlot.LUNCH;
            else if (itemHour >= 14 && itemHour < 18)
                slot = trip_draft_dto_1.TimeSlot.AFTERNOON;
            else if (itemHour >= 18 && itemHour < 20)
                slot = trip_draft_dto_1.TimeSlot.DINNER;
            else if (itemHour >= 20 && itemHour < 22)
                slot = trip_draft_dto_1.TimeSlot.EVENING;
            if (slot === trip_draft_dto_1.TimeSlot.LUNCH || slot === trip_draft_dto_1.TimeSlot.DINNER) {
                if (item.placeId) {
                    const category = placeCategoryMap.get(item.placeId);
                    if (category === client_2.PlaceCategory.RESTAURANT) {
                        item.type = create_itinerary_item_dto_1.ItemType.MEAL_ANCHOR;
                    }
                    else {
                        item.type = create_itinerary_item_dto_1.ItemType.MEAL_FLOATING;
                    }
                }
                else {
                    item.type = create_itinerary_item_dto_1.ItemType.MEAL_FLOATING;
                }
            }
            else {
                item.type = create_itinerary_item_dto_1.ItemType.ACTIVITY;
            }
        }
        if (itemsToCreate.length > 0) {
            const itemsByDay = new Map();
            for (const item of itemsToCreate) {
                if (!itemsByDay.has(item.tripDayId)) {
                    itemsByDay.set(item.tripDayId, []);
                }
                itemsByDay.get(item.tripDayId).push(item);
            }
            await this.prisma.$transaction(async (tx) => {
                for (const [tripDayId, dayItems] of itemsByDay.entries()) {
                    const maxOrderItem = await tx.itineraryItem.findFirst({
                        where: { tripDayId },
                        orderBy: { order: 'desc' },
                        select: { order: true },
                    });
                    let baseOrder = (maxOrderItem === null || maxOrderItem === void 0 ? void 0 : maxOrderItem.order) !== null && (maxOrderItem === null || maxOrderItem === void 0 ? void 0 : maxOrderItem.order) !== undefined
                        ? maxOrderItem.order + 1
                        : 1;
                    dayItems.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
                    for (let i = 0; i < dayItems.length; i++) {
                        const item = dayItems[i];
                        await tx.itineraryItem.create({
                            data: {
                                id: (0, crypto_1.randomUUID)(),
                                tripDayId: item.tripDayId,
                                placeId: item.placeId,
                                type: item.type,
                                startTime: item.startTime,
                                endTime: item.endTime,
                                note: item.note,
                                order: baseOrder + i,
                            },
                        });
                    }
                }
            });
        }
        return itemsToCreate.length;
    }
    async replaceItem(tripId, itemId, dto) {
        var _a;
        const currentItem = await this.prisma.itineraryItem.findUnique({
            where: { id: itemId },
            include: {
                Place: {
                    include: {
                        City: true,
                    },
                },
                TripDay: {
                    include: {
                        Trip: true,
                    },
                },
            },
        });
        if (!currentItem || currentItem.TripDay.tripId !== tripId) {
            throw new common_1.NotFoundException(`找不到指定的行程项 (ID: ${itemId})`);
        }
        if (!currentItem.Place) {
            throw new common_1.NotFoundException('当前行程项关联的地点不存在');
        }
        if (!currentItem.startTime) {
            throw new common_1.BadRequestException('当前行程项的开始时间信息不完整');
        }
        const startTime = luxon_1.DateTime.fromJSDate(currentItem.startTime);
        const hour = startTime.hour;
        let slot;
        if (hour >= 9 && hour < 12)
            slot = trip_draft_dto_1.TimeSlot.MORNING;
        else if (hour >= 12 && hour < 14)
            slot = trip_draft_dto_1.TimeSlot.LUNCH;
        else if (hour >= 14 && hour < 18)
            slot = trip_draft_dto_1.TimeSlot.AFTERNOON;
        else if (hour >= 18 && hour < 20)
            slot = trip_draft_dto_1.TimeSlot.DINNER;
        else
            slot = trip_draft_dto_1.TimeSlot.EVENING;
        const currentCity = currentItem.Place.City;
        const currentCityId = currentCity === null || currentCity === void 0 ? void 0 : currentCity.id;
        const currentCityName = (currentCity === null || currentCity === void 0 ? void 0 : currentCity.nameCN) || (currentCity === null || currentCity === void 0 ? void 0 : currentCity.nameEN) || '未知城市';
        const countryCode = currentItem.TripDay.Trip.destination;
        this.logger.log(`替换行程项：当前地点位于 ${currentCityName} (城市ID: ${currentCityId})`);
        const constraints = {};
        if (dto.reason === 'too_tired') {
            constraints.maxDuration = 60;
        }
        else if (dto.reason === 'too_far') {
            constraints.maxDistance = ((_a = dto.constraints) === null || _a === void 0 ? void 0 : _a.maxDistance) || 5000;
        }
        else if (dto.reason === 'change_style' && dto.preferredStyle) {
        }
        let candidates = [];
        let sameCityCount = 0;
        let sameCityIds = new Set();
        if (currentCityId) {
            const sameCityCandidates = await this.retrieveCandidatesByCity(currentCityId, countryCode, dto.preferredStyle, dto.constraints);
            sameCityCount = sameCityCandidates.length;
            candidates = sameCityCandidates;
            sameCityIds = new Set(sameCityCandidates.map(c => c.id));
            this.logger.log(`同城市候选数量: ${sameCityCount}`);
        }
        if (candidates.length < 5) {
            this.logger.log(`同城市候选不足，扩展到同国家检索`);
            const countryCandidates = await this.retrieveCandidates({
                destination: countryCode,
                days: 1,
                style: dto.preferredStyle,
                constraints: dto.constraints ? {
                    mustBeOpen: dto.constraints.mustBeOpen,
                    avoidCategories: dto.constraints.avoidCategories,
                } : undefined,
            });
            const otherCityCandidates = countryCandidates.filter(c => !sameCityIds.has(c.id));
            candidates = [...candidates, ...otherCityCandidates];
            this.logger.log(`合并后候选数量: ${candidates.length} (同城市: ${sameCityCount}, 其他城市: ${otherCityCandidates.length})`);
        }
        const filteredCandidates = candidates.filter(c => c.id !== currentItem.placeId);
        if (filteredCandidates.length === 0) {
            throw new common_1.NotFoundException('找不到合适的替代地点');
        }
        const sortedCandidates = filteredCandidates.sort((a, b) => {
            const aIsSameCity = sameCityIds.has(a.id);
            const bIsSameCity = sameCityIds.has(b.id);
            if (aIsSameCity && !bIsSameCity)
                return -1;
            if (!aIsSameCity && bIsSameCity)
                return 1;
            return (b.rating || 0) - (a.rating || 0);
        });
        const bestCandidate = sortedCandidates[0];
        if (!currentItem.startTime || !currentItem.endTime) {
            throw new common_1.BadRequestException('当前行程项的时间信息不完整');
        }
        const newItem = {
            placeId: bestCandidate.id,
            slot: slot,
            startTime: currentItem.startTime.toISOString(),
            endTime: currentItem.endTime.toISOString(),
            reason: `替代原地点：${dto.reason}`,
            alternatives: filteredCandidates.slice(1, 4).map(c => c.id),
            evidence: {
                rating: bestCandidate.rating,
                source: 'database',
            },
        };
        return {
            newItem,
            alternatives: filteredCandidates.slice(0, 5).map(c => ({
                placeId: c.id,
                placeName: c.nameEN || c.nameCN,
                reason: `评分 ${c.rating || 'N/A'}`,
                score: (c.rating || 0) * 2,
            })),
            replacedItem: {
                placeId: currentItem.placeId || 0,
                reason: dto.reason,
            },
        };
    }
    async regenerateTrip(tripId, dto) {
        var _a, _b, _c, _d;
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
                    orderBy: { date: 'asc' },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`找不到指定的行程 (ID: ${tripId})`);
        }
        const lockedItemIds = new Set(dto.lockedItemIds || []);
        const lockedItems = trip.TripDay.flatMap(day => day.ItineraryItem.filter(item => lockedItemIds.has(item.id)));
        const days = trip.TripDay.length;
        const startDate = luxon_1.DateTime.fromJSDate(trip.startDate).toFormat('yyyy-MM-dd');
        const endDate = luxon_1.DateTime.fromJSDate(trip.endDate).toFormat('yyyy-MM-dd');
        const newDraft = await this.generateDraft({
            destination: trip.destination,
            days,
            startDate,
            endDate,
            style: (_a = dto.newPreferences) === null || _a === void 0 ? void 0 : _a.style,
            intensity: (_b = dto.newPreferences) === null || _b === void 0 ? void 0 : _b.intensity,
            transport: (_c = dto.newPreferences) === null || _c === void 0 ? void 0 : _c.transport,
            constraints: (_d = dto.newPreferences) === null || _d === void 0 ? void 0 : _d.constraints,
        });
        const changes = [];
        return {
            updatedDraft: newDraft,
            changes,
        };
    }
    extractJSON(response) {
        if (!response || typeof response !== 'string') {
            throw new common_1.BadRequestException('LLM 返回的响应为空或格式不正确');
        }
        let cleaned = response.trim();
        cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
        cleaned = cleaned.replace(/\n?\s*```$/i, '');
        cleaned = cleaned.trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleaned = jsonMatch[0];
        }
        cleaned = cleaned.trim();
        try {
            return JSON.parse(cleaned);
        }
        catch (parseError) {
            this.logger.error(`JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`);
            this.logger.error(`清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`);
            this.logger.error(`解析错误详情: ${parseError.message}`);
            throw new common_1.BadRequestException(`LLM 返回的 JSON 格式无效: ${parseError.message}`);
        }
    }
};
exports.TripDraftService = TripDraftService;
exports.TripDraftService = TripDraftService = TripDraftService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        llm_service_1.LlmService])
], TripDraftService);
//# sourceMappingURL=trip-draft.service.js.map