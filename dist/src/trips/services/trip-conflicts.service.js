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
var TripConflictsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripConflictsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const luxon_1 = require("luxon");
const trip_conflicts_dto_1 = require("../dto/trip-conflicts.dto");
let TripConflictsService = TripConflictsService_1 = class TripConflictsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TripConflictsService_1.name);
    }
    async getConflicts(tripId, date, severity) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    where: date
                        ? {
                            date: {
                                gte: luxon_1.DateTime.fromISO(date).startOf('day').toJSDate(),
                                lt: luxon_1.DateTime.fromISO(date).endOf('day').toJSDate(),
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
        const conflicts = [];
        for (const day of trip.TripDay) {
            const dayConflicts = await this.detectDayConflicts(tripId, day);
            conflicts.push(...dayConflicts);
        }
        let filteredConflicts = conflicts;
        if (severity) {
            filteredConflicts = conflicts.filter(c => c.severity === severity);
        }
        return {
            tripId,
            conflicts: filteredConflicts,
            total: filteredConflicts.length,
        };
    }
    async getDayConflicts(tripId, dayId) {
        const day = await this.prisma.tripDay.findUnique({
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
        });
        if (!day) {
            return [];
        }
        return this.detectDayConflicts(tripId, day);
    }
    async detectDayConflicts(tripId, day) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const conflicts = [];
        const items = day.ItineraryItem || [];
        const date = luxon_1.DateTime.fromJSDate(day.date).toISODate() || '';
        for (let i = 0; i < items.length - 1; i++) {
            const current = items[i];
            const next = items[i + 1];
            if (!current.endTime || !next.startTime) {
                continue;
            }
            if (current.type === 'REST' || next.type === 'REST') {
                continue;
            }
            const currentEnd = luxon_1.DateTime.fromJSDate(current.endTime);
            const nextStart = luxon_1.DateTime.fromJSDate(next.startTime);
            if (currentEnd > nextStart) {
                conflicts.push({
                    id: `time-conflict-${current.id}-${next.id}`,
                    type: trip_conflicts_dto_1.ConflictType.TIME_CONFLICT,
                    severity: trip_conflicts_dto_1.ConflictSeverity.HIGH,
                    title: '时间冲突',
                    description: `活动 "${((_a = current.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = current.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || '未知'}" 与 "${((_c = next.Place) === null || _c === void 0 ? void 0 : _c.nameCN) || ((_d = next.Place) === null || _d === void 0 ? void 0 : _d.nameEN) || '未知'}" 时间重叠`,
                    affectedDays: [date],
                    affectedItemIds: [current.id, next.id],
                    suggestions: [
                        {
                            action: '调整时间',
                            description: '调整其中一个活动的开始或结束时间',
                            impact: '解决时间冲突，确保行程可行',
                        },
                    ],
                });
            }
        }
        const lunchWindow = this.detectLunchWindow(items);
        if (lunchWindow && lunchWindow.duration < 60) {
            conflicts.push({
                id: `lunch-window-${date}`,
                type: trip_conflicts_dto_1.ConflictType.LUNCH_WINDOW,
                severity: trip_conflicts_dto_1.ConflictSeverity.MEDIUM,
                title: '午餐时间窗过短',
                description: `午餐时间窗仅 ${lunchWindow.duration} 分钟，建议至少 60 分钟`,
                affectedDays: [date],
                affectedItemIds: lunchWindow.itemIds,
                suggestions: [
                    {
                        action: '延长午餐时间',
                        description: '调整前后活动时间，为午餐留出更多时间',
                        impact: '确保有足够时间用餐',
                    },
                ],
            });
        }
        let totalFatigue = 0;
        for (const item of items) {
            if ((_e = item.Place) === null || _e === void 0 ? void 0 : _e.physicalMetadata) {
                const physical = item.Place.physicalMetadata;
                totalFatigue += physical.fatigueScore || 0;
            }
        }
        if (totalFatigue > 80) {
            conflicts.push({
                id: `fatigue-exceeded-${date}`,
                type: trip_conflicts_dto_1.ConflictType.FATIGUE_EXCEEDED,
                severity: trip_conflicts_dto_1.ConflictSeverity.HIGH,
                title: '体力超标',
                description: `当日疲劳指数 ${totalFatigue.toFixed(1)}，超过建议值 80`,
                affectedDays: [date],
                affectedItemIds: items.map((i) => i.id),
                suggestions: [
                    {
                        action: '减少活动',
                        description: '移除部分高强度活动或增加休息时间',
                        impact: '降低疲劳指数，提高行程舒适度',
                    },
                ],
            });
        }
        for (let i = 0; i < items.length - 1; i++) {
            const current = items[i];
            const next = items[i + 1];
            if (!current.endTime || !next.startTime) {
                continue;
            }
            const currentEnd = luxon_1.DateTime.fromJSDate(current.endTime);
            const nextStart = luxon_1.DateTime.fromJSDate(next.startTime);
            const bufferMinutes = nextStart.diff(currentEnd, 'minutes').minutes;
            if (bufferMinutes < 15 && bufferMinutes > 0) {
                conflicts.push({
                    id: `buffer-insufficient-${current.id}-${next.id}`,
                    type: trip_conflicts_dto_1.ConflictType.BUFFER_INSUFFICIENT,
                    severity: trip_conflicts_dto_1.ConflictSeverity.MEDIUM,
                    title: '缓冲时间不足',
                    description: `活动 "${((_f = current.Place) === null || _f === void 0 ? void 0 : _f.nameCN) || ((_g = current.Place) === null || _g === void 0 ? void 0 : _g.nameEN) || '未知'}" 到 "${((_h = next.Place) === null || _h === void 0 ? void 0 : _h.nameCN) || ((_j = next.Place) === null || _j === void 0 ? void 0 : _j.nameEN) || '未知'}" 之间缓冲时间仅 ${bufferMinutes} 分钟`,
                    affectedDays: [date],
                    affectedItemIds: [current.id, next.id],
                    suggestions: [
                        {
                            action: '增加缓冲时间',
                            description: '调整活动时间，增加至少 15 分钟缓冲',
                            impact: '降低行程延误风险',
                        },
                    ],
                });
            }
        }
        for (const item of items) {
            if ((_k = item.Place) === null || _k === void 0 ? void 0 : _k.metadata) {
                const metadata = item.Place.metadata;
                const openingHours = metadata.openingHours;
                if (openingHours && item.endTime) {
                    const itemEnd = luxon_1.DateTime.fromJSDate(item.endTime);
                    const closingTime = this.parseClosingTime(openingHours, day.date);
                    if (closingTime && itemEnd > closingTime.minus({ minutes: 30 })) {
                        conflicts.push({
                            id: `closure-risk-${item.id}`,
                            type: trip_conflicts_dto_1.ConflictType.CLOSURE_RISK,
                            severity: trip_conflicts_dto_1.ConflictSeverity.MEDIUM,
                            title: '闭园风险',
                            description: `活动 "${((_l = item.Place) === null || _l === void 0 ? void 0 : _l.nameCN) || ((_m = item.Place) === null || _m === void 0 ? void 0 : _m.nameEN) || '未知'}" 可能接近闭园时间`,
                            affectedDays: [date],
                            affectedItemIds: [item.id],
                            suggestions: [
                                {
                                    action: '提前活动时间',
                                    description: '将活动时间提前，确保在闭园前完成',
                                    impact: '避免无法完成活动',
                                },
                            ],
                        });
                    }
                }
            }
        }
        return conflicts;
    }
    detectLunchWindow(items) {
        let lunchStart = null;
        let lunchEnd = null;
        const itemIds = [];
        for (const item of items) {
            if (!item.startTime)
                continue;
            const start = luxon_1.DateTime.fromJSDate(item.startTime);
            const hour = start.hour;
            if (hour >= 11 && hour < 14) {
                if (!lunchStart) {
                    lunchStart = start;
                }
                lunchEnd = item.endTime ? luxon_1.DateTime.fromJSDate(item.endTime) : start.plus({ hours: 1 });
                itemIds.push(item.id);
            }
        }
        if (lunchStart && lunchEnd) {
            const duration = lunchEnd.diff(lunchStart, 'minutes').minutes;
            return { duration, itemIds };
        }
        return null;
    }
    parseClosingTime(openingHours, date) {
        if (typeof openingHours === 'string') {
            const match = openingHours.match(/(\d{2}):(\d{2})/);
            if (match) {
                const hour = parseInt(match[1], 10);
                const minute = parseInt(match[2], 10);
                return luxon_1.DateTime.fromJSDate(date).set({ hour, minute });
            }
        }
        return null;
    }
};
exports.TripConflictsService = TripConflictsService;
exports.TripConflictsService = TripConflictsService = TripConflictsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TripConflictsService);
//# sourceMappingURL=trip-conflicts.service.js.map