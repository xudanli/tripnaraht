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
var TripSuggestionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripSuggestionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const suggestions_dto_1 = require("../dto/suggestions.dto");
const trips_service_1 = require("../trips.service");
const trip_conflicts_service_1 = require("./trip-conflicts.service");
const trip_metrics_service_1 = require("./trip-metrics.service");
const itinerary_items_service_1 = require("../../itinerary-items/itinerary-items.service");
const persona_alerts_dto_1 = require("../dto/persona-alerts.dto");
const trip_conflicts_dto_1 = require("../dto/trip-conflicts.dto");
const luxon_1 = require("luxon");
let TripSuggestionsService = TripSuggestionsService_1 = class TripSuggestionsService {
    constructor(prisma, tripsService, conflictsService, tripMetricsService, itineraryItemsService) {
        this.prisma = prisma;
        this.tripsService = tripsService;
        this.conflictsService = conflictsService;
        this.tripMetricsService = tripMetricsService;
        this.itineraryItemsService = itineraryItemsService;
        this.logger = new common_1.Logger(TripSuggestionsService_1.name);
        this.suggestionStatuses = new Map();
    }
    async getSuggestions(tripId, filters) {
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
        const limit = (filters === null || filters === void 0 ? void 0 : filters.limit) || 100;
        const offset = (filters === null || filters === void 0 ? void 0 : filters.offset) || 0;
        const suggestions = [];
        const personaAlerts = await this.tripsService.getPersonaAlerts(tripId);
        for (const alert of personaAlerts) {
            const suggestion = this.convertPersonaAlertToSuggestion(alert, tripId, trip);
            if (this.matchesFilters(suggestion, filters)) {
                suggestions.push(suggestion);
            }
        }
        const conflicts = await this.conflictsService.getConflicts(tripId);
        for (const conflict of conflicts.conflicts) {
            const conflictSuggestions = this.convertConflictToSuggestions(conflict, tripId, trip);
            for (const suggestion of conflictSuggestions) {
                if (this.matchesFilters(suggestion, filters)) {
                    suggestions.push(suggestion);
                }
            }
        }
        let filteredSuggestions = suggestions;
        if (filters === null || filters === void 0 ? void 0 : filters.status) {
            filteredSuggestions = suggestions.filter(s => {
                const status = this.suggestionStatuses.get(s.id) || suggestions_dto_1.SuggestionStatus.NEW;
                return status === filters.status;
            });
        }
        filteredSuggestions.sort((a, b) => {
            const severityOrder = {
                [suggestions_dto_1.SuggestionSeverity.BLOCKER]: 3,
                [suggestions_dto_1.SuggestionSeverity.WARN]: 2,
                [suggestions_dto_1.SuggestionSeverity.INFO]: 1,
            };
            const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
            if (severityDiff !== 0)
                return severityDiff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        const total = filteredSuggestions.length;
        const paginated = filteredSuggestions.slice(offset, offset + limit);
        return {
            items: paginated,
            total,
            filters: filters ? {
                persona: filters.persona,
                scope: filters.scope,
                scopeId: filters.scopeId,
                severity: filters.severity,
                status: filters.status,
            } : undefined,
        };
    }
    async getSuggestionStats(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: true,
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const allSuggestions = await this.getSuggestions(tripId, { limit: 1000 });
        const byPersona = {
            abu: { total: 0, bySeverity: { blocker: 0, warn: 0, info: 0 } },
            drdre: { total: 0, bySeverity: { blocker: 0, warn: 0, info: 0 } },
            neptune: { total: 0, bySeverity: { blocker: 0, warn: 0, info: 0 } },
        };
        const byScope = {
            trip: 0,
            day: {},
            item: {},
        };
        for (const suggestion of allSuggestions.items) {
            const status = this.suggestionStatuses.get(suggestion.id) || suggestions_dto_1.SuggestionStatus.NEW;
            if (status === suggestions_dto_1.SuggestionStatus.APPLIED || status === suggestions_dto_1.SuggestionStatus.DISMISSED) {
                continue;
            }
            const personaKey = suggestion.persona;
            if (byPersona[personaKey]) {
                byPersona[personaKey].total++;
                const severityKey = suggestion.severity === suggestions_dto_1.SuggestionSeverity.BLOCKER ? 'blocker' :
                    suggestion.severity === suggestions_dto_1.SuggestionSeverity.WARN ? 'warn' : 'info';
                byPersona[personaKey].bySeverity[severityKey]++;
            }
            if (suggestion.scope === suggestions_dto_1.SuggestionScope.TRIP) {
                byScope.trip++;
            }
            else if (suggestion.scope === suggestions_dto_1.SuggestionScope.DAY && suggestion.scopeId) {
                byScope.day[suggestion.scopeId] = (byScope.day[suggestion.scopeId] || 0) + 1;
            }
            else if (suggestion.scope === suggestions_dto_1.SuggestionScope.ITEM && suggestion.scopeId) {
                byScope.item[suggestion.scopeId] = (byScope.item[suggestion.scopeId] || 0) + 1;
            }
        }
        return {
            tripId,
            byPersona,
            byScope,
        };
    }
    async calculateMetricsImpact(tripId, beforeMetrics, afterMetrics) {
        return {
            fatigue: afterMetrics.fatigue - beforeMetrics.fatigue,
            buffer: afterMetrics.buffer - beforeMetrics.buffer,
            cost: afterMetrics.cost - beforeMetrics.cost,
        };
    }
    async getCurrentTripMetrics(tripId) {
        try {
            const metrics = await this.tripMetricsService.getTripMetrics(tripId);
            return {
                fatigue: metrics.summary.totalFatigue || 0,
                buffer: metrics.summary.totalBuffer || 0,
                cost: metrics.summary.totalCost || 0,
            };
        }
        catch (error) {
            this.logger.warn(`获取行程指标失败: ${error.message}，使用默认值`);
            return {
                fatigue: 0,
                buffer: 0,
                cost: 0,
            };
        }
    }
    async applyHighPrioritySuggestions(tripId, options) {
        const allSuggestions = await this.getSuggestions(tripId, {
            severity: suggestions_dto_1.SuggestionSeverity.BLOCKER,
            status: suggestions_dto_1.SuggestionStatus.NEW,
            limit: (options === null || options === void 0 ? void 0 : options.limit) || 100
        });
        const highPrioritySuggestions = allSuggestions.items.filter(s => {
            const status = this.suggestionStatuses.get(s.id) || suggestions_dto_1.SuggestionStatus.NEW;
            return status === suggestions_dto_1.SuggestionStatus.NEW && s.severity === suggestions_dto_1.SuggestionSeverity.BLOCKER;
        });
        if (highPrioritySuggestions.length === 0) {
            return {
                success: true,
                appliedCount: 0,
                suggestions: [],
            };
        }
        if (options === null || options === void 0 ? void 0 : options.preview) {
            const currentMetrics = await this.getCurrentTripMetrics(tripId);
            const estimatedImpact = this.estimateImpactBySuggestionType(highPrioritySuggestions, currentMetrics);
            return {
                success: true,
                appliedCount: highPrioritySuggestions.length,
                suggestions: highPrioritySuggestions.map(s => ({
                    id: s.id,
                    title: s.title,
                    severity: s.severity,
                    applied: false,
                })),
                impact: {
                    metrics: estimatedImpact,
                    risks: [],
                },
            };
        }
        const beforeMetrics = await this.getCurrentTripMetrics(tripId);
        const results = [];
        let successCount = 0;
        for (const suggestion of highPrioritySuggestions) {
            try {
                const primaryAction = suggestion.actions.find(a => a.primary) || suggestion.actions[0];
                if (!primaryAction) {
                    results.push({
                        id: suggestion.id,
                        title: suggestion.title,
                        severity: suggestion.severity,
                        applied: false,
                        error: '没有可执行的操作',
                    });
                    continue;
                }
                await this.applySuggestion(tripId, suggestion.id, {
                    actionId: primaryAction.id,
                    preview: false,
                });
                results.push({
                    id: suggestion.id,
                    title: suggestion.title,
                    severity: suggestion.severity,
                    applied: true,
                });
                successCount++;
            }
            catch (error) {
                this.logger.warn(`应用建议失败: ${suggestion.id}, error=${error.message}`);
                results.push({
                    id: suggestion.id,
                    title: suggestion.title,
                    severity: suggestion.severity,
                    applied: false,
                    error: error.message,
                });
            }
        }
        const afterMetrics = await this.getCurrentTripMetrics(tripId);
        const actualImpact = await this.calculateMetricsImpact(tripId, beforeMetrics, afterMetrics);
        return {
            success: successCount > 0,
            appliedCount: successCount,
            suggestions: results,
            impact: {
                metrics: actualImpact,
                risks: [],
            },
        };
    }
    estimateImpactBySuggestionType(suggestions, currentMetrics) {
        var _a, _b;
        let fatigueDelta = 0;
        let bufferDelta = 0;
        let costDelta = 0;
        for (const suggestion of suggestions) {
            const conflictType = (_a = suggestion.metadata) === null || _a === void 0 ? void 0 : _a.conflictType;
            switch (conflictType) {
                case 'TIME_CONFLICT':
                    const conflictData = (_b = suggestion.metadata) === null || _b === void 0 ? void 0 : _b.conflict;
                    const overlapMinutes = (conflictData === null || conflictData === void 0 ? void 0 : conflictData.overlapMinutes) || 30;
                    const bufferIncrease = Math.max(overlapMinutes, 15);
                    bufferDelta += bufferIncrease;
                    const fatigueDecrease = Math.min(Math.max(-2, -Math.floor(overlapMinutes / 15)), -5);
                    fatigueDelta += fatigueDecrease;
                    costDelta += 0;
                    break;
                case 'FATIGUE_EXCEEDED':
                    fatigueDelta -= 10;
                    bufferDelta += 15;
                    costDelta -= 30;
                    break;
                case 'BUFFER_INSUFFICIENT':
                    bufferDelta += 60;
                    fatigueDelta -= 2;
                    costDelta += 100;
                    break;
                default:
                    fatigueDelta -= 5;
                    bufferDelta += 30;
                    costDelta += 50;
            }
        }
        return {
            fatigue: fatigueDelta,
            buffer: bufferDelta,
            cost: costDelta,
        };
    }
    async applySuggestion(tripId, suggestionId, request) {
        var _a, _b;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const allSuggestions = await this.getSuggestions(tripId, { limit: 1000 });
        const suggestion = allSuggestions.items.find(s => s.id === suggestionId);
        if (!suggestion) {
            throw new common_1.NotFoundException(`建议 ID ${suggestionId} 不存在`);
        }
        if (request.preview) {
            const currentMetrics = await this.getCurrentTripMetrics(tripId);
            const estimatedImpact = this.estimateImpactBySuggestionType([suggestion], currentMetrics);
            return {
                success: true,
                suggestionId,
                appliedChanges: [],
                impact: {
                    metrics: estimatedImpact,
                    risks: [],
                },
            };
        }
        const beforeMetrics = await this.getCurrentTripMetrics(tripId);
        const appliedChanges = [];
        const triggeredSuggestions = [];
        const conflictType = (_a = suggestion.metadata) === null || _a === void 0 ? void 0 : _a.conflictType;
        if (conflictType === 'TIME_CONFLICT' && ((_b = suggestion.metadata) === null || _b === void 0 ? void 0 : _b.conflict)) {
            const conflict = suggestion.metadata.conflict;
            const affectedItemIds = conflict.affectedItemIds || [];
            if (affectedItemIds.length >= 2 && this.itineraryItemsService) {
                try {
                    const items = await Promise.all(affectedItemIds.map(id => this.prisma.itineraryItem.findUnique({
                        where: { id },
                        include: { TripDay: true },
                    })));
                    const validItems = items.filter(item => item !== null);
                    if (validItems.length >= 2) {
                        validItems.sort((a, b) => {
                            if (!a.startTime || !b.startTime)
                                return 0;
                            return a.startTime.getTime() - b.startTime.getTime();
                        });
                        const firstItem = validItems[0];
                        const secondItem = validItems[1];
                        if (firstItem.endTime && secondItem.startTime) {
                            const firstEnd = luxon_1.DateTime.fromJSDate(firstItem.endTime);
                            const secondStart = luxon_1.DateTime.fromJSDate(secondItem.startTime);
                            if (firstEnd > secondStart) {
                                const newStartTime = firstEnd.plus({ minutes: 15 });
                                const originalDuration = secondItem.endTime
                                    ? luxon_1.DateTime.fromJSDate(secondItem.endTime).diff(secondStart, 'minutes').minutes
                                    : 120;
                                const newEndTime = newStartTime.plus({ minutes: originalDuration });
                                await this.itineraryItemsService.update(secondItem.id, {
                                    startTime: newStartTime.toISO(),
                                    endTime: newEndTime.toISO(),
                                    cascadeMode: 'auto',
                                });
                                appliedChanges.push({
                                    type: 'time_adjustment',
                                    description: `已调整活动时间，解决时间冲突`,
                                });
                                this.logger.debug(`已解决时间冲突: 调整了行程项 ${secondItem.id} 的时间`);
                            }
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`解决时间冲突失败: ${error.message}`, error.stack);
                }
            }
        }
        switch (request.actionId) {
            case 'apply_alternative':
                appliedChanges.push({
                    type: 'route_replacement',
                    description: `已应用替代方案`,
                });
                break;
            case 'adjust_rhythm':
                appliedChanges.push({
                    type: 'rhythm_adjustment',
                    description: `已调整行程节奏`,
                });
                break;
            case 'add_buffer':
                appliedChanges.push({
                    type: 'buffer_insertion',
                    description: `已添加缓冲时间`,
                });
                break;
            default:
                if (appliedChanges.length === 0) {
                    appliedChanges.push({
                        type: 'generic',
                        description: `已应用建议：${suggestion.title}`,
                    });
                }
        }
        this.suggestionStatuses.set(suggestionId, suggestions_dto_1.SuggestionStatus.APPLIED);
        const relatedSuggestions = allSuggestions.items.filter(s => s.id !== suggestionId &&
            s.scope === suggestion.scope &&
            s.scopeId === suggestion.scopeId);
        triggeredSuggestions.push(...relatedSuggestions.slice(0, 3).map(s => s.id));
        const afterMetrics = await this.getCurrentTripMetrics(tripId);
        const actualImpact = await this.calculateMetricsImpact(tripId, beforeMetrics, afterMetrics);
        const risks = [];
        if (actualImpact.buffer && actualImpact.buffer > 0) {
            risks.push({
                id: 'risk-buffer-improved',
                severity: suggestions_dto_1.SuggestionSeverity.INFO,
                title: '缓冲时间已增加',
            });
        }
        if (actualImpact.fatigue && actualImpact.fatigue < 0) {
            risks.push({
                id: 'risk-fatigue-improved',
                severity: suggestions_dto_1.SuggestionSeverity.INFO,
                title: '疲劳指数已改善',
            });
        }
        if (actualImpact.cost && actualImpact.cost > 100) {
            risks.push({
                id: 'risk-cost-increased',
                severity: suggestions_dto_1.SuggestionSeverity.WARN,
                title: '费用有所增加',
            });
        }
        return {
            success: true,
            suggestionId,
            appliedChanges,
            impact: {
                metrics: actualImpact,
                risks: risks.length > 0 ? risks : [
                    {
                        id: 'risk-generic',
                        severity: suggestions_dto_1.SuggestionSeverity.INFO,
                        title: '建议已应用',
                    },
                ],
            },
            triggeredSuggestions,
        };
    }
    async dismissSuggestion(tripId, suggestionId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const allSuggestions = await this.getSuggestions(tripId, { limit: 1000 });
        const suggestion = allSuggestions.items.find(s => s.id === suggestionId);
        if (!suggestion) {
            throw new common_1.NotFoundException(`建议 ID ${suggestionId} 不存在`);
        }
        this.suggestionStatuses.set(suggestionId, suggestions_dto_1.SuggestionStatus.DISMISSED);
    }
    convertPersonaAlertToSuggestion(alert, tripId, trip) {
        var _a, _b, _c, _d, _e, _f;
        const personaMap = {
            [persona_alerts_dto_1.PersonaType.ABU]: suggestions_dto_1.SuggestionPersona.ABU,
            [persona_alerts_dto_1.PersonaType.DR_DRE]: suggestions_dto_1.SuggestionPersona.DR_DRE,
            [persona_alerts_dto_1.PersonaType.NEPTUNE]: suggestions_dto_1.SuggestionPersona.NEPTUNE,
        };
        const severityMap = {
            [persona_alerts_dto_1.AlertSeverity.WARNING]: suggestions_dto_1.SuggestionSeverity.WARN,
            [persona_alerts_dto_1.AlertSeverity.INFO]: suggestions_dto_1.SuggestionSeverity.INFO,
            [persona_alerts_dto_1.AlertSeverity.SUCCESS]: suggestions_dto_1.SuggestionSeverity.INFO,
        };
        let scope = suggestions_dto_1.SuggestionScope.TRIP;
        let scopeId;
        if ((_a = alert.metadata) === null || _a === void 0 ? void 0 : _a.dayId) {
            scope = suggestions_dto_1.SuggestionScope.DAY;
            scopeId = alert.metadata.dayId;
        }
        else if ((_b = alert.metadata) === null || _b === void 0 ? void 0 : _b.itemId) {
            scope = suggestions_dto_1.SuggestionScope.ITEM;
            scopeId = alert.metadata.itemId;
        }
        const actions = [];
        if (alert.persona === persona_alerts_dto_1.PersonaType.ABU) {
            if (((_c = alert.metadata) === null || _c === void 0 ? void 0 : _c.evidenceRefs) && alert.metadata.evidenceRefs.length > 0) {
                actions.push({
                    id: 'view_evidence',
                    label: '查看证据',
                    type: 'view_evidence',
                    primary: true,
                });
            }
            if (((_d = alert.metadata) === null || _d === void 0 ? void 0 : _d.alternatives) && alert.metadata.alternatives.length > 0) {
                actions.push({
                    id: 'apply_alternative',
                    label: '应用替代方案',
                    type: 'apply',
                    primary: false,
                });
            }
        }
        else if (alert.persona === persona_alerts_dto_1.PersonaType.DR_DRE) {
            actions.push({
                id: 'adjust_rhythm',
                label: '调整节奏',
                type: 'adjust_rhythm',
                primary: true,
            });
            actions.push({
                id: 'add_buffer',
                label: '添加缓冲时间',
                type: 'apply',
                primary: false,
            });
        }
        else if (alert.persona === persona_alerts_dto_1.PersonaType.NEPTUNE) {
            if (((_e = alert.metadata) === null || _e === void 0 ? void 0 : _e.alternatives) && alert.metadata.alternatives.length > 0) {
                actions.push({
                    id: 'view_alternatives',
                    label: '查看替代方案',
                    type: 'view_alternatives',
                    primary: true,
                });
                actions.push({
                    id: 'apply_alternative',
                    label: '应用替代方案',
                    type: 'apply',
                    primary: false,
                });
            }
        }
        if (actions.length === 0) {
            actions.push({
                id: 'dismiss',
                label: '忽略',
                type: 'dismiss',
                primary: false,
            });
        }
        const evidence = [];
        if ((_f = alert.metadata) === null || _f === void 0 ? void 0 : _f.evidenceRefs) {
            for (const ref of alert.metadata.evidenceRefs) {
                evidence.push({
                    id: ref,
                    type: 'other',
                    title: '相关证据',
                    description: `证据引用: ${ref}`,
                });
            }
        }
        return {
            id: alert.id,
            persona: personaMap[alert.persona] || suggestions_dto_1.SuggestionPersona.ABU,
            scope,
            scopeId,
            severity: severityMap[alert.severity] || suggestions_dto_1.SuggestionSeverity.INFO,
            status: this.suggestionStatuses.get(alert.id) || suggestions_dto_1.SuggestionStatus.NEW,
            title: alert.title,
            summary: alert.message.split('\n')[0] || alert.message,
            description: alert.message,
            evidence: evidence.length > 0 ? evidence : undefined,
            actions,
            createdAt: alert.createdAt,
            metadata: {
                ...alert.metadata,
                originalPersona: alert.persona,
                originalSeverity: alert.severity,
            },
        };
    }
    convertConflictToSuggestions(conflict, tripId, trip) {
        var _a, _b;
        const suggestions = [];
        let persona = suggestions_dto_1.SuggestionPersona.DR_DRE;
        if (conflict.type === 'CLOSURE_RISK' || conflict.type === 'ACCESSIBILITY_MISMATCH') {
            persona = suggestions_dto_1.SuggestionPersona.ABU;
        }
        else if (conflict.type === 'FATIGUE_EXCEEDED' || conflict.type === 'BUFFER_INSUFFICIENT') {
            persona = suggestions_dto_1.SuggestionPersona.DR_DRE;
        }
        const severityMap = {
            [trip_conflicts_dto_1.ConflictSeverity.HIGH]: suggestions_dto_1.SuggestionSeverity.BLOCKER,
            [trip_conflicts_dto_1.ConflictSeverity.MEDIUM]: suggestions_dto_1.SuggestionSeverity.WARN,
            [trip_conflicts_dto_1.ConflictSeverity.LOW]: suggestions_dto_1.SuggestionSeverity.INFO,
        };
        for (const dayDate of conflict.affectedDays) {
            const day = (_a = trip.TripDay) === null || _a === void 0 ? void 0 : _a.find((d) => {
                const dayDateStr = luxon_1.DateTime.fromJSDate(d.date).toISODate();
                return dayDateStr === dayDate;
            });
            const suggestion = {
                id: `conflict-${conflict.id}-${dayDate}`,
                persona,
                scope: suggestions_dto_1.SuggestionScope.DAY,
                scopeId: day === null || day === void 0 ? void 0 : day.id,
                severity: severityMap[conflict.severity] || suggestions_dto_1.SuggestionSeverity.INFO,
                status: this.suggestionStatuses.get(`conflict-${conflict.id}-${dayDate}`) || suggestions_dto_1.SuggestionStatus.NEW,
                title: conflict.title,
                summary: conflict.description,
                description: conflict.description,
                actions: ((_b = conflict.suggestions) === null || _b === void 0 ? void 0 : _b.map((s, idx) => ({
                    id: `action-${idx}`,
                    label: s.action,
                    type: 'apply',
                    primary: idx === 0,
                }))) || [
                    {
                        id: 'dismiss',
                        label: '忽略',
                        type: 'dismiss',
                        primary: false,
                    },
                ],
                createdAt: new Date().toISOString(),
                metadata: {
                    conflictType: conflict.type,
                    affectedItemIds: conflict.affectedItemIds,
                    conflict: {
                        id: conflict.id,
                        type: conflict.type,
                        severity: conflict.severity,
                        overlapMinutes: conflict.overlapMinutes,
                        affectedDays: conflict.affectedDays,
                        affectedItemIds: conflict.affectedItemIds,
                    },
                },
            };
            suggestions.push(suggestion);
        }
        return suggestions;
    }
    matchesFilters(suggestion, filters) {
        if (!filters)
            return true;
        if (filters.persona && suggestion.persona !== filters.persona)
            return false;
        if (filters.scope && suggestion.scope !== filters.scope)
            return false;
        if (filters.scopeId && suggestion.scopeId !== filters.scopeId)
            return false;
        if (filters.severity && suggestion.severity !== filters.severity)
            return false;
        return true;
    }
};
exports.TripSuggestionsService = TripSuggestionsService;
exports.TripSuggestionsService = TripSuggestionsService = TripSuggestionsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trips_service_1.TripsService,
        trip_conflicts_service_1.TripConflictsService,
        trip_metrics_service_1.TripMetricsService,
        itinerary_items_service_1.ItineraryItemsService])
], TripSuggestionsService);
//# sourceMappingURL=trip-suggestions.service.js.map