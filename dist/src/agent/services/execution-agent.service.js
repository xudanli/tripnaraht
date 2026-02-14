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
var ExecutionAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionAgentService = void 0;
const common_1 = require("@nestjs/common");
const exec_remind_skill_1 = require("../../skills/exec/exec-remind.skill");
const exec_handle_change_skill_1 = require("../../skills/exec/exec-handle-change.skill");
const exec_fallback_skill_1 = require("../../skills/exec/exec-fallback.skill");
const persona_shell_service_1 = require("./persona-shell.service");
const trips_service_1 = require("../../trips/trips.service");
const itinerary_items_service_1 = require("../../itinerary-items/itinerary-items.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const luxon_1 = require("luxon");
let ExecutionAgentService = ExecutionAgentService_1 = class ExecutionAgentService {
    constructor(execRemind, execHandleChange, execFallback, personaShell, tripsService, itineraryItemsService, prisma) {
        this.execRemind = execRemind;
        this.execHandleChange = execHandleChange;
        this.execFallback = execFallback;
        this.personaShell = personaShell;
        this.tripsService = tripsService;
        this.itineraryItemsService = itineraryItemsService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(ExecutionAgentService_1.name);
        this.fallbackPlanCache = new Map();
        this.logger.log(`[ExecutionAgentService] 服务已创建`);
        this.logger.log(`[ExecutionAgentService] execRemind: ${!!this.execRemind}, execHandleChange: ${!!this.execHandleChange}, execFallback: ${!!this.execFallback}`);
        this.logger.log(`[ExecutionAgentService] tripsService: ${!!this.tripsService}, itineraryItemsService: ${!!this.itineraryItemsService}, prisma: ${!!this.prisma}`);
    }
    async execute(request) {
        var _a, _b, _c;
        this.logger.debug(`执行执行阶段 Agent: tripId=${request.tripId}, action=${request.action}`);
        try {
            const currentDate = new Date().toISOString().split('T')[0];
            const executionState = {
                tripId: request.tripId,
                phase: 'ON_TRIP',
                currentDay: 1,
                currentDate,
                reminders: [],
                pendingChanges: [],
                activeFallbacks: [],
                lastUpdated: new Date().toISOString(),
            };
            const uiOutput = {};
            switch (request.action) {
                case 'remind':
                    if (this.execRemind) {
                        const remindResult = await this.execRemind.execute({
                            tripId: request.tripId,
                            currentDate,
                            reminderTypes: (_a = request.remindParams) === null || _a === void 0 ? void 0 : _a.reminderTypes,
                            advanceHours: (_b = request.remindParams) === null || _b === void 0 ? void 0 : _b.advanceHours,
                        });
                        executionState.reminders = remindResult.reminders;
                        uiOutput.reminders = remindResult.reminders;
                    }
                    break;
                case 'handle_change':
                    if (this.execHandleChange && request.changeParams) {
                        const changeResult = await this.execHandleChange.execute({
                            tripId: request.tripId,
                            changeType: request.changeParams.changeType,
                            changeDetails: request.changeParams.changeDetails,
                        });
                        executionState.pendingChanges.push(changeResult.result);
                        executionState.phase = 'CHANGE_HANDLING';
                        const enhancedResult = {
                            ...changeResult.result,
                            success: true,
                            message: '变更已处理',
                        };
                        if (this.tripsService) {
                            try {
                                const scheduleResult = await this.tripsService.getSchedule(request.tripId, currentDate);
                                if (scheduleResult && scheduleResult.schedule) {
                                    const scheduleItems = ((_c = scheduleResult.schedule.stops) === null || _c === void 0 ? void 0 : _c.map((stop) => {
                                        var _a;
                                        return ({
                                            placeId: ((_a = stop.id) === null || _a === void 0 ? void 0 : _a.replace('poi-', '')) || 0,
                                            placeName: stop.name || '未知地点',
                                            startTime: this.minutesToTimeString(stop.startMin),
                                            endTime: this.minutesToTimeString(stop.endMin),
                                            status: 'upcoming',
                                        });
                                    })) || [];
                                    enhancedResult.updatedSchedule = {
                                        date: currentDate,
                                        schedule: {
                                            items: scheduleItems,
                                        },
                                    };
                                }
                            }
                            catch (error) {
                                this.logger.warn(`获取更新后的时间线失败: ${error.message}`);
                            }
                        }
                        uiOutput.changeResult = enhancedResult;
                    }
                    break;
                case 'fallback':
                    if (this.execFallback && request.fallbackParams) {
                        const fallbackResult = await this.execFallback.execute({
                            tripId: request.tripId,
                            triggerReason: request.fallbackParams.triggerReason,
                            originalPlan: request.fallbackParams.originalPlan,
                        });
                        executionState.activeFallbacks.push(fallbackResult.fallbackPlan);
                        executionState.phase = 'FALLBACK';
                        uiOutput.fallbackPlan = fallbackResult.fallbackPlan;
                        this.fallbackPlanCache.set(fallbackResult.fallbackPlan.id, fallbackResult.fallbackPlan);
                        if (fallbackResult.fallbackPlan.solutions) {
                            for (const solution of fallbackResult.fallbackPlan.solutions) {
                                this.fallbackPlanCache.set(solution.id, fallbackResult.fallbackPlan);
                            }
                        }
                    }
                    break;
                case 'get_status':
                    uiOutput.status = {
                        currentDay: executionState.currentDay,
                        currentDate: executionState.currentDate,
                        phase: executionState.phase,
                        activeIssues: executionState.pendingChanges.length + executionState.activeFallbacks.length,
                    };
                    break;
            }
            return {
                executionState,
                uiOutput,
            };
        }
        catch (error) {
            this.logger.error(`执行阶段 Agent 执行失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async reorder(request) {
        var _a;
        this.logger.debug(`重新排序行程: tripId=${request.tripId}, dayId=${request.dayId}`);
        if (!this.itineraryItemsService || !this.prisma) {
            throw new common_1.BadRequestException('ItineraryItemsService 或 PrismaService 未注入');
        }
        const items = await this.itineraryItemsService.findByTripDay(request.dayId);
        if (items.length === 0) {
            throw new common_1.NotFoundException(`日期 ${request.dayId} 没有行程项`);
        }
        if (request.newOrder.length !== items.length) {
            throw new common_1.BadRequestException(`newOrder 数组长度 (${request.newOrder.length}) 与行程项数量 (${items.length}) 不匹配`);
        }
        const itemMap = new Map(items.map(item => [item.id, item]));
        for (const itemId of request.newOrder) {
            if (!itemMap.has(itemId)) {
                throw new common_1.BadRequestException(`行程项 ${itemId} 不存在于指定日期`);
            }
        }
        const tripDay = await this.prisma.tripDay.findUnique({
            where: { id: request.dayId },
        });
        if (!tripDay) {
            throw new common_1.NotFoundException(`日期 ${request.dayId} 不存在`);
        }
        const dayDate = luxon_1.DateTime.fromJSDate(tripDay.date);
        const dateISO = dayDate.toISODate() || '';
        const timeAdjustments = [];
        const conflicts = [];
        let currentStartMinutes = 9 * 60;
        const updates = [];
        for (const itemId of request.newOrder) {
            const item = itemMap.get(itemId);
            if (!item.startTime || !item.endTime) {
                conflicts.push({
                    type: 'missing_time',
                    message: `行程项 ${itemId} 缺少时间信息`,
                });
                continue;
            }
            const originalStart = luxon_1.DateTime.fromJSDate(item.startTime);
            const originalEnd = luxon_1.DateTime.fromJSDate(item.endTime);
            const duration = originalEnd.diff(originalStart, 'minutes').minutes;
            const newStartTime = dayDate.startOf('day').plus({ minutes: currentStartMinutes });
            const newEndTime = newStartTime.plus({ minutes: duration });
            updates.push({
                id: itemId,
                startTime: newStartTime.toJSDate(),
                endTime: newEndTime.toJSDate(),
            });
            timeAdjustments.push({
                itemId,
                originalTime: originalStart.toFormat('HH:mm'),
                newTime: newStartTime.toFormat('HH:mm'),
            });
            currentStartMinutes += duration + 30;
        }
        if (updates.length > 0) {
            await this.prisma.$transaction(updates.map(update => this.prisma.itineraryItem.update({
                where: { id: update.id },
                data: {
                    startTime: update.startTime,
                    endTime: update.endTime,
                },
            })));
        }
        let updatedSchedule = null;
        if (this.tripsService) {
            try {
                const scheduleResult = await this.tripsService.getSchedule(request.tripId, dateISO);
                if (scheduleResult && scheduleResult.schedule) {
                    const scheduleItems = ((_a = scheduleResult.schedule.stops) === null || _a === void 0 ? void 0 : _a.map((stop) => {
                        var _a;
                        return ({
                            placeId: ((_a = stop.id) === null || _a === void 0 ? void 0 : _a.replace('poi-', '')) || 0,
                            placeName: stop.name || '未知地点',
                            startTime: this.minutesToTimeString(stop.startMin),
                            endTime: this.minutesToTimeString(stop.endMin),
                            status: 'upcoming',
                        });
                    })) || [];
                    updatedSchedule = {
                        date: dateISO,
                        schedule: {
                            items: scheduleItems,
                        },
                    };
                }
            }
            catch (error) {
                this.logger.warn(`获取更新后的时间线失败: ${error.message}`);
            }
        }
        return {
            success: true,
            message: '行程已重新排序',
            updatedSchedule,
            impact: {
                timeAdjustments,
                conflicts: conflicts.length > 0 ? conflicts : undefined,
            },
        };
    }
    async applyFallback(request) {
        var _a;
        this.logger.debug(`应用修复方案: tripId=${request.tripId}, solutionId=${request.solutionId}`);
        if (!this.itineraryItemsService || !this.prisma) {
            throw new common_1.BadRequestException('ItineraryItemsService 或 PrismaService 未注入');
        }
        const fallbackPlan = this.fallbackPlanCache.get(request.solutionId);
        if (!fallbackPlan || !fallbackPlan.solutions) {
            throw new common_1.NotFoundException(`修复方案 ${request.solutionId} 不存在或已过期`);
        }
        const solution = fallbackPlan.solutions.find(s => s.id === request.solutionId);
        if (!solution) {
            throw new common_1.NotFoundException(`修复方案 ${request.solutionId} 不存在`);
        }
        const appliedChanges = [];
        if (solution.changes && solution.changes.length > 0) {
            for (const change of solution.changes) {
                try {
                    if (change.action === 'modify' && change.itemId) {
                        const updateData = {};
                        if (change.newTime) {
                            const [hours, minutes] = change.newTime.split(':').map(Number);
                            const dayDate = luxon_1.DateTime.now().startOf('day');
                            updateData.startTime = dayDate.plus({ hours, minutes }).toJSDate();
                            updateData.endTime = dayDate.plus({ hours: hours + 2, minutes }).toJSDate();
                        }
                        if (change.newPlace) {
                            updateData.placeId = change.newPlace.id;
                        }
                        if (Object.keys(updateData).length > 0) {
                            await this.itineraryItemsService.update(change.itemId, updateData);
                            appliedChanges.push({
                                itemId: change.itemId,
                                action: 'modified',
                                details: updateData,
                            });
                        }
                    }
                    else if (change.action === 'remove' && change.itemId) {
                        await this.itineraryItemsService.remove(change.itemId);
                        appliedChanges.push({
                            itemId: change.itemId,
                            action: 'removed',
                            details: {},
                        });
                    }
                    else if (change.action === 'add' && change.newPlace) {
                        appliedChanges.push({
                            itemId: 'new',
                            action: 'added',
                            details: change.newPlace,
                        });
                    }
                }
                catch (error) {
                    this.logger.warn(`应用变更失败: itemId=${change.itemId}, error=${error.message}`);
                }
            }
        }
        let updatedSchedule = null;
        const currentDate = new Date().toISOString().split('T')[0];
        if (this.tripsService) {
            try {
                const scheduleResult = await this.tripsService.getSchedule(request.tripId, currentDate);
                if (scheduleResult && scheduleResult.schedule) {
                    const scheduleItems = ((_a = scheduleResult.schedule.stops) === null || _a === void 0 ? void 0 : _a.map((stop) => {
                        var _a;
                        return ({
                            placeId: ((_a = stop.id) === null || _a === void 0 ? void 0 : _a.replace('poi-', '')) || 0,
                            placeName: stop.name || '未知地点',
                            startTime: this.minutesToTimeString(stop.startMin),
                            endTime: this.minutesToTimeString(stop.endMin),
                            status: 'upcoming',
                        });
                    })) || [];
                    updatedSchedule = {
                        date: currentDate,
                        schedule: {
                            items: scheduleItems,
                        },
                    };
                }
            }
            catch (error) {
                this.logger.warn(`获取更新后的时间线失败: ${error.message}`);
            }
        }
        return {
            success: true,
            message: '修复方案已应用',
            appliedChanges,
            updatedSchedule,
            impact: solution.impact,
        };
    }
    async previewFallback(solutionId) {
        this.logger.debug(`预览修复方案: solutionId=${solutionId}`);
        const fallbackPlan = this.fallbackPlanCache.get(solutionId);
        if (!fallbackPlan || !fallbackPlan.solutions) {
            throw new common_1.NotFoundException(`修复方案 ${solutionId} 不存在或已过期`);
        }
        const solution = fallbackPlan.solutions.find(s => s.id === solutionId);
        if (!solution) {
            throw new common_1.NotFoundException(`修复方案 ${solutionId} 不存在`);
        }
        return {
            solutionId: solution.id,
            type: solution.type,
            title: solution.title,
            description: solution.description,
            changes: solution.changes.map(change => {
                var _a;
                return ({
                    itemId: change.itemId,
                    action: change.action,
                    original: change.action === 'modify' ? {
                        placeName: '原始地点',
                        startTime: '09:00',
                        endTime: '11:00',
                    } : undefined,
                    modified: change.action === 'modify' ? {
                        placeName: ((_a = change.newPlace) === null || _a === void 0 ? void 0 : _a.name) || '新地点',
                        startTime: change.newTime || '10:00',
                        endTime: change.newTime ? this.addHours(change.newTime, 2) : '12:00',
                    } : undefined,
                    reason: `根据${solution.type}方案调整`,
                });
            }),
            impact: solution.impact,
            timeline: {
                date: new Date().toISOString().split('T')[0],
                schedule: {
                    items: [],
                },
            },
        };
    }
    minutesToTimeString(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
    addHours(timeStr, hours) {
        const [h, m] = timeStr.split(':').map(Number);
        const newHour = (h + hours) % 24;
        return `${newHour.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
};
exports.ExecutionAgentService = ExecutionAgentService;
exports.ExecutionAgentService = ExecutionAgentService = ExecutionAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => trips_service_1.TripsService))),
    __param(5, (0, common_1.Optional)()),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => itinerary_items_service_1.ItineraryItemsService))),
    __param(6, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [exec_remind_skill_1.ExecRemindSkill,
        exec_handle_change_skill_1.ExecHandleChangeSkill,
        exec_fallback_skill_1.ExecFallbackSkill,
        persona_shell_service_1.PersonaShellService,
        trips_service_1.TripsService,
        itinerary_items_service_1.ItineraryItemsService,
        prisma_service_1.PrismaService])
], ExecutionAgentService);
//# sourceMappingURL=execution-agent.service.js.map