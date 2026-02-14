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
var CoreGatewayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoreGatewayService = void 0;
const common_1 = require("@nestjs/common");
const planning_workbench_agent_service_1 = require("../services/planning-workbench-agent.service");
const execution_agent_service_1 = require("../services/execution-agent.service");
const trip_detail_agent_service_1 = require("../services/trip-detail-agent.service");
const DEFAULT_ACTION_BUDGETS = {
    generatePlan: { maxDurationMs: 8000, maxLlmTokens: 4000, maxToolCalls: 10, priority: 'normal' },
    comparePlans: { maxDurationMs: 5000, maxLlmTokens: 3000, maxToolCalls: 5, priority: 'normal' },
    evaluatePlan: { maxDurationMs: 5000, maxLlmTokens: 3000, maxToolCalls: 5, priority: 'normal' },
    selectPlan: { maxDurationMs: 2000, maxLlmTokens: 1000, maxToolCalls: 2, priority: 'normal' },
    applyChangeIntent: { maxDurationMs: 5000, maxLlmTokens: 2000, maxToolCalls: 8, priority: 'high' },
    rollback: { maxDurationMs: 3000, maxLlmTokens: 500, maxToolCalls: 5, priority: 'critical' },
    checkpoint: { maxDurationMs: 1000, maxLlmTokens: 0, maxToolCalls: 1, priority: 'high' },
    diagnose: { maxDurationMs: 2000, maxLlmTokens: 0, maxToolCalls: 0, priority: 'normal' },
    getTripStatus: { maxDurationMs: 1000, maxLlmTokens: 0, maxToolCalls: 0, priority: 'normal' },
};
let CoreGatewayService = CoreGatewayService_1 = class CoreGatewayService {
    constructor(planningWorkbench, executionAgent, tripDetailAgent) {
        this.planningWorkbench = planningWorkbench;
        this.executionAgent = executionAgent;
        this.tripDetailAgent = tripDetailAgent;
        this.logger = new common_1.Logger(CoreGatewayService_1.name);
        this.actionStats = {};
        this.logger.log('🚪 CoreGateway 已初始化');
        Object.keys(DEFAULT_ACTION_BUDGETS).forEach(action => {
            this.actionStats[action] = { count: 0, totalDurationMs: 0, failures: 0 };
        });
    }
    async execute(action) {
        const startTime = Date.now();
        const traceId = action.context.traceId || this.generateTraceId();
        this.logger.debug(`[${traceId}] 核心动作开始 | type=${action.type} | userId=${action.context.userId}`);
        const budget = this.resolveBudget(action.type, action.context.budget);
        if (this.actionStats[action.type]) {
            this.actionStats[action.type].count++;
        }
        try {
            const validationError = this.validateAction(action);
            if (validationError) {
                throw new Error(validationError);
            }
            const result = await this.routeAction(action, budget, traceId);
            const durationMs = Date.now() - startTime;
            if (this.actionStats[action.type]) {
                this.actionStats[action.type].totalDurationMs += durationMs;
            }
            this.logger.debug(`[${traceId}] 核心动作完成 | duration=${durationMs}ms`);
            return {
                success: true,
                data: result,
                meta: {
                    traceId,
                    actionType: action.type,
                    durationMs,
                    budgetUsed: {
                        durationMs,
                        llmTokens: 0,
                        toolCalls: 0,
                    },
                    degraded: false,
                },
            };
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            if (this.actionStats[action.type]) {
                this.actionStats[action.type].failures++;
            }
            this.logger.error(`[${traceId}] 核心动作失败: ${error.message}`);
            return {
                success: false,
                error: {
                    code: 'ACTION_FAILED',
                    message: error.message,
                    details: error.stack,
                },
                meta: {
                    traceId,
                    actionType: action.type,
                    durationMs,
                    budgetUsed: {
                        durationMs,
                        llmTokens: 0,
                        toolCalls: 0,
                    },
                    degraded: false,
                },
            };
        }
    }
    async generatePlan(params) {
        return this.execute({
            type: 'generatePlan',
            payload: params,
            context: {
                userId: params.userId,
                sessionId: params.sessionId,
            },
        });
    }
    async applyChangeIntent(params) {
        return this.execute({
            type: 'applyChangeIntent',
            payload: params,
            context: {
                userId: params.userId,
                sessionId: params.tripId,
                budget: { priority: params.intent.urgency === 'immediate' ? 'critical' : 'high' },
            },
        });
    }
    async getTripStatus(params) {
        return this.execute({
            type: 'getTripStatus',
            payload: params,
            context: {
                userId: params.userId,
                sessionId: params.tripId,
            },
        });
    }
    async diagnose(params) {
        return this.execute({
            type: 'diagnose',
            payload: params,
            context: {
                userId: params.userId,
                sessionId: params.tripId,
            },
        });
    }
    getStats() {
        const stats = {};
        for (const [action, data] of Object.entries(this.actionStats)) {
            stats[action] = {
                ...data,
                averageDurationMs: data.count > 0 ? Math.round(data.totalDurationMs / data.count) : 0,
                successRate: data.count > 0
                    ? ((data.count - data.failures) / data.count * 100).toFixed(2) + '%'
                    : 'N/A',
            };
        }
        return stats;
    }
    validateAction(action) {
        if (!action.type) {
            return '动作类型不能为空';
        }
        if (!action.context.userId) {
            return '用户ID不能为空';
        }
        if (!action.context.sessionId) {
            return '会话ID不能为空';
        }
        if (!DEFAULT_ACTION_BUDGETS[action.type]) {
            return `未知的动作类型: ${action.type}`;
        }
        return null;
    }
    resolveBudget(actionType, partialBudget) {
        const baseBudget = DEFAULT_ACTION_BUDGETS[actionType];
        return {
            ...baseBudget,
            ...partialBudget,
        };
    }
    async routeAction(action, budget, traceId) {
        switch (action.type) {
            case 'generatePlan':
            case 'comparePlans':
            case 'evaluatePlan':
            case 'selectPlan':
                return this.routeToPlanningCore(action, budget, traceId);
            case 'applyChangeIntent':
            case 'rollback':
            case 'checkpoint':
                return this.routeToExecutionCore(action, budget, traceId);
            case 'diagnose':
            case 'getTripStatus':
                return this.routeToTripDetail(action, budget, traceId);
            default:
                throw new Error(`不支持的动作类型: ${action.type}`);
        }
    }
    async routeToPlanningCore(action, budget, traceId) {
        if (!this.planningWorkbench) {
            this.logger.warn(`[${traceId}] PlanningWorkbench 不可用，返回默认响应`);
            return this.getDefaultPlanningResponse(action);
        }
        const payload = action.payload;
        const context = {
            destination: payload.destination || '',
            days: payload.days || 7,
            budget: payload.budget,
            travelers: payload.travelers,
            preferences: payload.preferences,
            constraints: payload.constraints,
        };
        const response = await this.planningWorkbench.execute({
            context,
            tripId: payload.tripId,
            existingPlanState: payload.existingPlanState,
            userAction: this.mapActionToUserAction(action.type),
        });
        return response;
    }
    mapActionToUserAction(actionType) {
        switch (actionType) {
            case 'generatePlan': return 'generate';
            case 'comparePlans': return 'compare';
            case 'selectPlan': return 'commit';
            case 'evaluatePlan': return 'adjust';
            default: return undefined;
        }
    }
    async routeToExecutionCore(action, budget, traceId) {
        var _a;
        if (!this.executionAgent) {
            this.logger.warn(`[${traceId}] ExecutionAgent 不可用，返回默认响应`);
            return this.getDefaultExecutionResponse(action);
        }
        const payload = action.payload;
        const response = await this.executionAgent.execute({
            tripId: action.context.sessionId,
            action: this.mapActionToExecAction(action.type),
            changeParams: action.type === 'applyChangeIntent' ? {
                changeType: ((_a = payload.intent) === null || _a === void 0 ? void 0 : _a.type) || 'unknown',
                changeDetails: payload.intent,
            } : undefined,
        });
        return response;
    }
    mapActionToExecAction(actionType) {
        switch (actionType) {
            case 'applyChangeIntent': return 'handle_change';
            case 'rollback': return 'fallback';
            case 'checkpoint': return 'get_status';
            default: return 'get_status';
        }
    }
    async routeToTripDetail(action, budget, traceId) {
        if (!this.tripDetailAgent) {
            this.logger.warn(`[${traceId}] TripDetailAgent 不可用，返回默认响应`);
            return this.getDefaultDiagnosticResponse(action);
        }
        const payload = action.payload;
        const response = await this.tripDetailAgent.execute({
            tripId: payload.tripId || action.context.sessionId,
            action: action.type === 'diagnose' ? 'get_health' : 'get_status',
        });
        return response;
    }
    getDefaultPlanningResponse(action) {
        return {
            success: false,
            message: '规划服务暂时不可用',
            degraded: true,
        };
    }
    getDefaultExecutionResponse(action) {
        return {
            success: false,
            message: '执行服务暂时不可用',
            degraded: true,
        };
    }
    getDefaultDiagnosticResponse(action) {
        return {
            tripId: action.payload.tripId,
            status: 'unknown',
            message: '诊断服务暂时不可用',
            degraded: true,
        };
    }
    generateTraceId() {
        return `core-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
};
exports.CoreGatewayService = CoreGatewayService;
exports.CoreGatewayService = CoreGatewayService = CoreGatewayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [planning_workbench_agent_service_1.PlanningWorkbenchAgentService,
        execution_agent_service_1.ExecutionAgentService,
        trip_detail_agent_service_1.TripDetailAgentService])
], CoreGatewayService);
//# sourceMappingURL=core-gateway.service.js.map