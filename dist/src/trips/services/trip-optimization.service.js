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
var TripOptimizationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripOptimizationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const luxon_1 = require("luxon");
const itinerary_items_service_1 = require("../../itinerary-items/itinerary-items.service");
const crypto_1 = require("crypto");
let TripOptimizationService = TripOptimizationService_1 = class TripOptimizationService {
    constructor(prisma, itineraryItemsService) {
        this.prisma = prisma;
        this.itineraryItemsService = itineraryItemsService;
        this.logger = new common_1.Logger(TripOptimizationService_1.name);
    }
    async applyOptimization(tripId, dto) {
        var _a, _b;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
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
        const options = dto.options || {};
        const dryRun = options.dryRun || false;
        const replaceExisting = options.replaceExisting !== false;
        const preserveManualEdits = options.preserveManualEdits !== false;
        const result = dto.result;
        if (result === null || result === undefined) {
            this.logger.warn('优化结果数据为空', { tripId, dto: { ...dto, result: 'null/undefined' } });
            throw new common_1.BadRequestException('优化结果数据不能为空。请确保请求体中包含 result 字段，且 result 不为 null 或 undefined。');
        }
        if (typeof result !== 'object' || Array.isArray(result)) {
            this.logger.warn('优化结果数据格式不正确', { tripId, resultType: typeof result });
            throw new common_1.BadRequestException('优化结果数据必须是对象类型。');
        }
        let route = [];
        if (result.route) {
            if (Array.isArray(result.route)) {
                route = result.route;
            }
            else if (result.route.nodes && Array.isArray(result.route.nodes)) {
                route = result.route.nodes;
            }
            else {
                this.logger.warn('result.route 格式不正确，期望数组或包含 nodes 的对象');
                route = [];
            }
        }
        if (route.length === 0) {
            this.logger.log('优化结果 route 为空，返回空结果');
            return {
                success: true,
                appliedItems: 0,
                modifiedDays: [],
                preview: dryRun ? [] : undefined,
            };
        }
        const timeline = result.timeline || [];
        const hasRouteNodeFormat = route.length > 0 && route.some(node => (node.start_service || node.arrival) && !node.startTime);
        let defaultDate;
        if (hasRouteNodeFormat && trip.startDate && trip.endDate) {
            const tripStartDate = luxon_1.DateTime.fromJSDate(trip.startDate).toISODate();
            defaultDate = tripStartDate || undefined;
            this.logger.debug(`检测到 RouteNode 格式，使用默认日期: ${defaultDate}`);
        }
        const dayGroups = new Map();
        for (const node of route) {
            let startTimeStr;
            let nodeDate;
            if (node.startTime) {
                startTimeStr = node.startTime;
            }
            else if (node.start_service) {
                if (!defaultDate) {
                    this.logger.warn(`节点 ${node.node_id || node.id} 使用 start_service 格式，但无法确定日期，跳过`);
                    continue;
                }
                nodeDate = defaultDate;
                const [hours, minutes] = node.start_service.split(':').map(Number);
                const dateTime = luxon_1.DateTime.fromISO(defaultDate).set({
                    hour: hours || 9,
                    minute: minutes || 0
                });
                startTimeStr = dateTime.toISO() || undefined;
                if (!startTimeStr) {
                    this.logger.warn(`无法构建完整时间: ${defaultDate} ${node.start_service}`);
                    continue;
                }
            }
            else if (node.arrival) {
                if (!defaultDate) {
                    this.logger.warn(`节点 ${node.node_id || node.id} 使用 arrival 格式，但无法确定日期，跳过`);
                    continue;
                }
                nodeDate = defaultDate;
                const [hours, minutes] = node.arrival.split(':').map(Number);
                const dateTime = luxon_1.DateTime.fromISO(defaultDate).set({
                    hour: hours || 9,
                    minute: minutes || 0
                });
                startTimeStr = dateTime.toISO() || undefined;
                if (!startTimeStr) {
                    this.logger.warn(`无法构建完整时间: ${defaultDate} ${node.arrival}`);
                    continue;
                }
            }
            if (!startTimeStr) {
                this.logger.warn(`节点 ${node.node_id || node.id || 'unknown'} 缺少时间信息，跳过`);
                continue;
            }
            try {
                const startTime = luxon_1.DateTime.fromISO(startTimeStr);
                if (!startTime.isValid) {
                    this.logger.warn(`节点时间格式无效: ${startTimeStr}`);
                    continue;
                }
                const date = nodeDate || startTime.toISODate() || '';
                if (!date) {
                    this.logger.warn(`无法从时间 ${startTimeStr} 提取日期`);
                    continue;
                }
                if (!dayGroups.has(date)) {
                    dayGroups.set(date, []);
                }
                dayGroups.get(date).push(node);
            }
            catch (error) {
                this.logger.warn(`解析节点时间失败: ${startTimeStr}`, error.message);
                continue;
            }
        }
        const changes = [];
        const modifiedDays = [];
        let appliedItems = 0;
        for (const [date, nodes] of dayGroups.entries()) {
            let tripDay = trip.TripDay.find(day => {
                const dayDate = luxon_1.DateTime.fromJSDate(day.date).toISODate();
                return dayDate === date;
            });
            if (!tripDay) {
                if (dryRun) {
                    tripDay = {
                        id: (0, crypto_1.randomUUID)(),
                        date: luxon_1.DateTime.fromISO(date).toJSDate(),
                        tripId,
                        ItineraryItem: [],
                    };
                }
                else {
                    tripDay = await this.prisma.tripDay.create({
                        data: {
                            id: (0, crypto_1.randomUUID)(),
                            date: luxon_1.DateTime.fromISO(date).toJSDate(),
                            tripId,
                        },
                        include: {
                            ItineraryItem: true,
                        },
                    });
                }
            }
            const existingItems = tripDay.ItineraryItem || [];
            const added = [];
            const removed = [];
            const modified = [];
            if (replaceExisting) {
                for (const item of existingItems) {
                    if (preserveManualEdits && item.isManualEdit) {
                        continue;
                    }
                    removed.push(item);
                }
                for (const node of nodes) {
                    added.push(node);
                }
            }
            else {
                for (const node of nodes) {
                    const nodePlaceId = (_b = (_a = node.placeId) !== null && _a !== void 0 ? _a : node.node_id) !== null && _b !== void 0 ? _b : node.id;
                    if (!nodePlaceId) {
                        this.logger.warn('节点缺少 ID 字段，跳过', JSON.stringify(node));
                        continue;
                    }
                    const existing = existingItems.find((item) => item.placeId === nodePlaceId);
                    if (existing) {
                        modified.push({ existing, new: node });
                    }
                    else {
                        added.push(node);
                    }
                }
            }
            if (dryRun) {
                changes.push({
                    dayId: tripDay.id,
                    date,
                    added: added.length,
                    removed: removed.length,
                    modified: modified.length,
                });
            }
            else {
                for (const item of removed) {
                    await this.itineraryItemsService.remove(item.id);
                }
                for (const change of modified) {
                    const newNode = change.new;
                    let startTime;
                    let endTime;
                    if (newNode.startTime) {
                        startTime = newNode.startTime;
                    }
                    else if (newNode.start_service) {
                        const dayDate = luxon_1.DateTime.fromJSDate(tripDay.date);
                        const [hours, minutes] = newNode.start_service.split(':').map(Number);
                        const fullDateTime = dayDate.set({ hour: hours || 9, minute: minutes || 0 });
                        startTime = fullDateTime.toISO() || undefined;
                    }
                    if (newNode.endTime) {
                        endTime = newNode.endTime;
                    }
                    else if (newNode.end_service) {
                        const dayDate = luxon_1.DateTime.fromJSDate(tripDay.date);
                        const [hours, minutes] = newNode.end_service.split(':').map(Number);
                        const fullDateTime = dayDate.set({ hour: hours || 11, minute: minutes || 0 });
                        endTime = fullDateTime.toISO() || undefined;
                    }
                    if (!startTime) {
                        this.logger.warn(`修改项缺少时间信息，跳过`, JSON.stringify(newNode));
                        continue;
                    }
                    try {
                        await this.itineraryItemsService.update(change.existing.id, {
                            startTime,
                            endTime,
                        });
                    }
                    catch (error) {
                        this.logger.error(`更新行程项失败 (id: ${change.existing.id})`, error.message);
                    }
                }
                for (const node of added) {
                    let placeId;
                    let startTime;
                    let endTime;
                    let type = 'ACTIVITY';
                    let note;
                    if (node.placeId !== undefined) {
                        placeId = node.placeId;
                    }
                    else if (node.node_id !== undefined) {
                        placeId = node.node_id;
                    }
                    else if (node.id !== undefined) {
                        placeId = node.id;
                    }
                    else {
                        this.logger.warn('节点缺少 placeId/node_id/id 字段，跳过', JSON.stringify(node));
                        continue;
                    }
                    if (node.startTime) {
                        startTime = node.startTime;
                    }
                    else if (node.start_service) {
                        const dayDate = luxon_1.DateTime.fromJSDate(tripDay.date);
                        const [hours, minutes] = node.start_service.split(':').map(Number);
                        const fullDateTime = dayDate.set({ hour: hours || 9, minute: minutes || 0 });
                        startTime = fullDateTime.toISO() || '';
                        if (!startTime) {
                            this.logger.warn(`无法构建完整时间: ${node.start_service}`);
                            continue;
                        }
                    }
                    else {
                        this.logger.warn(`节点 ${placeId} 缺少 startTime/start_service 字段，跳过`);
                        continue;
                    }
                    if (node.endTime) {
                        endTime = node.endTime;
                    }
                    else if (node.end_service) {
                        const dayDate = luxon_1.DateTime.fromJSDate(tripDay.date);
                        const [hours, minutes] = node.end_service.split(':').map(Number);
                        const fullDateTime = dayDate.set({ hour: hours || 11, minute: minutes || 0 });
                        endTime = fullDateTime.toISO() || undefined;
                    }
                    else {
                        endTime = luxon_1.DateTime.fromISO(startTime).plus({ hours: 2 }).toISO() || undefined;
                    }
                    if (node.type) {
                        type = node.type;
                    }
                    else if (node.category) {
                        if (node.category === 'RESTAURANT') {
                            type = 'MEAL_ANCHOR';
                        }
                        else if (node.category === 'HOTEL') {
                            type = 'REST';
                        }
                        else {
                            type = 'ACTIVITY';
                        }
                    }
                    note = node.note || node.reason || undefined;
                    try {
                        await this.itineraryItemsService.create({
                            tripDayId: tripDay.id,
                            placeId,
                            type: type,
                            startTime,
                            endTime,
                            note,
                        });
                        appliedItems++;
                    }
                    catch (error) {
                        this.logger.error(`创建行程项失败 (placeId: ${placeId})`, error.message);
                    }
                }
            }
            modifiedDays.push(date);
        }
        return {
            success: true,
            appliedItems,
            modifiedDays,
            preview: dryRun ? changes : undefined,
        };
    }
};
exports.TripOptimizationService = TripOptimizationService;
exports.TripOptimizationService = TripOptimizationService = TripOptimizationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        itinerary_items_service_1.ItineraryItemsService])
], TripOptimizationService);
//# sourceMappingURL=trip-optimization.service.js.map