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
var PlanSelectSlicesSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanSelectSlicesSkill = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let PlanSelectSlicesSkill = PlanSelectSlicesSkill_1 = class PlanSelectSlicesSkill {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PlanSelectSlicesSkill_1.name);
        this.metadata = {
            name: 'plan.selectSlices',
            description: '选择计划相关片段（Plan RAG）：根据 scope 返回当前 day/segment/rejection 的结构化块',
            version: '1.0.0',
            category: 'rag',
            toolGroup: 'CONTEXT',
        };
    }
    async execute(input) {
        var _a;
        this.logger.debug(`执行 plan.selectSlices: tripId=${input.tripId}, scope=${input.scope.join(', ')}`);
        const blocks = [];
        const selectedDays = [];
        const selectedSegments = [];
        try {
            if (!this.prisma) {
                throw new Error('PrismaService 未注入');
            }
            for (const item of input.scope) {
                if (item.startsWith('day:')) {
                    const dayNumber = parseInt(item.split(':')[1], 10);
                    if (!isNaN(dayNumber)) {
                        selectedDays.push(dayNumber);
                    }
                }
                else if (item.startsWith('segment:')) {
                    const segmentId = item.split(':')[1];
                    selectedSegments.push(segmentId);
                }
            }
            const tripDays = await this.prisma.tripDay.findMany({
                where: {
                    tripId: input.tripId,
                },
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
            });
            if (selectedDays.length > 0) {
                for (const dayNumber of selectedDays) {
                    const day = tripDays[dayNumber - 1];
                    if (day) {
                        const sortedItems = [...day.ItineraryItem].sort((a, b) => {
                            if (!a.startTime && !b.startTime)
                                return 0;
                            if (!a.startTime)
                                return 1;
                            if (!b.startTime)
                                return -1;
                            return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
                        });
                        const itemsSummary = sortedItems.map((item, index) => {
                            var _a, _b;
                            const placeName = ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || item.note || `Place ${item.placeId || 'Unknown'}`;
                            const parts = [`${index + 1}. [${item.type}] ${placeName}`];
                            if (item.startTime && item.endTime) {
                                const durationMs = new Date(item.endTime).getTime() - new Date(item.startTime).getTime();
                                const durationMinutes = Math.round(durationMs / (1000 * 60));
                                const hours = Math.floor(durationMinutes / 60);
                                const minutes = durationMinutes % 60;
                                parts.push(`${hours}h${minutes}m`);
                            }
                            if (item.startTime) {
                                parts.push(`开始: ${new Date(item.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
                            }
                            if (item.note) {
                                parts.push(`备注: ${item.note}`);
                            }
                            return parts.join(' - ');
                        }).join('\n');
                        blocks.push({
                            key: `PLAN_DAY_${dayNumber}`,
                            type: 'PLAN_DAY',
                            text: `第 ${dayNumber} 天结构 (${day.date.toISOString().split('T')[0]}):\n${itemsSummary}`,
                            priority: 80,
                            visibility: 'public',
                            provenance: {
                                source: 'db',
                                identifier: `trip:${input.tripId}:day:${dayNumber}`,
                                timestamp: new Date().toISOString(),
                            },
                            data: {
                                dayNumber,
                                date: day.date.toISOString(),
                                itemsCount: day.ItineraryItem.length,
                                items: day.ItineraryItem.map((item) => {
                                    var _a, _b, _c, _d;
                                    return ({
                                        id: item.id,
                                        type: item.type,
                                        name: item.name,
                                        placeId: item.placeId,
                                        placeName: ((_a = item.place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = item.place) === null || _b === void 0 ? void 0 : _b.nameEN),
                                        order: item.order,
                                        durationMinutes: item.durationMinutes,
                                        distanceKm: item.distanceKm,
                                        startTime: (_c = item.startTime) === null || _c === void 0 ? void 0 : _c.toISOString(),
                                        endTime: (_d = item.endTime) === null || _d === void 0 ? void 0 : _d.toISOString(),
                                    });
                                }),
                            },
                        });
                    }
                }
            }
            if (selectedSegments.length > 0) {
                const allItems = await this.prisma.itineraryItem.findMany({
                    where: {
                        TripDay: {
                            tripId: input.tripId,
                        },
                    },
                    include: {
                        TripDay: true,
                        Place: true,
                    },
                    orderBy: [
                        { TripDay: { date: 'asc' } },
                        { startTime: 'asc' },
                    ],
                });
                for (const segmentId of selectedSegments) {
                    let segmentItems = allItems.filter((item) => item.id === segmentId);
                    if (segmentItems.length === 0 && /^\d+$/.test(segmentId)) {
                        const segmentIndex = parseInt(segmentId, 10);
                        const transportItems = allItems.filter((item) => item.type === 'TRANSIT');
                        if (transportItems[segmentIndex - 1]) {
                            segmentItems = [transportItems[segmentIndex - 1]];
                        }
                    }
                    if (segmentItems.length === 0) {
                        const match = segmentId.match(/^(drive|fly|ferry|transit)_(\d+)$/i);
                        if (match) {
                            const index = parseInt(match[2], 10) - 1;
                            const transportItems = allItems.filter((item) => item.type === 'TRANSIT');
                            if (transportItems[index]) {
                                segmentItems = [transportItems[index]];
                            }
                        }
                    }
                    if (segmentItems.length > 0) {
                        const dayNumber = segmentItems[0].TripDay
                            ? tripDays.findIndex((day) => day.id === segmentItems[0].TripDay.id) + 1
                            : null;
                        const segmentParts = segmentItems.map((item, idx) => {
                            var _a, _b;
                            const placeName = ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.nameEN) || item.note || `Place ${item.placeId || 'Unknown'}`;
                            const parts = [];
                            parts.push(`[${item.type || 'activity'}] ${placeName}`);
                            if (item.startTime && item.endTime) {
                                const durationMs = new Date(item.endTime).getTime() - new Date(item.startTime).getTime();
                                const durationMinutes = Math.round(durationMs / (1000 * 60));
                                const hours = Math.floor(durationMinutes / 60);
                                const minutes = durationMinutes % 60;
                                parts.push(`时长: ${hours}h${minutes}m`);
                            }
                            if (item.startTime) {
                                parts.push(`开始: ${new Date(item.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
                            }
                            if (item.note) {
                                parts.push(`备注: ${item.note}`);
                            }
                            return `${idx + 1}. ${parts.join(', ')}`;
                        });
                        const segmentText = segmentParts.join('\n');
                        const dayInfo = dayNumber ? ` (第 ${dayNumber} 天)` : '';
                        blocks.push({
                            key: `PLAN_SEGMENT_${segmentId}`,
                            type: 'PLAN_SEGMENT',
                            text: `Segment ${segmentId}${dayInfo} 结构:\n${segmentText}`,
                            priority: 75,
                            visibility: 'public',
                            provenance: {
                                source: 'db',
                                identifier: `trip:${input.tripId}:segment:${segmentId}`,
                                timestamp: new Date().toISOString(),
                            },
                            data: {
                                segmentId,
                                dayNumber,
                                itemsCount: segmentItems.length,
                                items: segmentItems.map((item) => {
                                    var _a, _b, _c, _d, _e;
                                    const durationMinutes = item.startTime && item.endTime
                                        ? Math.round((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / (1000 * 60))
                                        : null;
                                    return {
                                        id: item.id,
                                        type: item.type,
                                        placeId: item.placeId,
                                        placeName: ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.nameEN),
                                        durationMinutes,
                                        startTime: (_c = item.startTime) === null || _c === void 0 ? void 0 : _c.toISOString(),
                                        endTime: (_d = item.endTime) === null || _d === void 0 ? void 0 : _d.toISOString(),
                                        note: item.note,
                                        dayId: (_e = item.TripDay) === null || _e === void 0 ? void 0 : _e.id,
                                    };
                                }),
                            },
                        });
                    }
                    else {
                        this.logger.warn(`未找到 segment: ${segmentId}`);
                        blocks.push({
                            key: `PLAN_SEGMENT_${segmentId}`,
                            type: 'PLAN_SEGMENT',
                            text: `Segment ${segmentId} 的结构（未找到对应数据）`,
                            priority: 75,
                            visibility: 'public',
                            provenance: {
                                source: 'db',
                                identifier: `trip:${input.tripId}:segment:${segmentId}`,
                                timestamp: new Date().toISOString(),
                            },
                        });
                    }
                }
            }
            if (input.scope.includes('rejection:last')) {
                const latestRejection = await this.prisma.decisionLog.findFirst({
                    where: {
                        tripId: input.tripId,
                        action: 'REJECT',
                    },
                    orderBy: {
                        timestamp: 'desc',
                    },
                });
                if (latestRejection) {
                    blocks.push({
                        key: 'REJECTION_LAST',
                        type: 'REJECTION_LOG',
                        text: `最近一次拒绝 [${latestRejection.persona}]: ${latestRejection.explanation} (原因: ${latestRejection.reasonCodes.join(', ')})`,
                        priority: 85,
                        visibility: 'public',
                        provenance: {
                            source: 'db',
                            identifier: `decision_log:${latestRejection.id}`,
                            timestamp: latestRejection.timestamp.toISOString(),
                        },
                        data: {
                            persona: latestRejection.persona,
                            action: latestRejection.action,
                            explanation: latestRejection.explanation,
                            reasonCodes: latestRejection.reasonCodes,
                            timestamp: latestRejection.timestamp.toISOString(),
                        },
                    });
                }
            }
            return {
                blocks,
                summary: {
                    selectedDays,
                    selectedSegments,
                    latestRejection: (_a = blocks.find((b) => b.key === 'REJECTION_LAST')) === null || _a === void 0 ? void 0 : _a.data,
                },
            };
        }
        catch (error) {
            this.logger.error(`选择计划切片失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.PlanSelectSlicesSkill = PlanSelectSlicesSkill;
exports.PlanSelectSlicesSkill = PlanSelectSlicesSkill = PlanSelectSlicesSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('PrismaService')),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PlanSelectSlicesSkill);
//# sourceMappingURL=plan-select-slices.skill.js.map