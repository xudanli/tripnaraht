"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ObservabilityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservabilityService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let ObservabilityService = ObservabilityService_1 = class ObservabilityService {
    constructor() {
        this.logger = new common_1.Logger(ObservabilityService_1.name);
        this.traces = new Map();
        this.metrics = new Map();
    }
    generateTraceId() {
        return `trace_${(0, crypto_1.randomUUID)()}`;
    }
    createSpan(traceId, spanName, parentSpanId) {
        const spanId = `span_${(0, crypto_1.randomUUID)()}`;
        const span = {
            trace_id: traceId,
            span_id: spanId,
            parent_span_id: parentSpanId,
            name: spanName,
            start_time: Date.now(),
            end_time: undefined,
            tags: {},
            logs: [],
        };
        if (!this.traces.has(traceId)) {
            this.traces.set(traceId, []);
        }
        this.traces.get(traceId).push(span);
        return {
            trace_id: traceId,
            span_id: spanId,
        };
    }
    endSpan(traceId, spanId) {
        const spans = this.traces.get(traceId);
        if (spans) {
            const span = spans.find((s) => s.span_id === spanId);
            if (span) {
                span.end_time = Date.now();
            }
        }
    }
    addSpanTag(traceId, spanId, key, value) {
        const spans = this.traces.get(traceId);
        if (spans) {
            const span = spans.find((s) => s.span_id === spanId);
            if (span) {
                span.tags[key] = value;
            }
        }
    }
    recordMetric(name, value, tags = {}) {
        const metricPoint = {
            name,
            value,
            tags,
            timestamp: Date.now(),
        };
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }
        this.metrics.get(name).push(metricPoint);
    }
    logStructured(level, message, context = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...context,
        };
        const logMessage = JSON.stringify(logEntry);
        if (level === 'info') {
            this.logger.log(logMessage);
        }
        else if (level === 'warn') {
            this.logger.warn(logMessage);
        }
        else if (level === 'error') {
            this.logger.error(logMessage);
        }
        else if (level === 'debug') {
            this.logger.debug(logMessage);
        }
    }
    getTrace(traceId) {
        return this.traces.get(traceId);
    }
    getMetrics(name, startTime, endTime) {
        const points = this.metrics.get(name) || [];
        if (startTime && endTime) {
            return points.filter((p) => p.timestamp >= startTime && p.timestamp <= endTime);
        }
        return points;
    }
};
exports.ObservabilityService = ObservabilityService;
exports.ObservabilityService = ObservabilityService = ObservabilityService_1 = __decorate([
    (0, common_1.Injectable)()
], ObservabilityService);
//# sourceMappingURL=observability.service.js.map