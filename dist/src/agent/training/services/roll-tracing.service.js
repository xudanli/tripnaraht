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
var RollTracingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollTracingService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
let RollTracingService = RollTracingService_1 = class RollTracingService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RollTracingService_1.name);
        this.activeSpans = new Map();
        this.enabled =
            this.configService.get('ROLL_TRACING_ENABLED') !== false;
        this.serviceName =
            this.configService.get('ROLL_SERVICE_NAME') || 'roll-client';
        this.serviceVersion =
            this.configService.get('ROLL_SERVICE_VERSION') || '1.0.0';
        if (this.enabled) {
            this.logger.log(`[RollTracing] 追踪已启用: ${this.serviceName}@${this.serviceVersion}`);
        }
    }
    generateTraceId() {
        return (0, crypto_1.randomUUID)().replace(/-/g, '').substring(0, 32);
    }
    generateSpanId() {
        return (0, crypto_1.randomUUID)().replace(/-/g, '').substring(0, 16);
    }
    startSpan(name, parentContext, attributes) {
        if (!this.enabled) {
            return {
                traceId: '',
                spanId: '',
            };
        }
        const traceId = (parentContext === null || parentContext === void 0 ? void 0 : parentContext.traceId) || this.generateTraceId();
        const spanId = this.generateSpanId();
        const parentSpanId = parentContext === null || parentContext === void 0 ? void 0 : parentContext.spanId;
        const context = {
            traceId,
            spanId,
            parentSpanId,
            traceFlags: 1,
        };
        this.activeSpans.set(spanId, context);
        this.logger.debug(`[RollTracing] 开始 Span: ${name} (traceId=${traceId}, spanId=${spanId})`);
        this.logSpanEvent('span.start', {
            name,
            traceId,
            spanId,
            parentSpanId,
            attributes,
        });
        return context;
    }
    endSpan(spanId, status = 'ok', error, attributes) {
        if (!this.enabled) {
            return;
        }
        const context = this.activeSpans.get(spanId);
        if (!context) {
            return;
        }
        this.activeSpans.delete(spanId);
        this.logSpanEvent('span.end', {
            traceId: context.traceId,
            spanId: context.spanId,
            status,
            error,
            attributes,
        });
        this.logger.debug(`[RollTracing] 结束 Span: ${spanId} (status=${status})`);
    }
    getCurrentContext(spanId) {
        return this.activeSpans.get(spanId) || null;
    }
    createChildSpan(name, parentSpanId, attributes) {
        const parentContext = this.activeSpans.get(parentSpanId);
        if (!parentContext) {
            this.logger.warn(`[RollTracing] 父 Span 不存在: ${parentSpanId}，创建新 Trace`);
            return this.startSpan(name, undefined, attributes);
        }
        return this.startSpan(name, parentContext, attributes);
    }
    toW3CTraceContext(context) {
        var _a;
        const version = '00';
        const traceId = context.traceId.padStart(32, '0');
        const parentId = ((_a = context.parentSpanId) === null || _a === void 0 ? void 0 : _a.padStart(16, '0')) || '0'.repeat(16);
        const flags = (context.traceFlags || 1).toString(16).padStart(2, '0');
        return `${version}-${traceId}-${parentId}-${flags}`;
    }
    fromW3CTraceContext(traceparent) {
        try {
            const parts = traceparent.split('-');
            if (parts.length !== 4) {
                return null;
            }
            const [, traceId, parentId, flags] = parts;
            const traceFlags = parseInt(flags, 16);
            return {
                traceId,
                spanId: this.generateSpanId(),
                parentSpanId: parentId === '0'.repeat(16) ? undefined : parentId,
                traceFlags,
            };
        }
        catch (error) {
            this.logger.warn(`[RollTracing] 解析 W3C Trace Context 失败: ${error}`);
            return null;
        }
    }
    logSpanEvent(event, data) {
        this.logger.debug(`[RollTracing] ${event}: ${JSON.stringify(data)}`);
    }
    injectTraceContext(headers, context) {
        if (!this.enabled) {
            return;
        }
        headers['traceparent'] = this.toW3CTraceContext(context);
        headers['x-trace-id'] = context.traceId;
        headers['x-span-id'] = context.spanId;
        if (context.parentSpanId) {
            headers['x-parent-span-id'] = context.parentSpanId;
        }
    }
    extractTraceContext(headers) {
        if (!this.enabled) {
            return null;
        }
        const traceparent = headers['traceparent'] || headers['Traceparent'];
        if (traceparent) {
            return this.fromW3CTraceContext(traceparent);
        }
        const traceId = headers['x-trace-id'] || headers['X-Trace-Id'];
        const spanId = headers['x-span-id'] || headers['X-Span-Id'];
        const parentSpanId = headers['x-parent-span-id'] || headers['X-Parent-Span-Id'];
        if (traceId && spanId) {
            return {
                traceId,
                spanId: this.generateSpanId(),
                parentSpanId,
                traceFlags: 1,
            };
        }
        return null;
    }
};
exports.RollTracingService = RollTracingService;
exports.RollTracingService = RollTracingService = RollTracingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RollTracingService);
//# sourceMappingURL=roll-tracing.service.js.map