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
var TripSuggestionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripSuggestionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const suggestions_dto_1 = require("../dto/suggestions.dto");
const trips_service_1 = require("../trips.service");
const trip_conflicts_service_1 = require("./trip-conflicts.service");
const persona_alerts_dto_1 = require("../dto/persona-alerts.dto");
const trip_conflicts_dto_1 = require("../dto/trip-conflicts.dto");
const luxon_1 = require("luxon");
let TripSuggestionsService = TripSuggestionsService_1 = class TripSuggestionsService {
    constructor(prisma, tripsService, conflictsService) {
        this.prisma = prisma;
        this.tripsService = tripsService;
        this.conflictsService = conflictsService;
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
                    metrics: {
                        fatigue: -highPrioritySuggestions.length * 5,
                        buffer: highPrioritySuggestions.length * 30,
                        cost: highPrioritySuggestions.length * 50,
                    },
                    risks: [],
                },
            };
        }
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
        return {
            success: successCount > 0,
            appliedCount: successCount,
            suggestions: results,
            impact: {
                metrics: {
                    fatigue: -successCount * 5,
                    buffer: successCount * 30,
                    cost: successCount * 50,
                },
                risks: [],
            },
        };
    }
    async applySuggestion(tripId, suggestionId, request) {
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
            return {
                success: true,
                suggestionId,
                appliedChanges: [],
                impact: {
                    metrics: {
                        fatigue: -5,
                        buffer: 30,
                        cost: 50,
                    },
                    risks: [],
                },
            };
        }
        const appliedChanges = [];
        const triggeredSuggestions = [];
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
                appliedChanges.push({
                    type: 'generic',
                    description: `已应用建议：${suggestion.title}`,
                });
        }
        this.suggestionStatuses.set(suggestionId, suggestions_dto_1.SuggestionStatus.APPLIED);
        const relatedSuggestions = allSuggestions.items.filter(s => s.id !== suggestionId &&
            s.scope === suggestion.scope &&
            s.scopeId === suggestion.scopeId);
        triggeredSuggestions.push(...relatedSuggestions.slice(0, 3).map(s => s.id));
        return {
            success: true,
            suggestionId,
            appliedChanges,
            impact: {
                metrics: {
                    fatigue: -5,
                    buffer: 30,
                    cost: 50,
                },
                risks: [
                    {
                        id: 'risk-002',
                        severity: suggestions_dto_1.SuggestionSeverity.INFO,
                        title: '新增缓冲时间充足',
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trips_service_1.TripsService,
        trip_conflicts_service_1.TripConflictsService])
], TripSuggestionsService);
//# sourceMappingURL=trip-suggestions.service.js.map