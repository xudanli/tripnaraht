"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EventTelemetryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventTelemetryService = exports.AgentEventType = void 0;
const common_1 = require("@nestjs/common");
var AgentEventType;
(function (AgentEventType) {
    AgentEventType["ROUTER_DECISION"] = "router_decision";
    AgentEventType["SYSTEM2_STEP"] = "system2_step";
    AgentEventType["CRITIC_RESULT"] = "critic_result";
    AgentEventType["WEBBROWSE_BLOCKED"] = "webbrowse_blocked";
    AgentEventType["FALLBACK_TRIGGERED"] = "fallback_triggered";
    AgentEventType["AGENT_COMPLETE"] = "agent_complete";
})(AgentEventType || (exports.AgentEventType = AgentEventType = {}));
let EventTelemetryService = EventTelemetryService_1 = class EventTelemetryService {
    constructor() {
        this.logger = new common_1.Logger(EventTelemetryService_1.name);
        this.events = [];
        this.maxEventsInMemory = 1000;
    }
    recordEvent(event) {
        const fullEvent = {
            ...event,
            timestamp: Date.now(),
        };
        this.events.push(fullEvent);
        if (this.events.length > this.maxEventsInMemory) {
            this.events.shift();
        }
        this.logger.log(`[EVENT] ${event.type} - request_id: ${event.request_id}`, {
            type: event.type,
            request_id: event.request_id,
            data: event.data,
            metadata: event.metadata,
        });
    }
    recordRouterDecision(requestId, route, confidence, reasons, latencyMs, additionalData) {
        this.recordEvent({
            type: AgentEventType.ROUTER_DECISION,
            request_id: requestId,
            data: {
                route,
                confidence,
                reasons,
                ...additionalData,
            },
            metadata: {
                route,
                latency_ms: latencyMs,
            },
        });
    }
    recordSystem2Step(requestId, step, action, result, latencyMs, additionalData) {
        this.recordEvent({
            type: AgentEventType.SYSTEM2_STEP,
            request_id: requestId,
            data: {
                step,
                action,
                result,
                ...additionalData,
            },
            metadata: {
                step,
                latency_ms: latencyMs,
            },
        });
    }
    recordCriticResult(requestId, violations, passed, repairActions, additionalData) {
        this.recordEvent({
            type: AgentEventType.CRITIC_RESULT,
            request_id: requestId,
            data: {
                violations,
                passed,
                repair_actions: repairActions || [],
                ...additionalData,
            },
        });
    }
    recordWebbrowseBlocked(requestId, reason, additionalData) {
        this.recordEvent({
            type: AgentEventType.WEBBROWSE_BLOCKED,
            request_id: requestId,
            data: {
                reason,
                ...additionalData,
            },
        });
    }
    recordFallbackTriggered(requestId, originalRoute, fallbackRoute, reason, additionalData) {
        this.recordEvent({
            type: AgentEventType.FALLBACK_TRIGGERED,
            request_id: requestId,
            data: {
                original_route: originalRoute,
                fallback_route: fallbackRoute,
                reason,
                ...additionalData,
            },
        });
    }
    recordAgentComplete(requestId, status, latencyMs, tokenCount, costUsd, additionalData) {
        this.recordEvent({
            type: AgentEventType.AGENT_COMPLETE,
            request_id: requestId,
            data: {
                status,
                latency_ms: latencyMs,
                tokens_est: tokenCount,
                cost_est_usd: costUsd,
                ...additionalData,
            },
            metadata: {
                latency_ms: latencyMs,
            },
        });
    }
    getEvents(requestId, eventType) {
        let filtered = this.events;
        if (requestId) {
            filtered = filtered.filter(e => e.request_id === requestId);
        }
        if (eventType) {
            filtered = filtered.filter(e => e.type === eventType);
        }
        return filtered;
    }
    clearEvents() {
        this.events.length = 0;
    }
    getStats() {
        const byType = {};
        const byRequest = {};
        for (const event of this.events) {
            byType[event.type] = (byType[event.type] || 0) + 1;
            byRequest[event.request_id] = (byRequest[event.request_id] || 0) + 1;
        }
        return {
            total: this.events.length,
            byType,
            byRequest,
        };
    }
};
exports.EventTelemetryService = EventTelemetryService;
exports.EventTelemetryService = EventTelemetryService = EventTelemetryService_1 = __decorate([
    (0, common_1.Injectable)()
], EventTelemetryService);
//# sourceMappingURL=event-telemetry.service.js.map