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
var AgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentService = void 0;
const common_1 = require("@nestjs/common");
const router_interface_1 = require("../interfaces/router.interface");
const router_service_1 = require("./router.service");
const agent_state_service_1 = require("./agent-state.service");
const system1_executor_service_1 = require("./system1-executor.service");
const orchestrator_service_1 = require("./orchestrator.service");
const orchestrator_service_2 = require("../plan-execute/orchestrator.service");
const claude_orchestrator_service_1 = require("./claude-orchestrator.service");
const event_telemetry_service_1 = require("./event-telemetry.service");
const request_deduplication_service_1 = require("./request-deduplication.service");
const trip_run_manager_service_1 = require("./trip-run-manager.service");
const token_calculator_util_1 = require("../utils/token-calculator.util");
const orchestration_signals_util_1 = require("../utils/orchestration-signals.util");
const orchestration_policy_util_1 = require("../utils/orchestration-policy.util");
const agent_metrics_util_1 = require("../utils/agent-metrics.util");
const orchestration_stability_util_1 = require("./orchestration-stability.util");
const error_types_interface_1 = require("../interfaces/error-types.interface");
let AgentService = AgentService_1 = class AgentService {
    constructor(router, stateService, system1Executor, orchestrator, dagOrchestrator, claudeOrchestrator, eventTelemetry, requestDeduplication, tripRunManager) {
        this.router = router;
        this.stateService = stateService;
        this.system1Executor = system1Executor;
        this.orchestrator = orchestrator;
        this.dagOrchestrator = dagOrchestrator;
        this.claudeOrchestrator = claudeOrchestrator;
        this.eventTelemetry = eventTelemetry;
        this.requestDeduplication = requestDeduplication;
        this.tripRunManager = tripRunManager;
        this.logger = new common_1.Logger(AgentService_1.name);
        this.modeLock = new orchestration_stability_util_1.ModeLock();
        this.breakerSM = new orchestration_stability_util_1.CircuitBreaker(3, 30000);
        this.breakerDyn = new orchestration_stability_util_1.CircuitBreaker(3, 30000);
        this.breakerLegacy = new orchestration_stability_util_1.CircuitBreaker(5, 15000);
    }
    mapOrchestrationStepToUIState(step, gateResult, elapsedTime) {
        const stepProgressMap = {
            INTAKE: 10.0,
            RESEARCH: 20.0,
            GATE_EVAL: 30.0,
            PLAN_GEN: 40.0,
            VERIFY: 50.0,
            COMPLIANCE: 60.0,
            REPAIR: 70.0,
            NARRATE: 80.0,
            FEEDBACK: 90.0,
            DONE: 100.0,
            FAILED: 0,
            TIMEOUT: 0,
            HALLUCINATION_DETECTION: 95.0,
        };
        const stepMessageMap = {
            INTAKE: '正在解析请求...',
            RESEARCH: '正在收集数据...',
            GATE_EVAL: '正在评估行程可行性...',
            PLAN_GEN: '正在生成行程安排...',
            VERIFY: '正在验证行程...',
            COMPLIANCE: '正在检查风险合规...',
            REPAIR: '正在修复行程问题...',
            NARRATE: '正在生成说明...',
            FEEDBACK: '正在收集反馈信号...',
            DONE: '处理完成',
            FAILED: '处理失败',
            TIMEOUT: '请求超时',
            HALLUCINATION_DETECTION: '正在检测内容真实性...',
        };
        const stepEstimatedTimeMap = {
            INTAKE: 2000,
            RESEARCH: 8000,
            GATE_EVAL: 5000,
            PLAN_GEN: 10000,
            VERIFY: 6000,
            COMPLIANCE: 3000,
            REPAIR: 4000,
            NARRATE: 3000,
            FEEDBACK: 2000,
            DONE: 0,
            FAILED: 0,
            TIMEOUT: 0,
            HALLUCINATION_DETECTION: 2000,
        };
        const stepDetailMap = {
            INTAKE: '分析您的需求，提取关键信息（目的地、日期、预算等）',
            RESEARCH: '查询交通、POI、开放时间、DEM地形等数据',
            GATE_EVAL: '评估路线安全性、可达性和可行性（三人格评审）',
            PLAN_GEN: '生成详细的行程安排，包括时间、地点、交通方式',
            VERIFY: '验证时间冲突、换乘时间、开放时间等',
            COMPLIANCE: '检查风险分类、合规要求和免责留痕',
            REPAIR: '修复发现的问题，优化行程（如需要）',
            NARRATE: '生成用户友好的行程说明和提示',
            FEEDBACK: '收集用户反馈信号用于决策优化',
            DONE: '所有步骤已完成',
            FAILED: '处理过程中出现错误',
            TIMEOUT: '请求超时，请缩小范围或稍后重试',
            HALLUCINATION_DETECTION: '检测生成内容中的事实声明，确保信息准确性',
        };
        let uiStatus = 'thinking';
        let requiresUserAction = false;
        switch (step) {
            case 'INTAKE':
            case 'RESEARCH':
            case 'PLAN_GEN':
            case 'NARRATE':
            case 'FEEDBACK':
                uiStatus = 'thinking';
                break;
            case 'GATE_EVAL':
                uiStatus = 'verifying';
                if (gateResult === 'NEED_CONFIRM') {
                    uiStatus = 'awaiting_confirmation';
                    requiresUserAction = true;
                }
                break;
            case 'VERIFY':
            case 'COMPLIANCE':
                uiStatus = 'verifying';
                break;
            case 'REPAIR':
                uiStatus = 'repairing';
                break;
            case 'DONE':
                uiStatus = 'done';
                break;
            case 'FAILED':
            case 'TIMEOUT':
                uiStatus = 'failed';
                break;
            case 'HALLUCINATION_DETECTION':
                uiStatus = 'verifying';
                break;
        }
        let estimatedTimeRemaining;
        if (elapsedTime !== undefined && step !== 'DONE' && step !== 'FAILED' && step !== 'TIMEOUT') {
            const currentStepTime = stepEstimatedTimeMap[step];
            const remainingSteps = this.getRemainingSteps(step);
            const totalRemainingTime = remainingSteps.reduce((sum, s) => sum + stepEstimatedTimeMap[s], 0);
            const currentStepRemaining = Math.max(0, currentStepTime - elapsedTime);
            estimatedTimeRemaining = currentStepRemaining + totalRemainingTime;
        }
        return {
            phase: step,
            ui_status: uiStatus,
            progress_percent: stepProgressMap[step] || 0,
            message: stepMessageMap[step] || '处理中...',
            requires_user_action: requiresUserAction,
            estimated_time_remaining_ms: estimatedTimeRemaining,
            current_step_detail: stepDetailMap[step],
        };
    }
    getRemainingSteps(currentStep) {
        const allSteps = [
            'INTAKE',
            'RESEARCH',
            'GATE_EVAL',
            'PLAN_GEN',
            'VERIFY',
            'REPAIR',
            'NARRATE',
            'DONE',
        ];
        const currentIndex = allSteps.indexOf(currentStep);
        if (currentIndex === -1) {
            return [];
        }
        return allSteps.slice(currentIndex + 1);
    }
    generateSimplifiedExplanation(decisionLog, gateResult) {
        if (!decisionLog || decisionLog.length === 0) {
            return undefined;
        }
        const keyDecisions = [];
        if (gateResult) {
            keyDecisions.push({
                step: 'GATE_EVAL',
                decision: this.translateGateResult(gateResult.gate_result),
                impact: 'HIGH',
            });
        }
        const keySteps = ['GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR'];
        for (const entry of decisionLog) {
            if (keySteps.includes(entry.step)) {
                keyDecisions.push({
                    step: entry.step,
                    decision: this.simplifyDecisionMessage(entry),
                    impact: this.assessDecisionImpact(entry),
                });
            }
        }
        const filteredDecisions = keyDecisions.filter(d => d.impact === 'HIGH' || d.impact === 'MEDIUM');
        const summary = this.generateDecisionSummary(gateResult, filteredDecisions);
        return {
            summary,
            key_decisions: filteredDecisions.slice(0, 5),
            evidence_count: decisionLog.reduce((sum, entry) => { var _a; return sum + (((_a = entry.evidence_refs) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0),
            has_details: true,
        };
    }
    translateGateResult(status) {
        const translations = {
            'ALLOW': '已通过',
            'BLOCK': '被拒绝',
            'ADJUST_REQUIRED': '需要调整',
            'NEED_USER_CONFIRM': '需要您确认',
        };
        return translations[status] || status;
    }
    simplifyDecisionMessage(entry) {
        let message = entry.outputs_summary || entry.inputs_summary || '';
        message = message.replace(/GATE_EVAL/g, '可行性评估');
        message = message.replace(/PLAN_GEN/g, '行程生成');
        message = message.replace(/VERIFY/g, '验证');
        message = message.replace(/REPAIR/g, '修复');
        message = message.replace(/INTAKE/g, '需求解析');
        message = message.replace(/RESEARCH/g, '数据收集');
        message = message.replace(/NARRATE/g, '说明生成');
        if (message.length > 100) {
            message = message.substring(0, 97) + '...';
        }
        return message;
    }
    assessDecisionImpact(entry) {
        if (entry.step === 'GATE_EVAL') {
            return 'HIGH';
        }
        if (entry.step === 'PLAN_GEN' || entry.step === 'REPAIR') {
            return 'HIGH';
        }
        if (entry.step === 'VERIFY') {
            return 'MEDIUM';
        }
        return 'LOW';
    }
    generateDecisionSummary(gateResult, keyDecisions) {
        const parts = [];
        if (gateResult) {
            parts.push(`行程${this.translateGateResult(gateResult.gate_result)}`);
        }
        if (keyDecisions.length > 0) {
            parts.push(`进行了${keyDecisions.length}项关键检查`);
        }
        return parts.length > 0 ? parts.join('，') + '。' : '已完成行程规划。';
    }
    hashRequest(request) {
        var _a, _b, _c, _d, _e, _f;
        const stable = {
            trip_id: (_a = request.trip_id) !== null && _a !== void 0 ? _a : null,
            message: (_b = request.message) !== null && _b !== void 0 ? _b : '',
            options: {
                entry_point: (_c = request === null || request === void 0 ? void 0 : request.options) === null || _c === void 0 ? void 0 : _c.entry_point,
                use_claude_orchestration: (_d = request === null || request === void 0 ? void 0 : request.options) === null || _d === void 0 ? void 0 : _d.use_claude_orchestration,
                use_state_machine_orchestration: (_e = request === null || request === void 0 ? void 0 : request.options) === null || _e === void 0 ? void 0 : _e.use_state_machine_orchestration,
                max_seconds: (_f = request === null || request === void 0 ? void 0 : request.options) === null || _f === void 0 ? void 0 : _f.max_seconds,
            },
        };
        const s = JSON.stringify(stable);
        let h = 0;
        for (let i = 0; i < s.length; i++)
            h = (h * 31 + s.charCodeAt(i)) | 0;
        return String(h);
    }
    async routeAndRun(request) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17;
        const startTime = Date.now();
        this.logger.debug(`Processing request: ${request.request_id}`);
        let tripRunId = null;
        if (this.tripRunManager && !((_a = request.options) === null || _a === void 0 ? void 0 : _a.dry_run)) {
            try {
                const isPlanningReq = this.isPlanningRequest(request);
                const planningPhase = isPlanningReq ? 'PLANNING' : 'EXECUTION';
                const signals = (0, orchestration_signals_util_1.signalsFromRequest)(request);
                const currentAgent = signals.taskType === 'TRIP_PLANNING' ? 'PlanningAgent' : 'ExecutionAgent';
                tripRunId = await this.tripRunManager.createTripRun({
                    tripId: request.trip_id || null,
                    userId: request.user_id || null,
                    userQuery: request.message,
                    planningPhase,
                    currentAgent,
                    metadata: {
                        request_id: request.request_id,
                        entry_point: (_b = request.options) === null || _b === void 0 ? void 0 : _b.entry_point,
                        max_seconds: (_c = request.options) === null || _c === void 0 ? void 0 : _c.max_seconds,
                    },
                });
                if (tripRunId) {
                    this.logger.debug(`Created TripRun: ${tripRunId} for request ${request.request_id}`);
                }
            }
            catch (error) {
                this.logger.warn(`Failed to create TripRun: ${error.message}`);
            }
        }
        const maxSeconds = Number((_e = (_d = request === null || request === void 0 ? void 0 : request.options) === null || _d === void 0 ? void 0 : _d.max_seconds) !== null && _e !== void 0 ? _e : 12);
        const deadline = (0, orchestration_stability_util_1.createDeadline)(Math.max(1000, Math.min(maxSeconds * 1000, 20000)));
        const requestHash = this.hashRequest(request);
        const stabilityCtx = {
            requestId: request.request_id,
            userId: request.user_id,
            tripId: request.trip_id,
            requestHash,
            deadline,
            startTs: startTime,
        };
        const fallback = new orchestration_stability_util_1.FallbackGuard();
        try {
            if (this.requestDeduplication && !((_f = request.options) === null || _f === void 0 ? void 0 : _f.dry_run)) {
                const cachedResponse = this.requestDeduplication.checkDuplicate(requestHash);
                if (cachedResponse) {
                    const dedupedResponse = {
                        ...cachedResponse,
                        request_id: request.request_id,
                        observability: {
                            ...cachedResponse.observability,
                            latency_ms: Date.now() - startTime,
                        },
                    };
                    this.logger.debug(`Request deduplication: reusing cached result for request ${request.request_id}`);
                    return this.attachObservability(dedupedResponse, {
                        mode_final: 'DEDUP',
                        fallback_used: false,
                        deadline_ms: deadline.totalMs,
                        time_remaining_ms: deadline.remainingMs(),
                    });
                }
            }
            const isFromDashboard = ((_g = request.options) === null || _g === void 0 ? void 0 : _g.entry_point) === 'dashboard';
            const hasNoTripId = !request.trip_id || request.trip_id === '';
            const isPlanningReq = this.isPlanningRequest(request);
            const isCreatingNewTrip = hasNoTripId && isPlanningReq;
            if (isPlanningReq && !isCreatingNewTrip && !isFromDashboard) {
                this.logger.debug(`[AgentService] 检测到规划请求，重定向到规划工作台: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
                return this.createRedirectToPlanningWorkbenchResponse(request, startTime);
            }
            if (isPlanningReq) {
                this.logger.debug(`[AgentService] 规划请求判断: isCreatingNewTrip=${isCreatingNewTrip}, isFromDashboard=${isFromDashboard}, hasNoTripId=${hasNoTripId}, trip_id=${request.trip_id}`);
            }
            if (!isCreatingNewTrip && !isFromDashboard && (!request.trip_id || request.trip_id === '')) {
                this.logger.warn(`[AgentService] 缺少 trip_id（非创建新行程场景）: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
                return this.createMissingTripIdErrorResponse(request, startTime);
            }
            if (((_h = request.options) === null || _h === void 0 ? void 0 : _h.entry_point) === 'trip_detail_page' &&
                ((_j = request.options) === null || _j === void 0 ? void 0 : _j.readonly_mode) === true) {
                if (this.isModificationRequest(request.message)) {
                    this.logger.debug(`[AgentService] 只读模式限制: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
                    return this.createReadonlyModeRestrictionResponse(request, startTime);
                }
            }
            if (deadline.isExpired()) {
                throw new Error('TIMEOUT:AGENT_DEADLINE_EXPIRED');
            }
            const signals = (0, orchestration_signals_util_1.signalsFromRequest)(request);
            this.logger.debug(`[AgentService] 路由信号提取: taskType=${signals.taskType}, risk=${signals.risk}, complexity=${signals.complexity}, request_id=${request.request_id}`);
            const decision = (0, orchestration_policy_util_1.routePolicy)(process.env, request.options, signals, stabilityCtx, this.modeLock, {
                sm: this.breakerSM,
                dyn: this.breakerDyn,
                legacy: this.breakerLegacy,
            });
            this.logger.log(`[AgentService] 路由决策: mode=${decision.mode}, reason=${decision.reason}`);
            this.logger.log(`[AgentService] 匹配规则: ${decision.matchedRules.join(', ')}`);
            this.logger.log(`[AgentService] 熔断器状态: SM=${this.breakerSM.canPass()}, Dynamic=${this.breakerDyn.canPass()}, Legacy=${this.breakerLegacy.canPass()}`);
            const logFields = {
                request_id: request.request_id,
                orchestration_mode_resolved: decision.mode,
                orchestration_mode_recommended: ((_k = decision.recommendations) === null || _k === void 0 ? void 0 : _k.useStateMachine) ? 'CLAUDE_SM' : decision.mode,
                task_type: signals.taskType,
                risk: signals.risk,
                requires_consent: (_m = (_l = decision.recommendations) === null || _l === void 0 ? void 0 : _l.requireConsent) !== null && _m !== void 0 ? _m : false,
                needs_audit: (_p = (_o = decision.recommendations) === null || _o === void 0 ? void 0 : _o.enableAudit) !== null && _p !== void 0 ? _p : false,
                max_seconds: (_r = (_q = request.options) === null || _q === void 0 ? void 0 : _q.max_seconds) !== null && _r !== void 0 ? _r : 60,
                latency_budget_ms: signals.latencyBudgetMs,
                reason: decision.reason,
                matched_rules: decision.matchedRules,
            };
            this.logger.log(logFields, `[AgentService] 编排策略决策`);
            agent_metrics_util_1.MetricsRecorder.recordOrchestrationMode(decision.mode);
            agent_metrics_util_1.MetricsRecorder.recordRisk(signals.risk);
            if ((_s = request.options) === null || _s === void 0 ? void 0 : _s.entry_point) {
                agent_metrics_util_1.MetricsRecorder.recordEntryPoint(request.options.entry_point);
            }
            if (((_t = request.options) === null || _t === void 0 ? void 0 : _t.readonly_mode) !== undefined) {
                agent_metrics_util_1.MetricsRecorder.recordReadonlyMode(request.options.readonly_mode);
            }
            this.logger.debug(`[AgentService] 策略建议: useStateMachine=${(_u = decision.recommendations) === null || _u === void 0 ? void 0 : _u.useStateMachine}, enableAudit=${(_v = decision.recommendations) === null || _v === void 0 ? void 0 : _v.enableAudit}, requireConsent=${(_w = decision.recommendations) === null || _w === void 0 ? void 0 : _w.requireConsent}, recommendation_reason=${(_x = decision.recommendations) === null || _x === void 0 ? void 0 : _x.reason}`);
            let traceInfo = {
                orchestration: {
                    resolved: {
                        mode: decision.mode,
                        reason: decision.reason,
                        matchedRules: decision.matchedRules,
                    },
                    recommended: decision.recommendations ? {
                        useStateMachine: decision.recommendations.useStateMachine,
                        enableAudit: decision.recommendations.enableAudit,
                        requireConsent: decision.recommendations.requireConsent,
                        reason: decision.recommendations.reason,
                    } : undefined,
                    signals: {
                        taskType: signals.taskType,
                        risk: signals.risk,
                        complexity: signals.complexity,
                        needsAudit: signals.needsAudit,
                        requiresStructuredOutput: signals.requiresStructuredOutput,
                        expectsToolCalls: signals.expectsToolCalls,
                        legacyWellSupported: signals.legacyWellSupported,
                        latencyBudgetMs: signals.latencyBudgetMs,
                    },
                    flags: {
                        env: {
                            USE_CLAUDE_ORCHESTRATION: decision.flags.env_USE_CLAUDE_ORCHESTRATION,
                        },
                        options: {
                            use_claude_orchestration: decision.flags.opt_use_claude_orchestration,
                            use_state_machine_orchestration: decision.flags.opt_use_state_machine_orchestration,
                        },
                        derived: {
                            use_state_machine_orchestration: decision.flags.derived_use_state_machine_orchestration,
                        },
                    },
                },
                timestamp: new Date().toISOString(),
                orchestration_mode: decision.mode,
                orchestration_recommended_sm: (_z = (_y = decision.recommendations) === null || _y === void 0 ? void 0 : _y.useStateMachine) !== null && _z !== void 0 ? _z : false,
                risk: signals.risk,
                task_type: signals.taskType,
                requires_consent: (_1 = (_0 = decision.recommendations) === null || _0 === void 0 ? void 0 : _0.requireConsent) !== null && _1 !== void 0 ? _1 : false,
                max_seconds: (_3 = (_2 = request.options) === null || _2 === void 0 ? void 0 : _2.max_seconds) !== null && _3 !== void 0 ? _3 : 60,
                latency_budget_ms: signals.latencyBudgetMs,
            };
            const fallbackOrder = {
                CLAUDE_SM: ['CLAUDE_DYNAMIC', 'LEGACY'],
                CLAUDE_DYNAMIC: ['LEGACY'],
                LEGACY: [],
            };
            let finalMode = decision.mode;
            let usedFallback = false;
            const execMode = async (mode) => {
                const remaining = deadline.remainingMs();
                if (remaining <= 0)
                    throw new Error('TIMEOUT:AGENT_DEADLINE');
                if (mode === 'CLAUDE_SM') {
                    if (!this.claudeOrchestrator)
                        throw new Error('CLAUDE_SM_UNAVAILABLE');
                    if (!this.breakerSM.canPass())
                        throw new Error('BREAKER_OPEN:CLAUDE_SM');
                    const res = await (0, orchestration_stability_util_1.withTimeout)(this.routeAndRunWithClaudeStateMachine(request, startTime, traceInfo, deadline), remaining, 'CLAUDE_SM');
                    this.breakerSM.onSuccess();
                    return res;
                }
                if (mode === 'CLAUDE_DYNAMIC') {
                    if (!this.claudeOrchestrator)
                        throw new Error('CLAUDE_DYNAMIC_UNAVAILABLE');
                    if (!this.breakerDyn.canPass())
                        throw new Error('BREAKER_OPEN:CLAUDE_DYNAMIC');
                    const res = await (0, orchestration_stability_util_1.withTimeout)(this.routeAndRunWithClaude(request, startTime, traceInfo, deadline), remaining, 'CLAUDE_DYNAMIC');
                    this.breakerDyn.onSuccess();
                    return res;
                }
                if (!this.breakerLegacy.canPass())
                    throw new Error('BREAKER_OPEN:LEGACY');
                const res = await (0, orchestration_stability_util_1.withTimeout)(this.routeAndRunLegacy(request, startTime, traceInfo, deadline), remaining, 'LEGACY');
                this.breakerLegacy.onSuccess();
                return res;
            };
            try {
                const res = await execMode(decision.mode);
                this.modeLock.set(stabilityCtx, decision.mode);
                if (tripRunId && this.tripRunManager) {
                    try {
                        await this.tripRunManager.completeTripRun(tripRunId, {
                            mode_final: decision.mode,
                            fallback_used: false,
                            latency_ms: Date.now() - startTime,
                        });
                    }
                    catch (error) {
                        this.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
                    }
                }
                return this.attachObservability(res, {
                    mode_final: decision.mode,
                    fallback_used: false,
                    deadline_ms: deadline.totalMs,
                    time_remaining_ms: deadline.remainingMs(),
                    breakers: {
                        sm: this.breakerSM.snapshot(),
                        dyn: this.breakerDyn.snapshot(),
                        legacy: this.breakerLegacy.snapshot(),
                    },
                });
            }
            catch (e) {
                if (decision.mode === 'CLAUDE_SM')
                    this.breakerSM.onFailure(e);
                else if (decision.mode === 'CLAUDE_DYNAMIC')
                    this.breakerDyn.onFailure(e);
                else
                    this.breakerLegacy.onFailure(e);
                const canFallback = fallback.tryUse();
                if (!canFallback || deadline.remainingMs() <= 0) {
                    const nf = (0, orchestration_stability_util_1.normalizeError)(e);
                    if (tripRunId && this.tripRunManager) {
                        try {
                            await this.tripRunManager.failTripRun(tripRunId, e, {
                                mode_final: decision.mode,
                                fallback_used: false,
                                latency_ms: Date.now() - startTime,
                            });
                        }
                        catch (error) {
                            this.logger.warn(`Failed to update TripRun to FAILED: ${error.message}`);
                        }
                    }
                    let partialDecisionLog;
                    if (decision.mode === 'CLAUDE_SM' && ((_4 = e === null || e === void 0 ? void 0 : e.message) === null || _4 === void 0 ? void 0 : _4.startsWith('TIMEOUT:CLAUDE_SM'))) {
                        this.logger.warn(`[AgentService] 状态机超时，无法提取部分结果（需要状态机内部处理）`);
                    }
                    return this.buildFailureResponse(request, startTime, nf, {
                        mode_final: decision.mode,
                        fallback_used: false,
                        deadline_ms: deadline.totalMs,
                        time_remaining_ms: deadline.remainingMs(),
                    }, partialDecisionLog);
                }
                usedFallback = true;
                const chain = (_5 = fallbackOrder[decision.mode]) !== null && _5 !== void 0 ? _5 : [];
                for (const nextMode of chain) {
                    if (deadline.remainingMs() <= 0)
                        break;
                    try {
                        finalMode = nextMode;
                        const res = await execMode(nextMode);
                        this.modeLock.set(stabilityCtx, nextMode);
                        if (tripRunId && this.tripRunManager) {
                            try {
                                await this.tripRunManager.completeTripRun(tripRunId, {
                                    mode_final: nextMode,
                                    fallback_used: true,
                                    latency_ms: Date.now() - startTime,
                                });
                            }
                            catch (error) {
                                this.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
                            }
                        }
                        return this.attachObservability(res, {
                            mode_final: nextMode,
                            fallback_used: true,
                            deadline_ms: deadline.totalMs,
                            time_remaining_ms: deadline.remainingMs(),
                            breakers: {
                                sm: this.breakerSM.snapshot(),
                                dyn: this.breakerDyn.snapshot(),
                                legacy: this.breakerLegacy.snapshot(),
                            },
                        });
                    }
                    catch (e2) {
                        if (nextMode === 'CLAUDE_SM')
                            this.breakerSM.onFailure(e2);
                        else if (nextMode === 'CLAUDE_DYNAMIC')
                            this.breakerDyn.onFailure(e2);
                        else
                            this.breakerLegacy.onFailure(e2);
                        continue;
                    }
                }
                const nf = (0, orchestration_stability_util_1.normalizeError)(e);
                if (tripRunId && this.tripRunManager) {
                    try {
                        await this.tripRunManager.failTripRun(tripRunId, e, {
                            mode_final: finalMode,
                            fallback_used: usedFallback,
                            latency_ms: Date.now() - startTime,
                        });
                    }
                    catch (error) {
                        this.logger.warn(`Failed to update TripRun to FAILED: ${error.message}`);
                    }
                }
                let partialDecisionLog;
                if (finalMode === 'CLAUDE_SM' && ((_6 = e === null || e === void 0 ? void 0 : e.message) === null || _6 === void 0 ? void 0 : _6.startsWith('TIMEOUT:CLAUDE_SM'))) {
                    this.logger.warn(`[AgentService] 状态机超时，无法提取部分结果`);
                }
                return this.buildFailureResponse(request, startTime, nf, {
                    mode_final: finalMode,
                    fallback_used: usedFallback,
                    deadline_ms: deadline.totalMs,
                    time_remaining_ms: deadline.remainingMs(),
                }, partialDecisionLog);
            }
            const initialState = this.stateService.createInitialState(request.message, request.user_id, request.trip_id, request.options);
            const routerStartTime = Date.now();
            const routeOutput = await this.router.route(request.message, {
                tripId: request.trip_id,
                recentMessages: (_7 = request.conversation_context) === null || _7 === void 0 ? void 0 : _7.recent_messages,
                userId: request.user_id,
            }, initialState.request_id);
            const routerMs = Date.now() - routerStartTime;
            let state = this.stateService.update(initialState.request_id, {
                observability: {
                    ...initialState.observability,
                    router_ms: routerMs,
                },
            });
            if (routeOutput.route === router_interface_1.RouteType.SYSTEM2_WEBBROWSE && !((_8 = request.options) === null || _8 === void 0 ? void 0 : _8.allow_webbrowse)) {
                (_9 = this.eventTelemetry) === null || _9 === void 0 ? void 0 : _9.recordWebbrowseBlocked(initialState.request_id, 'User consent not provided', { route: routeOutput.route, consent_required: (_10 = routeOutput.consent_required) !== null && _10 !== void 0 ? _10 : false });
                routeOutput.route = router_interface_1.RouteType.SYSTEM2_REASONING;
                routeOutput.confidence = 0.7;
                routeOutput.reasons = [router_interface_1.RouterReason.NO_API];
                routeOutput.consent_required = false;
                (_11 = this.eventTelemetry) === null || _11 === void 0 ? void 0 : _11.recordFallbackTriggered(initialState.request_id, router_interface_1.RouteType.SYSTEM2_WEBBROWSE, router_interface_1.RouteType.SYSTEM2_REASONING, 'Webbrowse blocked due to missing consent', { original_route: router_interface_1.RouteType.SYSTEM2_WEBBROWSE });
            }
            let result;
            let answerText = '';
            if (routeOutput.route.startsWith('SYSTEM1')) {
                const system1Result = await this.system1Executor.execute(routeOutput.route, state);
                result = system1Result.result;
                answerText = system1Result.answerText;
                state = this.stateService.update(state.request_id, {
                    result: {
                        ...state.result,
                        status: system1Result.success ? 'READY' : 'NEED_MORE_INFO',
                    },
                });
            }
            else {
                if (this.dagOrchestrator) {
                    state = await this.executeSystem2PlanAndExecute(state, routeOutput.budget, request);
                }
                else {
                    this.logger.warn('DAGOrchestratorService 未可用，降级使用 ReAct 循环');
                    state = await this.orchestrator.execute(state, routeOutput.budget);
                }
                result = {
                    timeline: state.result.timeline,
                    dropped_items: state.result.dropped_items,
                    candidates: [],
                    evidence: [],
                    robustness: state.compute.robustness,
                };
                answerText = this.generateAnswerText(state);
            }
            const tokensEst = token_calculator_util_1.TokenCalculator.estimateTotalTokens(request.message, answerText, {
                route: routeOutput,
                result: result,
                state: {
                    trip: state.trip,
                    memory: state.memory,
                    compute: state.compute,
                    result: state.result,
                },
            });
            const latency = Date.now() - startTime;
            const response = {
                request_id: request.request_id,
                route: routeOutput,
                result: {
                    status: this.mapStateStatusToResultStatus(state.result.status),
                    answer_text: answerText,
                    payload: {
                        ...result,
                        ...(state.result.status === 'SUSPENDED' && state.result.suspensionInfo
                            ? { suspensionInfo: state.result.suspensionInfo }
                            : {}),
                    },
                },
                explain: {
                    decision_log: state.react.decision_log.map(log => ({
                        request_id: state.request_id,
                        step: 'DONE',
                        actor: 'Orchestrator',
                        inputs_summary: `Action: ${log.chosen_action}, Reason: ${log.reason_code}`,
                        outputs_summary: `执行了 ${log.chosen_action}，策略: ${log.policy_id}`,
                        evidence_refs: [],
                        timestamp: new Date().toISOString(),
                        metadata: {
                            step_number: log.step,
                            facts: log.facts,
                            policy_id: log.policy_id,
                        },
                    })),
                },
                observability: {
                    latency_ms: latency,
                    router_ms: routerMs,
                    system_mode: routeOutput.route.startsWith('SYSTEM1') ? 'SYSTEM1' : 'SYSTEM2',
                    tool_calls: state.observability.tool_calls,
                    browser_steps: state.observability.browser_steps,
                    tokens_est: tokensEst,
                    cost_est_usd: state.observability.cost_est_usd,
                    fallback_used: state.observability.fallback_used,
                    trace: traceInfo || {
                        orchestration: {
                            resolved: {
                                mode: 'LEGACY',
                                reason: 'Claude orchestration disabled, using legacy routing',
                                matchedRules: ['legacy_fallback'],
                            },
                        },
                        timestamp: new Date().toISOString(),
                        orchestration_mode: 'LEGACY',
                    },
                },
            };
            this.logger.debug(`Request completed: ${request.request_id}, latency: ${latency}ms`);
            const metrics = (0, agent_metrics_util_1.extractMetricsFromResponse)(response);
            if (metrics) {
                if (metrics.redirect_reason && metrics.entry_point) {
                    agent_metrics_util_1.MetricsRecorder.recordRedirect(metrics.redirect_reason, metrics.entry_point);
                }
                if (metrics.error_type) {
                    agent_metrics_util_1.MetricsRecorder.recordClarification(String(metrics.error_type));
                }
                if (metrics.decision_log_completeness !== undefined) {
                    agent_metrics_util_1.MetricsRecorder.recordDecisionLogCompleteness(Number(metrics.decision_log_completeness));
                }
            }
            if (this.requestDeduplication && !((_12 = request.options) === null || _12 === void 0 ? void 0 : _12.dry_run)) {
                const dedupService = this.requestDeduplication;
                const requestHash = dedupService.generateRequestHash(request);
                dedupService.cacheResponse(requestHash, response);
            }
            (_13 = this.eventTelemetry) === null || _13 === void 0 ? void 0 : _13.recordAgentComplete(request.request_id, response.result.status, latency, tokensEst !== null && tokensEst !== void 0 ? tokensEst : 0, (_14 = state.observability.cost_est_usd) !== null && _14 !== void 0 ? _14 : 0, {
                route: routeOutput.route,
                system_mode: (_15 = response.observability.system_mode) !== null && _15 !== void 0 ? _15 : 'SYSTEM2',
                tool_calls: (_16 = response.observability.tool_calls) !== null && _16 !== void 0 ? _16 : 0,
                browser_steps: (_17 = response.observability.browser_steps) !== null && _17 !== void 0 ? _17 : 0,
            });
            return response;
        }
        catch (error) {
            this.logger.error(`Agent service error: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
            if (tripRunId && this.tripRunManager) {
                try {
                    await this.tripRunManager.failTripRun(tripRunId, error, {
                        error_type: 'unhandled_exception',
                        caught_at: 'routeAndRun_outer_catch',
                    });
                }
                catch (updateError) {
                    this.logger.warn(`Failed to update TripRun to FAILED in outer catch: ${updateError.message}`);
                }
            }
            throw error;
        }
    }
    mapStateStatusToResultStatus(stateStatus) {
        const mapping = {
            READY: 'OK',
            DRAFT: 'NEED_MORE_INFO',
            NEED_MORE_INFO: 'NEED_MORE_INFO',
            NEED_CONSENT: 'NEED_CONSENT',
            SUSPENDED: 'NEED_CONFIRMATION',
            FAILED: 'FAILED',
            TIMEOUT: 'TIMEOUT',
        };
        return mapping[stateStatus] || 'FAILED';
    }
    generateAnswerText(state) {
        if (state.result.status === 'READY') {
            if (state.result.timeline && state.result.timeline.length > 0) {
                return `已为您规划好行程，包含 ${state.result.timeline.length} 个节点。`;
            }
            return '处理完成。';
        }
        if (state.result.status === 'NEED_MORE_INFO') {
            return '需要更多信息才能完成规划，请提供日期、人数、城市或预算等信息。';
        }
        if (state.result.status === 'SUSPENDED') {
            const suspensionInfo = state.result.suspensionInfo;
            if (suspensionInfo) {
                return `操作需要您的确认：${suspensionInfo.summary}。请查看审批请求（ID: ${suspensionInfo.approvalId}）。`;
            }
            return '操作需要您的确认，请查看审批请求。';
        }
        if (state.result.status === 'FAILED') {
            return '无法完成规划，请检查约束条件或联系客服。';
        }
        if (state.result.status === 'TIMEOUT') {
            return '处理超时，请稍后重试或简化请求。';
        }
        return '正在处理中...';
    }
    async executeSystem2PlanAndExecute(state, budget, request) {
        if (!this.dagOrchestrator) {
            throw new Error('DAGOrchestratorService 未可用');
        }
        this.logger.log(`[Agent] 使用 Plan-and-Execute Agent 执行 System2 任务`);
        try {
            const dagResult = await this.dagOrchestrator.run(state.request_id, request.message, {
                tripId: request.trip_id,
                userId: request.user_id,
                requestId: request.request_id,
            });
            const updatedState = this.convertDAGResultToAgentState(state, dagResult);
            return this.stateService.update(state.request_id, updatedState);
        }
        catch (error) {
            this.logger.error(`Plan-and-Execute Agent 执行失败: ${error.message}`, error.stack);
            return this.stateService.update(state.request_id, {
                result: {
                    ...state.result,
                    status: 'FAILED',
                    explanations: [
                        ...(state.result.explanations || []),
                        `Plan-and-Execute Agent 执行失败: ${error.message}`,
                    ],
                },
            });
        }
    }
    convertDAGResultToAgentState(originalState, dagResult) {
        var _a, _b, _c, _d;
        const explanations = [
            ...(originalState.result.explanations || []),
            dagResult.summary || 'Plan-and-Execute Agent 执行完成',
        ];
        const memoryKeys = Object.keys(dagResult.memory || {});
        const completedTasks = ((_a = dagResult.plan) === null || _a === void 0 ? void 0 : _a.filter((t) => t.status === 'completed')) || [];
        if (completedTasks.length > 0) {
            explanations.push(`成功执行 ${completedTasks.length} 个任务`);
        }
        let finalStatus = 'READY';
        if (dagResult.status === 'failed') {
            finalStatus = 'FAILED';
        }
        else if (dagResult.status === 'timeout' || dagResult.status === 'deadlock') {
            finalStatus = 'TIMEOUT';
        }
        else if (dagResult.status === 'done') {
            finalStatus = 'READY';
        }
        const suspendedTask = (_b = dagResult.plan) === null || _b === void 0 ? void 0 : _b.find((t) => t.result && t.result.includes('SUSPENDED'));
        if (suspendedTask) {
            finalStatus = 'SUSPENDED';
        }
        const updatedMemory = { ...originalState.memory };
        updatedMemory.dagResult = {
            taskCount: ((_c = dagResult.plan) === null || _c === void 0 ? void 0 : _c.length) || 0,
            completedCount: completedTasks.length,
            memoryKeys,
            status: dagResult.status,
        };
        return {
            result: {
                ...originalState.result,
                status: finalStatus,
                explanations,
            },
            memory: updatedMemory,
            observability: {
                ...originalState.observability,
                tool_calls: (originalState.observability.tool_calls || 0) + (((_d = dagResult.plan) === null || _d === void 0 ? void 0 : _d.length) || 0),
            },
        };
    }
    async routeAndRunWithClaudeStateMachine(request, startTime, traceInfo, deadline) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13;
        this.logger.log(`[AgentService] 使用 Claude 状态机编排: request_id=${request.request_id}`);
        if (!this.claudeOrchestrator) {
            throw new Error('ClaudeOrchestratorService 未注入');
        }
        const context = {
            requestId: request.request_id,
            userId: request.user_id,
            tripId: request.trip_id,
            conversationHistory: (_a = request.conversation_context) === null || _a === void 0 ? void 0 : _a.recent_messages,
        };
        this.logger.log(`[AgentService] 调用状态机编排: request_id=${request.request_id}, deadline=${(deadline === null || deadline === void 0 ? void 0 : deadline.remainingMs()) || 'N/A'}ms`);
        const orchestrationResult = await this.claudeOrchestrator.orchestrateWithStateMachine(request, context, deadline);
        this.logger.log(`[AgentService] 状态机执行完成: success=${orchestrationResult.success}, decisionLog.length=${((_b = orchestrationResult.decisionLog) === null || _b === void 0 ? void 0 : _b.length) || 0}`);
        if ((_c = orchestrationResult.result) === null || _c === void 0 ? void 0 : _c.state) {
            this.logger.log(`[AgentService] 状态机状态: current_step=${orchestrationResult.result.state.current_step}, decision_log.length=${((_d = orchestrationResult.result.state.decision_log) === null || _d === void 0 ? void 0 : _d.length) || 0}`);
        }
        const latency = Date.now() - startTime;
        const currentStep = ((_f = (_e = orchestrationResult.result) === null || _e === void 0 ? void 0 : _e.state) === null || _f === void 0 ? void 0 : _f.current_step) || (orchestrationResult.success ? 'DONE' : 'FAILED');
        const gateResult = (_h = (_g = orchestrationResult.result) === null || _g === void 0 ? void 0 : _g.gate_result) === null || _h === void 0 ? void 0 : _h.gate_result;
        const stateStartedAt = (_l = (_k = (_j = orchestrationResult.result) === null || _j === void 0 ? void 0 : _j.state) === null || _k === void 0 ? void 0 : _k.metadata) === null || _l === void 0 ? void 0 : _l.started_at;
        const elapsedTime = stateStartedAt
            ? Date.now() - new Date(stateStartedAt).getTime()
            : latency;
        const uiState = this.mapOrchestrationStepToUIState(currentStep, gateResult, elapsedTime);
        const isTimeout = !orchestrationResult.success &&
            (((_m = orchestrationResult.result) === null || _m === void 0 ? void 0 : _m.errorType) === error_types_interface_1.ErrorType.TIMEOUT_ERROR ||
                ((_p = (_o = orchestrationResult.result) === null || _o === void 0 ? void 0 : _o.state) === null || _p === void 0 ? void 0 : _p.current_step) === 'TIMEOUT' ||
                ((_q = orchestrationResult.answerText) === null || _q === void 0 ? void 0 : _q.includes('超时')) ||
                ((_r = orchestrationResult.answerText) === null || _r === void 0 ? void 0 : _r.includes('timeout')) ||
                ((_s = orchestrationResult.answerText) === null || _s === void 0 ? void 0 : _s.includes('TIMEOUT')));
        const needsUserConfirmation = !orchestrationResult.success &&
            !isTimeout &&
            ((_t = orchestrationResult.result) === null || _t === void 0 ? void 0 : _t.needsUserConfirmation) === true;
        const resultStatus = isTimeout
            ? 'TIMEOUT'
            : (needsUserConfirmation
                ? 'NEED_MORE_INFO'
                : (orchestrationResult.success ? 'OK' : 'FAILED'));
        const response = {
            request_id: request.request_id,
            route: {
                route: orchestrationResult.success ? router_interface_1.RouteType.SYSTEM2_REASONING : router_interface_1.RouteType.SYSTEM2_REASONING,
                confidence: 0.8,
                reasons: [router_interface_1.RouterReason.LLM_DECISION],
                required_capabilities: ['planning'],
                consent_required: false,
                budget: {
                    max_seconds: ((_u = request.options) === null || _u === void 0 ? void 0 : _u.max_seconds) || 60,
                    max_steps: ((_v = request.options) === null || _v === void 0 ? void 0 : _v.max_steps) || 8,
                    max_browser_steps: ((_w = request.options) === null || _w === void 0 ? void 0 : _w.max_browser_steps) || 0,
                },
                ui_hint: {
                    mode: 'slow',
                    status: isTimeout
                        ? router_interface_1.UIStatus.FAILED
                        : (needsUserConfirmation
                            ? router_interface_1.UIStatus.AWAITING_CONFIRMATION
                            : (orchestrationResult.success ? router_interface_1.UIStatus.DONE : router_interface_1.UIStatus.FAILED)),
                    message: isTimeout
                        ? '请求超时，请缩小范围或稍后重试。'
                        : (needsUserConfirmation
                            ? '需要您的确认'
                            : (orchestrationResult.success ? '处理完成' : '处理失败')),
                },
            },
            ui_state: uiState,
            result: {
                status: resultStatus,
                answer_text: isTimeout
                    ? '请求超时，请缩小范围或稍后重试。'
                    : (needsUserConfirmation
                        ? (((_x = orchestrationResult.result) === null || _x === void 0 ? void 0 : _x.clarificationMessage) || orchestrationResult.answerText)
                        : orchestrationResult.answerText),
                payload: {
                    timeline: ((_z = (_y = orchestrationResult.result) === null || _y === void 0 ? void 0 : _y.itinerary) === null || _z === void 0 ? void 0 : _z.days) || [],
                    dropped_items: [],
                    candidates: [],
                    evidence: ((_1 = (_0 = orchestrationResult.result) === null || _0 === void 0 ? void 0 : _0.state) === null || _1 === void 0 ? void 0 : _1.decision_log) || [],
                    robustness: ((_4 = (_3 = (_2 = orchestrationResult.result) === null || _2 === void 0 ? void 0 : _2.itinerary) === null || _3 === void 0 ? void 0 : _3.metadata) === null || _4 === void 0 ? void 0 : _4.robustness_score) || null,
                    orchestrationResult: orchestrationResult.result && orchestrationResult.result.state
                        ? {
                            state: orchestrationResult.result.state,
                            itinerary: orchestrationResult.result.itinerary,
                            gate_result: orchestrationResult.result.gate_result,
                            decision_log: orchestrationResult.result.decision_log,
                        }
                        : undefined,
                    ...(isTimeout ? {
                        errorType: error_types_interface_1.ErrorType.TIMEOUT_ERROR,
                    } : {}),
                    ...(needsUserConfirmation ? {
                        needsUserConfirmation: true,
                        clarificationMessage: (_5 = orchestrationResult.result) === null || _5 === void 0 ? void 0 : _5.clarificationMessage,
                        clarificationQuestions: (_6 = orchestrationResult.result) === null || _6 === void 0 ? void 0 : _6.clarificationQuestions,
                        missingServices: ((_7 = orchestrationResult.result) === null || _7 === void 0 ? void 0 : _7.missingServices) || [],
                        solutions: ((_8 = orchestrationResult.result) === null || _8 === void 0 ? void 0 : _8.solutions) || [],
                        errorType: (_9 = orchestrationResult.result) === null || _9 === void 0 ? void 0 : _9.errorType,
                    } : {}),
                },
            },
            explain: {
                decision_log: orchestrationResult.decisionLog || [],
                simplified_explanation: this.generateSimplifiedExplanation(orchestrationResult.decisionLog || [], (_10 = orchestrationResult.result) === null || _10 === void 0 ? void 0 : _10.gate_result),
                ai_capability_display: this.generateAICapabilityDisplay(orchestrationResult, (_11 = orchestrationResult.result) === null || _11 === void 0 ? void 0 : _11.gate_result, (_12 = orchestrationResult.result) === null || _12 === void 0 ? void 0 : _12.state),
            },
            observability: {
                latency_ms: latency,
                router_ms: 0,
                system_mode: 'SYSTEM2',
                tool_calls: ((_13 = orchestrationResult.stepsExecuted) === null || _13 === void 0 ? void 0 : _13.length) || 0,
                browser_steps: 0,
                tokens_est: 0,
                cost_est_usd: orchestrationResult.totalCost || 0,
                fallback_used: false,
                trace: traceInfo,
            },
        };
        const metrics = (0, agent_metrics_util_1.extractMetricsFromResponse)(response);
        if (metrics.error_type) {
            agent_metrics_util_1.MetricsRecorder.recordClarification(metrics.error_type);
        }
        if (metrics.decision_log_completeness !== undefined) {
            agent_metrics_util_1.MetricsRecorder.recordDecisionLogCompleteness(metrics.decision_log_completeness);
        }
        return response;
    }
    async routeAndRunWithClaude(request, startTime, traceInfo, deadline) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11;
        if (!this.claudeOrchestrator) {
            throw new Error('ClaudeOrchestratorService 未可用');
        }
        try {
            const context = {
                requestId: request.request_id,
                userId: request.user_id,
                tripId: request.trip_id,
                conversationHistory: (_a = request.conversation_context) === null || _a === void 0 ? void 0 : _a.recent_messages,
                userPreferences: {},
            };
            const orchestrationResult = await this.claudeOrchestrator.orchestrate(request, context, deadline);
            const route = ((_c = (_b = orchestrationResult.result) === null || _b === void 0 ? void 0 : _b.routingDecision) === null || _c === void 0 ? void 0 : _c.route) || router_interface_1.RouteType.SYSTEM2_REASONING;
            const isSystem1 = route.startsWith('SYSTEM1');
            if (isSystem1 && orchestrationResult.success) {
                this.logger.debug(`[AgentService] Claude 编排返回 System 1 路径: ${route}`);
                const tempState = this.stateService.createInitialState(request.message, request.user_id, request.trip_id, request.options);
                const system1Result = await this.system1Executor.execute(route, tempState);
                const latency = Date.now() - startTime;
                return {
                    request_id: request.request_id,
                    route: {
                        route: route,
                        confidence: ((_e = (_d = orchestrationResult.result) === null || _d === void 0 ? void 0 : _d.routingDecision) === null || _e === void 0 ? void 0 : _e.confidence) || 0.8,
                        reasons: [router_interface_1.RouterReason.LLM_DECISION],
                        required_capabilities: ((_g = (_f = orchestrationResult.result) === null || _f === void 0 ? void 0 : _f.routingDecision) === null || _g === void 0 ? void 0 : _g.requiredCapabilities) || [],
                        consent_required: false,
                        budget: ((_j = (_h = orchestrationResult.result) === null || _h === void 0 ? void 0 : _h.routingDecision) === null || _j === void 0 ? void 0 : _j.budget) || {
                            max_seconds: 3,
                            max_steps: 1,
                            max_browser_steps: 0,
                        },
                        ui_hint: {
                            mode: 'fast',
                            status: system1Result.success ? router_interface_1.UIStatus.DONE : router_interface_1.UIStatus.FAILED,
                            message: system1Result.success ? '处理完成' : '处理失败',
                        },
                    },
                    result: {
                        status: system1Result.success ? 'OK' : 'FAILED',
                        answer_text: system1Result.answerText,
                        payload: {
                            timeline: ((_k = system1Result.result) === null || _k === void 0 ? void 0 : _k.timeline) || [],
                            dropped_items: ((_l = system1Result.result) === null || _l === void 0 ? void 0 : _l.dropped_items) || [],
                            candidates: ((_m = system1Result.result) === null || _m === void 0 ? void 0 : _m.candidates) || [],
                            evidence: ((_o = system1Result.result) === null || _o === void 0 ? void 0 : _o.evidence) || [],
                            robustness: ((_p = system1Result.result) === null || _p === void 0 ? void 0 : _p.robustness) || null,
                        },
                    },
                    explain: {
                        decision_log: orchestrationResult.decisionLog || [],
                        simplified_explanation: this.generateSimplifiedExplanation(orchestrationResult.decisionLog || [], (_q = orchestrationResult.result) === null || _q === void 0 ? void 0 : _q.gate_result),
                        ai_capability_display: this.generateAICapabilityDisplay(orchestrationResult, (_r = orchestrationResult.result) === null || _r === void 0 ? void 0 : _r.gate_result, (_s = orchestrationResult.result) === null || _s === void 0 ? void 0 : _s.state),
                    },
                    observability: {
                        latency_ms: latency,
                        router_ms: 0,
                        system_mode: 'SYSTEM1',
                        tool_calls: 1,
                        browser_steps: 0,
                        tokens_est: 0,
                        cost_est_usd: 0,
                        fallback_used: false,
                        trace: traceInfo,
                    },
                };
            }
            const latency = Date.now() - startTime;
            const isTimeout = !orchestrationResult.success &&
                (((_t = orchestrationResult.result) === null || _t === void 0 ? void 0 : _t.errorType) === error_types_interface_1.ErrorType.TIMEOUT_ERROR ||
                    ((_u = orchestrationResult.answerText) === null || _u === void 0 ? void 0 : _u.includes('超时')) ||
                    ((_v = orchestrationResult.answerText) === null || _v === void 0 ? void 0 : _v.includes('timeout')) ||
                    ((_w = orchestrationResult.answerText) === null || _w === void 0 ? void 0 : _w.includes('TIMEOUT')));
            const needsUserConfirmation = !orchestrationResult.success &&
                !isTimeout &&
                ((_x = orchestrationResult.result) === null || _x === void 0 ? void 0 : _x.needsUserConfirmation) === true;
            const clarificationMessage = ((_y = orchestrationResult.result) === null || _y === void 0 ? void 0 : _y.clarificationMessage) || orchestrationResult.answerText;
            const resultStatus = isTimeout
                ? 'TIMEOUT'
                : (needsUserConfirmation
                    ? 'NEED_MORE_INFO'
                    : (orchestrationResult.success ? 'OK' : 'FAILED'));
            const response = {
                request_id: request.request_id,
                route: {
                    route: route,
                    confidence: ((_0 = (_z = orchestrationResult.result) === null || _z === void 0 ? void 0 : _z.routingDecision) === null || _0 === void 0 ? void 0 : _0.confidence) || 0.8,
                    reasons: [router_interface_1.RouterReason.LLM_DECISION],
                    required_capabilities: ((_2 = (_1 = orchestrationResult.result) === null || _1 === void 0 ? void 0 : _1.routingDecision) === null || _2 === void 0 ? void 0 : _2.requiredCapabilities) || [],
                    consent_required: ((_4 = (_3 = orchestrationResult.result) === null || _3 === void 0 ? void 0 : _3.routingDecision) === null || _4 === void 0 ? void 0 : _4.consentRequired) || false,
                    budget: ((_6 = (_5 = orchestrationResult.result) === null || _5 === void 0 ? void 0 : _5.routingDecision) === null || _6 === void 0 ? void 0 : _6.budget) || {
                        max_seconds: 60,
                        max_steps: 8,
                        max_browser_steps: 0,
                    },
                    ui_hint: {
                        mode: isSystem1 ? 'fast' : 'slow',
                        status: isTimeout
                            ? router_interface_1.UIStatus.FAILED
                            : (needsUserConfirmation
                                ? router_interface_1.UIStatus.AWAITING_CONFIRMATION
                                : (orchestrationResult.success ? router_interface_1.UIStatus.DONE : router_interface_1.UIStatus.FAILED)),
                        message: isTimeout
                            ? '请求超时，请缩小范围或稍后重试。'
                            : (needsUserConfirmation
                                ? '需要您的确认'
                                : (orchestrationResult.success ? '处理完成' : '处理失败')),
                    },
                },
                result: {
                    status: resultStatus,
                    answer_text: isTimeout
                        ? '请求超时，请缩小范围或稍后重试。'
                        : (needsUserConfirmation ? clarificationMessage : orchestrationResult.answerText),
                    payload: {
                        timeline: [],
                        dropped_items: [],
                        candidates: [],
                        evidence: [],
                        robustness: null,
                        ...(orchestrationResult.result && orchestrationResult.result.state
                            ? {
                                orchestrationResult: {
                                    state: orchestrationResult.result.state,
                                    itinerary: orchestrationResult.result.itinerary,
                                    gate_result: orchestrationResult.result.gate_result,
                                    decision_log: orchestrationResult.result.decision_log,
                                }
                            }
                            : {}),
                        ...(isTimeout ? {
                            errorType: error_types_interface_1.ErrorType.TIMEOUT_ERROR,
                        } : {}),
                        ...(needsUserConfirmation ? {
                            needsUserConfirmation: true,
                            clarificationMessage: (_7 = orchestrationResult.result) === null || _7 === void 0 ? void 0 : _7.clarificationMessage,
                            clarificationQuestions: (_8 = orchestrationResult.result) === null || _8 === void 0 ? void 0 : _8.clarificationQuestions,
                            missingServices: ((_9 = orchestrationResult.result) === null || _9 === void 0 ? void 0 : _9.missingServices) || [],
                            solutions: ((_10 = orchestrationResult.result) === null || _10 === void 0 ? void 0 : _10.solutions) || [],
                            errorType: (_11 = orchestrationResult.result) === null || _11 === void 0 ? void 0 : _11.errorType,
                        } : {}),
                    },
                },
                explain: {
                    decision_log: orchestrationResult.decisionLog || [],
                },
                observability: {
                    latency_ms: latency,
                    router_ms: 0,
                    system_mode: isSystem1 ? 'SYSTEM1' : 'SYSTEM2',
                    tool_calls: orchestrationResult.stepsExecuted.length,
                    browser_steps: 0,
                    tokens_est: token_calculator_util_1.TokenCalculator.estimateTotalTokens(request.message, orchestrationResult.answerText, {
                        orchestrationResult: orchestrationResult.result,
                        stepsExecuted: orchestrationResult.stepsExecuted,
                        decisionLog: orchestrationResult.decisionLog,
                    }),
                    cost_est_usd: orchestrationResult.totalCost || 0,
                    fallback_used: false,
                    trace: traceInfo,
                },
            };
            return response;
        }
        catch (error) {
            this.logger.error(`[AgentService] Claude 编排失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
            this.logger.warn('[AgentService] Claude 编排失败，降级使用原有路由逻辑');
            const fallbackRequest = {
                ...request,
                options: {
                    ...request.options,
                    use_claude_orchestration: false,
                },
            };
            return this.routeAndRun(fallbackRequest);
        }
    }
    isPlanningRequest(request) {
        const message = request.message.toLowerCase().trim();
        const hasNoTripId = !request.trip_id || request.trip_id === '';
        if (!hasNoTripId) {
            return false;
        }
        const excludeKeywords = [
            '查询规划', '查看规划', '显示规划', '规划查询', '规划详情',
            'query plan', 'show plan', 'view plan', 'display plan', 'plan details'
        ];
        if (excludeKeywords.some(keyword => message.includes(keyword))) {
            return false;
        }
        const planningKeywords = [
            '规划', 'plan', '设计', '制定', '安排', '行程规划',
            '帮我规划', '帮我设计', '帮我安排', '生成行程',
            'create a trip', 'plan a trip', 'design itinerary', 'make itinerary'
        ];
        const hasPlanningKeyword = planningKeywords.some(keyword => message.includes(keyword));
        const isNewTrip = /(?:新|第一次|first time|new trip)/.test(message);
        const destinationPattern = /(?:去|到|visit|go to|travel to)\s+([\u4e00-\u9fa5]{2,}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;
        const daysPattern = /\d+\s*(?:天|days?|day)/;
        const hasDestinationAndDays = destinationPattern.test(message) &&
            daysPattern.test(message) &&
            hasPlanningKeyword;
        const isFromScratch = /(?:从零开始|从头规划|from scratch|start from)/.test(message);
        return hasPlanningKeyword ||
            isNewTrip ||
            hasDestinationAndDays ||
            isFromScratch;
    }
    isModificationRequest(message) {
        const messageLower = message.toLowerCase().trim();
        const modificationKeywordsCN = [
            '修改', '删除', '添加', '更新', '调整', '变更', '替换', '移除',
            '增加', '减少', '编辑', '改动', '更改',
        ];
        const modificationKeywordsEN = [
            'modify', 'delete', 'remove', 'add', 'update', 'change', 'adjust', 'edit',
            'replace', 'insert', 'append', 'drop', 'alter',
        ];
        const hasModificationKeyword = [
            ...modificationKeywordsCN,
            ...modificationKeywordsEN,
        ].some(keyword => messageLower.includes(keyword));
        const queryKeywords = [
            '查询', '查看', '显示', '展示', '了解', '知道', '看看',
            'query', 'show', 'display', 'view', 'see', 'check', 'get',
        ];
        const hasQueryKeyword = queryKeywords.some(keyword => messageLower.includes(keyword));
        if (hasQueryKeyword && hasModificationKeyword) {
            const queryIndices = queryKeywords.map(k => messageLower.indexOf(k)).filter(i => i >= 0);
            const modIndices = [...modificationKeywordsCN, ...modificationKeywordsEN]
                .map(k => messageLower.indexOf(k)).filter(i => i >= 0);
            if (queryIndices.length > 0 && modIndices.length > 0) {
                const queryIndex = Math.min(...queryIndices);
                const modIndex = Math.min(...modIndices);
                if (queryIndex < modIndex) {
                    return false;
                }
                else {
                    return true;
                }
            }
        }
        return hasModificationKeyword && !hasQueryKeyword;
    }
    createMissingTripIdErrorResponse(request, startTime) {
        const latency = Date.now() - startTime;
        return {
            request_id: request.request_id,
            route: {
                route: router_interface_1.RouteType.SYSTEM2_REASONING,
                confidence: 1.0,
                reasons: [router_interface_1.RouterReason.MISSING_INFO],
                required_capabilities: [],
                consent_required: false,
                budget: {
                    max_seconds: 60,
                    max_steps: 8,
                    max_browser_steps: 0,
                },
                ui_hint: {
                    mode: 'slow',
                    status: router_interface_1.UIStatus.AWAITING_CONFIRMATION,
                    message: '需要选择行程',
                },
            },
            result: {
                status: 'FAILED',
                answer_text: '智能体统一入口只为具体行程服务，请提供 trip_id。如果您想规划新行程，请使用规划工作台。',
                payload: {
                    timeline: [],
                    dropped_items: [],
                    candidates: [],
                    evidence: [],
                    robustness: null,
                    redirectInfo: {
                        redirect_to: '/planning-workbench/execute',
                        redirect_reason: 'MISSING_TRIP_ID',
                        original_request: {
                            message: request.message.substring(0, 200),
                            user_id: request.user_id,
                            trip_id: request.trip_id || undefined,
                        },
                    },
                },
            },
            explain: {
                decision_log: [{
                        request_id: request.request_id,
                        step: 'INTAKE',
                        actor: 'Router',
                        inputs_summary: `缺少 trip_id: ${request.message}`,
                        outputs_summary: '返回错误提示',
                        evidence_refs: [],
                        timestamp: new Date().toISOString(),
                        metadata: {
                            error_code: 'MISSING_TRIP_ID',
                        },
                    }],
                simplified_explanation: this.generateSimplifiedExplanation([{
                        request_id: request.request_id,
                        step: 'INTAKE',
                        actor: 'Router',
                        inputs_summary: `缺少 trip_id: ${request.message}`,
                        outputs_summary: '返回错误提示',
                        evidence_refs: [],
                        timestamp: new Date().toISOString(),
                    }], undefined),
            },
            observability: {
                latency_ms: latency,
                router_ms: latency,
                system_mode: 'SYSTEM1',
                tool_calls: 0,
                browser_steps: 0,
                tokens_est: 0,
                cost_est_usd: 0,
                fallback_used: false,
                trace: {
                    orchestration: {
                        resolved: {
                            mode: 'LEGACY',
                            reason: 'Missing trip_id, returning error',
                            matchedRules: ['TRIP_ID_REQUIRED'],
                        },
                    },
                    timestamp: new Date().toISOString(),
                },
            },
        };
    }
    createReadonlyModeRestrictionResponse(request, startTime) {
        var _a;
        const latency = Date.now() - startTime;
        return {
            request_id: request.request_id,
            route: {
                route: router_interface_1.RouteType.SYSTEM2_REASONING,
                confidence: 1.0,
                reasons: [router_interface_1.RouterReason.HIGH_RISK_ACTION],
                required_capabilities: [],
                consent_required: false,
                budget: {
                    max_seconds: 60,
                    max_steps: 8,
                    max_browser_steps: 0,
                },
                ui_hint: {
                    mode: 'slow',
                    status: router_interface_1.UIStatus.REDIRECT_REQUIRED,
                    message: '行程详情页只支持查询操作',
                },
            },
            result: {
                status: 'REDIRECT_REQUIRED',
                answer_text: '行程详情页只支持查询操作，如需修改请前往规划工作台。',
                payload: {
                    timeline: [],
                    dropped_items: [],
                    candidates: [],
                    evidence: [],
                    robustness: null,
                    redirectInfo: {
                        redirect_to: '/planning-workbench/execute',
                        redirect_reason: 'READONLY_MODE_RESTRICTION',
                        original_request: {
                            message: request.message.substring(0, 200),
                            user_id: request.user_id,
                            trip_id: request.trip_id || undefined,
                        },
                    },
                },
            },
            explain: {
                decision_log: [{
                        request_id: request.request_id,
                        step: 'INTAKE',
                        actor: 'Router',
                        inputs_summary: `只读模式限制: ${request.message}`,
                        outputs_summary: '重定向到规划工作台',
                        evidence_refs: [],
                        timestamp: new Date().toISOString(),
                        metadata: {
                            entry_point: (_a = request.options) === null || _a === void 0 ? void 0 : _a.entry_point,
                            readonly_mode: true,
                            redirect_reason: 'READONLY_MODE_RESTRICTION',
                        },
                    }],
                simplified_explanation: this.generateSimplifiedExplanation([{
                        request_id: request.request_id,
                        step: 'INTAKE',
                        actor: 'Router',
                        inputs_summary: `只读模式限制: ${request.message}`,
                        outputs_summary: '重定向到规划工作台',
                        evidence_refs: [],
                        timestamp: new Date().toISOString(),
                    }], undefined),
            },
            observability: {
                latency_ms: latency,
                router_ms: latency,
                system_mode: 'REDIRECT',
                tool_calls: 0,
                browser_steps: 0,
                tokens_est: 0,
                cost_est_usd: 0,
                fallback_used: false,
                trace: {
                    orchestration: {
                        resolved: {
                            mode: 'LEGACY',
                            reason: 'Readonly mode restriction, redirecting to planning workbench',
                            matchedRules: ['READONLY_MODE_CHECK'],
                        },
                    },
                    timestamp: new Date().toISOString(),
                },
            },
        };
    }
    createRedirectToPlanningWorkbenchResponse(request, startTime) {
        const latency = Date.now() - startTime;
        return {
            request_id: request.request_id,
            route: {
                route: router_interface_1.RouteType.SYSTEM2_REASONING,
                confidence: 1.0,
                reasons: [router_interface_1.RouterReason.REDIRECT_TO_PLANNING_WORKBENCH],
                required_capabilities: ['planning'],
                consent_required: false,
                budget: {
                    max_seconds: 60,
                    max_steps: 8,
                    max_browser_steps: 0,
                },
                ui_hint: {
                    mode: 'slow',
                    status: router_interface_1.UIStatus.REDIRECT_REQUIRED,
                    message: '需要前往规划工作台',
                },
            },
            result: {
                status: 'REDIRECT_REQUIRED',
                answer_text: '行程规划功能已迁移到规划工作台，请使用 POST /planning-workbench/execute 接口。',
                payload: {
                    timeline: [],
                    dropped_items: [],
                    candidates: [],
                    evidence: [],
                    robustness: null,
                    redirectInfo: {
                        redirect_to: '/planning-workbench/execute',
                        redirect_reason: 'PLANNING_REQUEST_DETECTED',
                        original_request: {
                            message: request.message.substring(0, 200),
                            user_id: request.user_id,
                            trip_id: request.trip_id || undefined,
                        },
                    },
                },
            },
            explain: {
                decision_log: [{
                        request_id: request.request_id,
                        step: 'INTAKE',
                        actor: 'Router',
                        inputs_summary: `检测到规划请求: ${request.message}`,
                        outputs_summary: '重定向到规划工作台',
                        evidence_refs: [],
                        timestamp: new Date().toISOString(),
                        metadata: {
                            redirect_reason: 'PLANNING_REQUEST_DETECTED',
                        },
                    }],
                simplified_explanation: this.generateSimplifiedExplanation([{
                        request_id: request.request_id,
                        step: 'INTAKE',
                        actor: 'Router',
                        inputs_summary: `检测到规划请求: ${request.message}`,
                        outputs_summary: '重定向到规划工作台',
                        evidence_refs: [],
                        timestamp: new Date().toISOString(),
                    }], undefined),
            },
            observability: {
                latency_ms: latency,
                router_ms: latency,
                system_mode: 'REDIRECT',
                tool_calls: 0,
                browser_steps: 0,
                tokens_est: 0,
                cost_est_usd: 0,
                fallback_used: false,
                trace: {
                    orchestration: {
                        resolved: {
                            mode: 'LEGACY',
                            reason: 'Planning request detected, redirecting to planning workbench',
                            matchedRules: ['PLANNING_REQUEST_INTERCEPT'],
                        },
                    },
                    timestamp: new Date().toISOString(),
                },
            },
        };
    }
    async routeAndRunLegacy(request, startTime, traceInfo, deadline) {
        var _a, _b, _c;
        if (deadline && deadline.remainingMs() <= 0) {
            throw new Error('TIMEOUT:LEGACY_DEADLINE');
        }
        const initialState = this.stateService.createInitialState(request.message, request.user_id, request.trip_id, request.options);
        const routerStartTime = Date.now();
        const routeOutput = await this.router.route(request.message, {
            tripId: request.trip_id,
            recentMessages: (_a = request.conversation_context) === null || _a === void 0 ? void 0 : _a.recent_messages,
            userId: request.user_id,
        }, initialState.request_id);
        const routerMs = Date.now() - routerStartTime;
        let state = this.stateService.update(initialState.request_id, {
            observability: {
                ...initialState.observability,
                router_ms: routerMs,
            },
        });
        if (routeOutput.route === router_interface_1.RouteType.SYSTEM2_WEBBROWSE && !((_b = request.options) === null || _b === void 0 ? void 0 : _b.allow_webbrowse)) {
            routeOutput.route = router_interface_1.RouteType.SYSTEM2_REASONING;
            routeOutput.confidence = 0.7;
            routeOutput.reasons = [router_interface_1.RouterReason.NO_API];
            routeOutput.consent_required = false;
        }
        let result;
        let answerText = '';
        if (routeOutput.route.startsWith('SYSTEM1')) {
            const system1Result = await this.system1Executor.execute(routeOutput.route, state);
            result = system1Result.result;
            answerText = system1Result.answerText;
            state = this.stateService.update(state.request_id, {
                result: {
                    ...state.result,
                    status: system1Result.success ? 'READY' : 'NEED_MORE_INFO',
                },
            });
        }
        else {
            if (this.dagOrchestrator) {
                state = await this.executeSystem2PlanAndExecute(state, routeOutput.budget, request);
            }
            else {
                this.logger.warn('DAGOrchestratorService 未可用，降级使用 ReAct 循环');
                state = await this.orchestrator.execute(state, routeOutput.budget);
            }
            result = {
                timeline: state.result.timeline,
                dropped_items: state.result.dropped_items,
                candidates: [],
                evidence: [],
                robustness: state.compute.robustness,
            };
            answerText = this.generateAnswerText(state);
        }
        const tokensEst = token_calculator_util_1.TokenCalculator.estimateTotalTokens(request.message, answerText, {
            route: routeOutput,
            result: result,
            state: {
                trip: state.trip,
                memory: state.memory,
                compute: state.compute,
                result: state.result,
            },
        });
        const latency = Date.now() - startTime;
        const response = {
            request_id: request.request_id,
            route: routeOutput,
            result: {
                status: this.mapStateStatusToResultStatus(state.result.status),
                answer_text: answerText,
                payload: {
                    ...result,
                    ...(state.result.status === 'SUSPENDED' && state.result.suspensionInfo
                        ? { suspensionInfo: state.result.suspensionInfo }
                        : {}),
                },
            },
            explain: {
                decision_log: state.react.decision_log.map(log => ({
                    request_id: state.request_id,
                    step: 'DONE',
                    actor: 'Orchestrator',
                    inputs_summary: `Action: ${log.chosen_action}, Reason: ${log.reason_code}`,
                    outputs_summary: `执行了 ${log.chosen_action}，策略: ${log.policy_id}`,
                    evidence_refs: [],
                    timestamp: new Date().toISOString(),
                    metadata: {
                        step_number: log.step,
                        facts: log.facts,
                        policy_id: log.policy_id,
                    },
                })),
                simplified_explanation: this.generateSimplifiedExplanation(state.react.decision_log.map(log => ({
                    request_id: state.request_id,
                    step: 'DONE',
                    actor: 'Orchestrator',
                    inputs_summary: `Action: ${log.chosen_action}, Reason: ${log.reason_code}`,
                    outputs_summary: `执行了 ${log.chosen_action}，策略: ${log.policy_id}`,
                    evidence_refs: [],
                    timestamp: new Date().toISOString(),
                })), undefined),
            },
            observability: {
                latency_ms: latency,
                router_ms: routerMs,
                system_mode: routeOutput.route.startsWith('SYSTEM1') ? 'SYSTEM1' : 'SYSTEM2',
                tool_calls: state.observability.tool_calls,
                browser_steps: state.observability.browser_steps,
                tokens_est: tokensEst,
                cost_est_usd: state.observability.cost_est_usd,
                fallback_used: state.observability.fallback_used,
                trace: traceInfo || {
                    orchestration: {
                        resolved: {
                            mode: 'LEGACY',
                            reason: 'Claude orchestration disabled, using legacy routing',
                            matchedRules: ['legacy_fallback'],
                        },
                    },
                    timestamp: new Date().toISOString(),
                    orchestration_mode: 'LEGACY',
                },
            },
        };
        if (this.requestDeduplication && !((_c = request.options) === null || _c === void 0 ? void 0 : _c.dry_run)) {
            const requestHash = this.requestDeduplication.generateRequestHash(request);
            this.requestDeduplication.cacheResponse(requestHash, response);
        }
        if (this.eventTelemetry) {
            this.eventTelemetry.recordAgentComplete(request.request_id, response.result.status, latency, tokensEst, state.observability.cost_est_usd, {
                route: routeOutput.route,
                system_mode: response.observability.system_mode,
                tool_calls: response.observability.tool_calls,
                browser_steps: response.observability.browser_steps,
            });
        }
        return response;
    }
    buildFailureResponse(request, startTime, nf, obs, partialDecisionLog) {
        var _a;
        return {
            request_id: request.request_id,
            route: {
                route: router_interface_1.RouteType.SYSTEM2_REASONING,
                confidence: 0.1,
                reasons: [router_interface_1.RouterReason.MISSING_INFO],
                required_capabilities: [],
                consent_required: false,
                budget: {
                    max_seconds: Math.round(((_a = obs.deadline_ms) !== null && _a !== void 0 ? _a : 12000) / 1000),
                    max_steps: 0,
                    max_browser_steps: 0,
                },
                ui_hint: {
                    mode: 'slow',
                    status: nf.status === 'TIMEOUT' ? router_interface_1.UIStatus.FAILED : router_interface_1.UIStatus.FAILED,
                    message: nf.message,
                },
            },
            result: {
                status: nf.status,
                answer_text: nf.message,
                payload: {
                    timeline: [],
                    dropped_items: [],
                    candidates: [],
                    evidence: [],
                    robustness: null,
                    needsUserConfirmation: nf.status === 'NEED_CONFIRMATION' || nf.status === 'NEED_MORE_INFO',
                    clarificationMessage: nf.message,
                    errorType: (nf.isTimeout ? error_types_interface_1.ErrorType.TIMEOUT_ERROR : error_types_interface_1.ErrorType.UNKNOWN_ERROR),
                },
            },
            explain: {
                decision_log: partialDecisionLog || [],
                simplified_explanation: undefined,
            },
            observability: {
                latency_ms: Date.now() - startTime,
                router_ms: 0,
                system_mode: 'SYSTEM2',
                tool_calls: 0,
                browser_steps: 0,
                tokens_est: 0,
                cost_est_usd: 0,
                fallback_used: Boolean(obs.fallback_used),
                trace: {
                    orchestration: {
                        resolved: {
                            mode: obs.mode_final || 'LEGACY',
                            reason: `Failed with error: ${nf.errorType}`,
                            matchedRules: ['stability_layer_failure'],
                        },
                    },
                    timestamp: new Date().toISOString(),
                    deadline_ms: obs.deadline_ms,
                    time_remaining_ms: obs.time_remaining_ms,
                    mode_final: obs.mode_final,
                },
            },
        };
    }
    attachObservability(resp, obs) {
        var _a;
        if (!resp)
            return resp;
        resp.observability = {
            ...((_a = resp.observability) !== null && _a !== void 0 ? _a : {}),
            ...obs,
        };
        return resp;
    }
    generateAICapabilityDisplay(orchestrationResult, gateResult, state) {
        var _a;
        if (!orchestrationResult.success && !gateResult) {
            return undefined;
        }
        const capabilitiesUsed = [];
        const decisionLog = orchestrationResult.decisionLog || [];
        const skillsUsed = new Set();
        for (const entry of decisionLog) {
            if ((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.tool_calls) {
                const toolCalls = entry.metadata.tool_calls;
                if (Array.isArray(toolCalls)) {
                    toolCalls.forEach((call) => {
                        if (call.skill_name) {
                            skillsUsed.add(call.skill_name);
                        }
                    });
                }
            }
        }
        if (gateResult) {
            capabilitiesUsed.push({
                name: '安全评估',
                description: '评估路线安全性和可行性',
                status: gateResult.gate_result === 'ALLOW' ? 'SUCCESS' : 'PARTIAL',
            });
        }
        if (state === null || state === void 0 ? void 0 : state.itinerary) {
            capabilitiesUsed.push({
                name: '行程生成',
                description: '生成详细的行程安排',
                status: 'SUCCESS',
            });
        }
        if (skillsUsed.has('transport.search')) {
            capabilitiesUsed.push({
                name: '交通查询',
                description: '查询交通班次和路线',
                status: 'SUCCESS',
            });
        }
        if (skillsUsed.has('poi.search')) {
            capabilitiesUsed.push({
                name: '地点搜索',
                description: '搜索和推荐景点',
                status: 'SUCCESS',
            });
        }
        if (skillsUsed.has('dem.get.profile')) {
            capabilitiesUsed.push({
                name: '地形分析',
                description: '分析地形和体力消耗',
                status: 'SUCCESS',
            });
        }
        const evidenceCount = decisionLog.reduce((sum, entry) => { var _a; return sum + (((_a = entry.evidence_refs) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
        const dataCompleteness = evidenceCount > 0 ? Math.min(1, evidenceCount / 10) : 0.5;
        const dataFreshness = 0.9;
        const dataReliability = (gateResult === null || gateResult === void 0 ? void 0 : gateResult.confidence) || 0.8;
        const gateConfidence = (gateResult === null || gateResult === void 0 ? void 0 : gateResult.confidence) || 0.8;
        const planConfidence = (state === null || state === void 0 ? void 0 : state.itinerary) ? 0.85 : 0.5;
        const overallConfidence = (gateConfidence + planConfidence) / 2;
        const limitations = [];
        if (dataCompleteness < 0.8) {
            limitations.push({
                type: 'DATA_MISSING',
                description: '部分数据可能不完整',
                impact: 'MEDIUM',
            });
        }
        if ((gateResult === null || gateResult === void 0 ? void 0 : gateResult.gate_result) === 'ADJUST_REQUIRED') {
            limitations.push({
                type: 'UNCERTAINTY',
                description: '行程需要根据实际情况调整',
                impact: 'MEDIUM',
            });
        }
        if (overallConfidence < 0.7) {
            limitations.push({
                type: 'UNCERTAINTY',
                description: '部分决策基于估算，建议人工确认',
                impact: 'HIGH',
            });
        }
        return {
            success: orchestrationResult.success,
            capabilities_used: capabilitiesUsed,
            data_quality: {
                completeness: dataCompleteness,
                freshness: dataFreshness,
                reliability: dataReliability,
            },
            confidence: {
                overall: overallConfidence,
                gate_evaluation: gateConfidence,
                plan_generation: planConfidence,
            },
            limitations: limitations.length > 0 ? limitations : undefined,
        };
    }
};
exports.AgentService = AgentService;
exports.AgentService = AgentService = AgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [router_service_1.RouterService,
        agent_state_service_1.AgentStateService,
        system1_executor_service_1.System1ExecutorService,
        orchestrator_service_1.OrchestratorService,
        orchestrator_service_2.DAGOrchestratorService,
        claude_orchestrator_service_1.ClaudeOrchestratorService,
        event_telemetry_service_1.EventTelemetryService,
        request_deduplication_service_1.RequestDeduplicationService,
        trip_run_manager_service_1.TripRunManagerService])
], AgentService);
//# sourceMappingURL=agent.service.js.map