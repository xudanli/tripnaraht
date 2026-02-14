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
var RouterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouterService = void 0;
const common_1 = require("@nestjs/common");
const router_interface_1 = require("../interfaces/router.interface");
const event_telemetry_service_1 = require("./event-telemetry.service");
let RouterService = RouterService_1 = class RouterService {
    constructor(eventTelemetry) {
        this.eventTelemetry = eventTelemetry;
        this.logger = new common_1.Logger(RouterService_1.name);
    }
    async route(userInput, context, requestId) {
        const startTime = Date.now();
        try {
            const hardRuleResult = this.checkHardRules(userInput, context);
            if (hardRuleResult) {
                const output = hardRuleResult;
                output.ui_hint.status = this.getInitialUIStatus(output.route);
                const routerMs = Date.now() - startTime;
                this.logger.debug(`Router decision (hard rule): ${output.route}, confidence: ${output.confidence}, ms: ${routerMs}`);
                if (this.eventTelemetry && requestId) {
                    this.eventTelemetry.recordRouterDecision(requestId, output.route, output.confidence, output.reasons.map(r => String(r)), routerMs, { method: 'hard_rule' });
                }
                return output;
            }
            const features = this.extractFeatures(userInput, context);
            const score = this.scoreFeatures(features);
            const route = this.decideRoute(score, features);
            const output = {
                route,
                confidence: score.confidence,
                reasons: features.reasons,
                required_capabilities: this.getRequiredCapabilities(route, features),
                consent_required: this.requiresConsent(route, features),
                budget: this.getBudget(route),
                ui_hint: {
                    mode: route.startsWith('SYSTEM1') ? 'fast' : 'slow',
                    status: this.getInitialUIStatus(route),
                    message: this.getUIMessage(route, score.confidence),
                },
            };
            const routerMs = Date.now() - startTime;
            this.logger.debug(`Router decision: ${output.route}, confidence: ${output.confidence}, ms: ${routerMs}`);
            if (this.eventTelemetry && requestId) {
                this.eventTelemetry.recordRouterDecision(requestId, output.route, output.confidence, output.reasons.map(r => String(r)), routerMs, { method: 'feature_scoring' });
            }
            return output;
        }
        catch (error) {
            this.logger.error(`Router error: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
            if (this.eventTelemetry && requestId) {
                this.eventTelemetry.recordFallbackTriggered(requestId, 'UNKNOWN', router_interface_1.RouteType.SYSTEM1_API, `Router error: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, { error: (error === null || error === void 0 ? void 0 : error.message) || String(error) });
            }
            const fallbackOutput = {
                route: router_interface_1.RouteType.SYSTEM1_API,
                confidence: 0.3,
                reasons: [router_interface_1.RouterReason.MISSING_INFO],
                required_capabilities: [],
                consent_required: false,
                budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
                ui_hint: {
                    mode: 'fast',
                    status: router_interface_1.UIStatus.THINKING,
                    message: '正在处理您的请求...',
                },
            };
            if (this.eventTelemetry && requestId) {
                const routerMs = Date.now() - startTime;
                this.eventTelemetry.recordRouterDecision(requestId, fallbackOutput.route, fallbackOutput.confidence, fallbackOutput.reasons.map(r => String(r)), routerMs, { method: 'fallback', error: (error === null || error === void 0 ? void 0 : error.message) || String(error) });
            }
            return fallbackOutput;
        }
    }
    checkHardRules(userInput, context) {
        const input = userInput.toLowerCase();
        if (/支付|付款|下单|预订|退款|取消订单|批量|删除.*个|添加.*个/i.test(input)) {
            return {
                route: router_interface_1.RouteType.SYSTEM2_REASONING,
                confidence: 0.9,
                reasons: [router_interface_1.RouterReason.HIGH_RISK_ACTION],
                required_capabilities: ['planner'],
                consent_required: true,
                budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 0 },
                ui_hint: {
                    mode: 'slow',
                    status: router_interface_1.UIStatus.AWAITING_CONSENT,
                    message: '此操作需要您的确认',
                },
            };
        }
        if (/浏览器|官网|网页|爬取|查.*房|查.*有房/i.test(input)) {
            return {
                route: router_interface_1.RouteType.SYSTEM2_WEBBROWSE,
                confidence: 0.9,
                reasons: [router_interface_1.RouterReason.REALTIME_WEB, router_interface_1.RouterReason.HIGH_RISK_ACTION],
                required_capabilities: ['browser'],
                consent_required: true,
                budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 12 },
                ui_hint: {
                    mode: 'slow',
                    status: router_interface_1.UIStatus.AWAITING_CONSENT,
                    message: '此操作需要您的确认',
                },
            };
        }
        if (/删除|移除|添加|移动|改.*优先级|设置.*为/i.test(input) &&
            !/规划|如果|要是/i.test(input)) {
            return {
                route: router_interface_1.RouteType.SYSTEM1_API,
                confidence: 0.85,
                reasons: [],
                required_capabilities: ['places', 'trips'],
                consent_required: false,
                budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
                ui_hint: {
                    mode: 'fast',
                    status: router_interface_1.UIStatus.THINKING,
                    message: '正在处理...',
                },
            };
        }
        if (/是什么|在哪里|营业时间|开放时间|多少钱|价格|推荐.*餐厅|推荐.*景点|推荐.*拉面|推荐.*美食/i.test(input) &&
            !/规划|几天|如果|要是/i.test(input)) {
            return {
                route: router_interface_1.RouteType.SYSTEM1_RAG,
                confidence: 0.8,
                reasons: [],
                required_capabilities: ['places'],
                consent_required: false,
                budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
                ui_hint: {
                    mode: 'fast',
                    status: router_interface_1.UIStatus.THINKING,
                    message: '正在查询...',
                },
            };
        }
        return null;
    }
    extractFeatures(userInput, context) {
        const input = userInput.toLowerCase();
        const constraintCount = ((input.match(/既要|又要|还要|但是|不过|然而|可是/g) || []).length +
            (input.match(/不要|不能|避免|避开/g) || []).length);
        const ambiguity = ((input.match(/这个|那个|它|它们|这里|那里/g) || []).length +
            (input.match(/\?|？/g) || []).length);
        const hasRealtimeWeb = /官网|下.*有房|今天|现在|实时|限量|抢购/i.test(input);
        const hasPlanning = /规划|几天|行程|路线|赶得上|如果.*就|要是.*就/i.test(input);
        const reasons = [];
        if (constraintCount >= 2)
            reasons.push(router_interface_1.RouterReason.MULTI_CONSTRAINT);
        if (ambiguity > 0)
            reasons.push(router_interface_1.RouterReason.MISSING_INFO);
        if (hasRealtimeWeb)
            reasons.push(router_interface_1.RouterReason.REALTIME_WEB);
        if (hasPlanning)
            reasons.push(router_interface_1.RouterReason.NO_API);
        return {
            constraintCount,
            ambiguity,
            hasRealtimeWeb,
            hasPlanning,
            reasons,
        };
    }
    scoreFeatures(features) {
        let score = 0.5;
        let route = router_interface_1.RouteType.SYSTEM1_API;
        if (features.constraintCount >= 2) {
            score += 0.3;
            route = router_interface_1.RouteType.SYSTEM2_REASONING;
        }
        if (features.hasPlanning) {
            score += 0.25;
            route = router_interface_1.RouteType.SYSTEM2_REASONING;
        }
        if (features.hasRealtimeWeb) {
            score += 0.2;
            route = router_interface_1.RouteType.SYSTEM2_WEBBROWSE;
        }
        if (features.ambiguity > 2) {
            score -= 0.3;
        }
        const confidence = Math.max(0.1, Math.min(0.95, score));
        return { confidence, route };
    }
    decideRoute(score, features) {
        if (score.confidence < 0.45) {
            return features.hasPlanning ? router_interface_1.RouteType.SYSTEM1_RAG : router_interface_1.RouteType.SYSTEM1_API;
        }
        return score.route;
    }
    getRequiredCapabilities(route, features) {
        const capabilities = [];
        if (route === router_interface_1.RouteType.SYSTEM1_RAG || route === router_interface_1.RouteType.SYSTEM2_REASONING) {
            capabilities.push('places');
        }
        if (route === router_interface_1.RouteType.SYSTEM2_REASONING) {
            capabilities.push('transport', 'planner');
        }
        if (route === router_interface_1.RouteType.SYSTEM2_WEBBROWSE) {
            capabilities.push('browser');
        }
        return capabilities;
    }
    requiresConsent(route, features) {
        return route === router_interface_1.RouteType.SYSTEM2_WEBBROWSE || features.hasRealtimeWeb;
    }
    getBudget(route) {
        if (route.startsWith('SYSTEM1')) {
            return { max_seconds: 3, max_steps: 1, max_browser_steps: 0 };
        }
        if (route === router_interface_1.RouteType.SYSTEM2_WEBBROWSE) {
            return { max_seconds: 60, max_steps: 8, max_browser_steps: 12 };
        }
        return { max_seconds: 60, max_steps: 8, max_browser_steps: 0 };
    }
    getInitialUIStatus(route) {
        if (route.startsWith('SYSTEM1')) {
            return router_interface_1.UIStatus.THINKING;
        }
        return router_interface_1.UIStatus.THINKING;
    }
    getUIMessage(route, confidence) {
        if (confidence < 0.45) {
            return '需要更多信息才能处理您的请求';
        }
        if (route.startsWith('SYSTEM1')) {
            return '正在快速处理...';
        }
        return '正在深度分析...';
    }
};
exports.RouterService = RouterService;
exports.RouterService = RouterService = RouterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [event_telemetry_service_1.EventTelemetryService])
], RouterService);
//# sourceMappingURL=router.service.js.map