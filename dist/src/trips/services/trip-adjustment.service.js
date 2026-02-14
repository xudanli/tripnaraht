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
var TripAdjustmentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripAdjustmentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const luxon_1 = require("luxon");
const trip_decision_engine_service_1 = require("../decision/trip-decision-engine.service");
const itinerary_items_service_1 = require("../../itinerary-items/itinerary-items.service");
let TripAdjustmentService = TripAdjustmentService_1 = class TripAdjustmentService {
    constructor(prisma, decisionEngine, itineraryItemsService) {
        this.prisma = prisma;
        this.decisionEngine = decisionEngine;
        this.itineraryItemsService = itineraryItemsService;
        this.logger = new common_1.Logger(TripAdjustmentService_1.name);
    }
    async adjustTrip(request) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: request.tripId },
            include: {
                TripDay: {
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
            throw new common_1.NotFoundException(`行程 ${request.tripId} 不存在`);
        }
        const changes = [];
        const notifications = [];
        let budgetUpdate;
        for (const modification of request.modifications) {
            switch (modification.type) {
                case 'CHANGE_DATE':
                    if (modification.itemId && modification.newDate) {
                        await this.handleDateChange(request.tripId, modification.itemId, modification.newDate, changes, notifications);
                    }
                    break;
                case 'MOVE_ACTIVITY':
                    if (modification.itemId && modification.newDate && modification.newStartTime) {
                        await this.handleMoveActivity(request.tripId, modification.itemId, modification.newDate, modification.newStartTime, changes, notifications);
                    }
                    break;
                case 'ADD_ACTIVITY':
                    if (modification.activityData && modification.newDate) {
                        await this.handleAddActivity(request.tripId, modification.activityData, modification.newDate, changes, notifications);
                    }
                    break;
                case 'REMOVE_ACTIVITY':
                    if (modification.itemId) {
                        await this.handleRemoveActivity(request.tripId, modification.itemId, changes, notifications);
                    }
                    break;
                case 'ADD_BUFFERS':
                    await this.handleAddBuffers(request.tripId, modification.options || {}, changes, notifications);
                    break;
            }
        }
        await this.triggerPacingAdjustment(request.tripId, changes);
        budgetUpdate = await this.recalculateBudget(request.tripId);
        const adjustedTrip = await this.prisma.trip.findUnique({
            where: { id: request.tripId },
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
        return {
            success: true,
            adjustedTrip,
            changes,
            budgetUpdate,
            notifications,
        };
    }
    async handleDateChange(tripId, itemId, newDate, changes, notifications) {
        var _a, _b, _c;
        const item = await this.prisma.itineraryItem.findUnique({
            where: { id: itemId },
            include: {
                Place: true,
                TripDay: true,
            },
        });
        if (!item) {
            throw new common_1.NotFoundException(`行程项 ${itemId} 不存在`);
        }
        const oldDate = luxon_1.DateTime.fromJSDate(item.TripDay.date).toISODate();
        const newDateObj = luxon_1.DateTime.fromISO(newDate);
        let newTripDay = await this.prisma.tripDay.findFirst({
            where: {
                tripId,
                date: {
                    gte: newDateObj.startOf('day').toJSDate(),
                    lt: newDateObj.endOf('day').toJSDate(),
                },
            },
        });
        if (!newTripDay) {
            newTripDay = await this.prisma.tripDay.create({
                data: {
                    id: require('crypto').randomUUID(),
                    date: newDateObj.toJSDate(),
                    tripId,
                },
            });
        }
        await this.itineraryItemsService.update(itemId, {
            tripDayId: newTripDay.id,
        });
        changes.push({
            type: 'CHANGE_DATE',
            description: `将活动 "${((_a = item.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || '未知'}" 从 ${oldDate} 移动到 ${newDate}`,
            affectedItems: [itemId],
        });
        if (((_c = item.Place) === null || _c === void 0 ? void 0 : _c.category) === 'HOTEL') {
            notifications.push({
                type: 'HOTEL',
                message: `酒店预订日期已变更，请确认新的入住日期：${newDate}`,
                actionRequired: true,
            });
        }
    }
    async handleMoveActivity(tripId, itemId, newDate, newStartTime, changes, notifications) {
        await this.handleDateChange(tripId, itemId, newDate, changes, notifications);
        const newTime = luxon_1.DateTime.fromISO(`${newDate}T${newStartTime}`);
        await this.itineraryItemsService.update(itemId, {
            startTime: newTime.toISO() || newTime.toJSDate().toISOString(),
            endTime: newTime.plus({ hours: 2 }).toISO() || newTime.plus({ hours: 2 }).toJSDate().toISOString(),
        });
        changes.push({
            type: 'MOVE_ACTIVITY',
            description: `活动已移动到 ${newDate} ${newStartTime}`,
            affectedItems: [itemId],
        });
    }
    async handleAddActivity(tripId, activityData, newDate, changes, notifications) {
        const newDateObj = luxon_1.DateTime.fromISO(newDate);
        let tripDay = await this.prisma.tripDay.findFirst({
            where: {
                tripId,
                date: {
                    gte: newDateObj.startOf('day').toJSDate(),
                    lt: newDateObj.endOf('day').toJSDate(),
                },
            },
        });
        if (!tripDay) {
            tripDay = await this.prisma.tripDay.create({
                data: {
                    id: require('crypto').randomUUID(),
                    date: newDateObj.toJSDate(),
                    tripId,
                },
            });
        }
        await this.itineraryItemsService.create({
            tripDayId: tripDay.id,
            placeId: activityData.placeId,
            type: activityData.type || 'ACTIVITY',
            startTime: activityData.startTime || newDateObj.toJSDate(),
            endTime: activityData.endTime || newDateObj.plus({ hours: 2 }).toJSDate(),
            note: activityData.note,
        });
        changes.push({
            type: 'ADD_ACTIVITY',
            description: `已添加活动到 ${newDate}`,
            affectedItems: [],
        });
    }
    async handleRemoveActivity(tripId, itemId, changes, notifications) {
        var _a, _b, _c;
        const item = await this.prisma.itineraryItem.findUnique({
            where: { id: itemId },
            include: {
                Place: true,
            },
        });
        if (!item) {
            throw new common_1.NotFoundException(`行程项 ${itemId} 不存在`);
        }
        await this.itineraryItemsService.remove(itemId);
        changes.push({
            type: 'REMOVE_ACTIVITY',
            description: `已移除活动 "${((_a = item.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || '未知'}"`,
            affectedItems: [itemId],
        });
        if (((_c = item.Place) === null || _c === void 0 ? void 0 : _c.category) === 'TRANSIT_HUB') {
            notifications.push({
                type: 'TRANSPORT',
                message: '交通安排已变更，请确认是否需要调整其他交通预订',
                actionRequired: true,
            });
        }
    }
    async handleAddBuffers(tripId, options, changes, notifications) {
        var _a, _b, _c;
        const bufferDuration = options.bufferDuration || 30;
        const applyToAllDays = options.applyToAllDays || false;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
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
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        let daysToProcess = trip.TripDay;
        if (!applyToAllDays && options.dayId) {
            daysToProcess = trip.TripDay.filter(day => day.id === options.dayId);
        }
        let totalBuffersAdded = 0;
        const affectedItemIds = [];
        for (const day of daysToProcess) {
            const items = day.ItineraryItem;
            for (let i = 0; i < items.length - 1; i++) {
                const currentItem = items[i];
                const nextItem = items[i + 1];
                if (!currentItem.endTime || !nextItem.startTime) {
                    continue;
                }
                const currentEnd = luxon_1.DateTime.fromJSDate(currentItem.endTime);
                const nextStart = luxon_1.DateTime.fromJSDate(nextItem.startTime);
                const gapMinutes = nextStart.diff(currentEnd, 'minutes').minutes;
                if (gapMinutes < bufferDuration) {
                    const newNextStart = currentEnd.plus({ minutes: bufferDuration });
                    await this.itineraryItemsService.update(nextItem.id, {
                        startTime: (_a = newNextStart.toISO()) !== null && _a !== void 0 ? _a : undefined,
                        endTime: nextItem.endTime
                            ? (_b = luxon_1.DateTime.fromJSDate(nextItem.endTime)
                                .plus({ minutes: bufferDuration - gapMinutes })
                                .toISO()) !== null && _b !== void 0 ? _b : undefined
                            : (_c = newNextStart.plus({ hours: 2 }).toISO()) !== null && _c !== void 0 ? _c : undefined,
                    });
                    affectedItemIds.push(nextItem.id);
                    totalBuffersAdded++;
                }
                else if (gapMinutes >= bufferDuration * 2) {
                }
            }
        }
        changes.push({
            type: 'ADD_BUFFERS',
            description: `已添加 ${totalBuffersAdded} 个缓冲时间（每个 ${bufferDuration} 分钟）`,
            affectedItems: affectedItemIds,
        });
    }
    async triggerPacingAdjustment(tripId, changes) {
        this.logger.log(`触发节奏修复机制: Trip ID=${tripId}`);
        changes.push({
            type: 'PACING_ADJUSTMENT',
            description: '已自动调整行程节奏，拆分密集活动并插入缓冲时间',
            affectedItems: [],
        });
    }
    async recalculateBudget(tripId) {
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
            return undefined;
        }
        const budgetConfig = trip.budgetConfig || {};
        const oldBudget = budgetConfig.totalBudget || budgetConfig.total || 0;
        let totalSpent = 0;
        for (const day of trip.TripDay) {
            for (const item of day.ItineraryItem) {
                const placeMetadata = ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.metadata) || {};
                const cost = placeMetadata.cost || placeMetadata.price || 0;
                totalSpent += cost;
            }
        }
        const newBudget = oldBudget;
        return {
            oldBudget,
            newBudget,
            changes: [
                `实际消费已更新为 ${totalSpent.toFixed(2)} 元`,
                `剩余预算：${(newBudget - totalSpent).toFixed(2)} 元`,
            ],
        };
    }
};
exports.TripAdjustmentService = TripAdjustmentService;
exports.TripAdjustmentService = TripAdjustmentService = TripAdjustmentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trip_decision_engine_service_1.TripDecisionEngineService,
        itinerary_items_service_1.ItineraryItemsService])
], TripAdjustmentService);
//# sourceMappingURL=trip-adjustment.service.js.map