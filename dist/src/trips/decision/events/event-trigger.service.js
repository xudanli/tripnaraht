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
var EventTriggerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventTriggerService = exports.DEFAULT_EVENT_TRIGGER_CONFIG = void 0;
const common_1 = require("@nestjs/common");
exports.DEFAULT_EVENT_TRIGGER_CONFIG = {
    debounceMs: 5000,
    throttleMs: 30000,
    minIntervalMs: 60000,
};
let EventTriggerService = EventTriggerService_1 = class EventTriggerService {
    constructor() {
        this.logger = new common_1.Logger(EventTriggerService_1.name);
        this.lastTriggerTime = 0;
        this.pendingEvents = [];
        this.config = exports.DEFAULT_EVENT_TRIGGER_CONFIG;
    }
    registerEvent(event) {
        this.logger.debug(`Event registered: ${event.type}`, event.payload);
        this.pendingEvents.push(event);
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.processEvents();
        }, this.config.debounceMs);
        return true;
    }
    processEvents() {
        if (this.pendingEvents.length === 0) {
            return;
        }
        const now = Date.now();
        if (now - this.lastTriggerTime < this.config.minIntervalMs) {
            this.logger.debug(`Throttled: last trigger was ${now - this.lastTriggerTime}ms ago`);
            return;
        }
        const mergedEvent = this.mergeEvents(this.pendingEvents);
        if (this.shouldTriggerRepair(mergedEvent)) {
            this.lastTriggerTime = now;
            this.logger.log(`Triggering repair for event: ${mergedEvent.type}`, mergedEvent.payload);
        }
        this.pendingEvents = [];
    }
    mergeEvents(events) {
        const sorted = events.sort((a, b) => {
            const severityOrder = { high: 3, medium: 2, low: 1 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
        const primary = sorted[0];
        const mergedPayload = events.reduce((acc, e) => ({ ...acc, ...e.payload }), {});
        return {
            ...primary,
            payload: mergedPayload,
        };
    }
    shouldTriggerRepair(event) {
        if (event.severity === 'high') {
            return true;
        }
        if (event.type === 'availability_update' ||
            event.type === 'manual_trigger') {
            return true;
        }
        return event.severity === 'medium';
    }
    mapToDecisionTrigger(eventType) {
        switch (eventType) {
            case 'weather_update':
            case 'traffic_change':
                return 'signal_update';
            case 'availability_update':
                return 'availability_update';
            case 'user_behavior':
                return 'user_edit';
            case 'manual_trigger':
                return 'manual_repair';
            default:
                return 'signal_update';
        }
    }
    detectStateChanges(oldState, newState) {
        const events = [];
        if (oldState.signals.lastUpdatedAt !== newState.signals.lastUpdatedAt) {
            const oldAlerts = oldState.signals.alerts || [];
            const newAlerts = newState.signals.alerts || [];
            if (newAlerts.length > oldAlerts.length) {
                events.push({
                    type: 'weather_update',
                    timestamp: new Date().toISOString(),
                    payload: {
                        newAlerts: newAlerts,
                        oldAlerts: oldAlerts,
                    },
                    severity: newAlerts.some(a => a.severity === 'critical')
                        ? 'high'
                        : 'medium',
                });
            }
        }
        for (const date of Object.keys(newState.candidatesByDate)) {
            const oldCandidates = oldState.candidatesByDate[date] || [];
            const newCandidates = newState.candidatesByDate[date] || [];
            if (oldCandidates.length !== newCandidates.length) {
                events.push({
                    type: 'availability_update',
                    timestamp: new Date().toISOString(),
                    payload: {
                        date,
                        oldCount: oldCandidates.length,
                        newCount: newCandidates.length,
                    },
                    severity: 'medium',
                });
            }
        }
        return events;
    }
};
exports.EventTriggerService = EventTriggerService;
exports.EventTriggerService = EventTriggerService = EventTriggerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], EventTriggerService);
//# sourceMappingURL=event-trigger.service.js.map