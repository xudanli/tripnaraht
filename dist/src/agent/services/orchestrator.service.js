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
var OrchestratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const action_registry_service_1 = require("./action-registry.service");
const critic_service_1 = require("./critic.service");
const agent_state_service_1 = require("./agent-state.service");
const event_telemetry_service_1 = require("./event-telemetry.service");
const action_cache_service_1 = require("./action-cache.service");
const action_dependency_analyzer_service_1 = require("./action-dependency-analyzer.service");
const llm_plan_service_1 = require("./llm-plan-service");
const tripnara_system_prompt_service_1 = require("./tripnara-system-prompt.service");
const agent_resume_service_1 = require("../../trips/decision/services/agent-resume.service");
const telemetry_service_1 = require("../infra/telemetry.service");
const audit_log_service_1 = require("../infra/audit-log.service");
let OrchestratorService = OrchestratorService_1 = class OrchestratorService {
    constructor(actionRegistry, critic, stateService, eventTelemetry, actionCache, dependencyAnalyzer, llmPlan, systemPromptService, agentResumeService, telemetry, auditLog) {
        this.actionRegistry = actionRegistry;
        this.critic = critic;
        this.stateService = stateService;
        this.eventTelemetry = eventTelemetry;
        this.actionCache = actionCache;
        this.dependencyAnalyzer = dependencyAnalyzer;
        this.llmPlan = llmPlan;
        this.systemPromptService = systemPromptService;
        this.agentResumeService = agentResumeService;
        this.telemetry = telemetry;
        this.auditLog = auditLog;
        this.logger = new common_1.Logger(OrchestratorService_1.name);
        this.logger.log('🎯 Orchestrator 已初始化 (V2.1)');
    }
    async execute(state, budget) {
        var _a, _b, _c, _d;
        const startTime = Date.now();
        let currentState = state;
        const traceId = ((_a = this.telemetry) === null || _a === void 0 ? void 0 : _a.startTrace(`orchestrator:${currentState.request_id}`, 'core_action', { 'request.id': currentState.request_id })) || currentState.request_id;
        if (this.telemetry && traceId) {
            const rootSpan = this.telemetry.getTraceDetail(traceId);
            if (rootSpan) {
                this.telemetry.setBudget(rootSpan.spanId, {
                    durationMs: budget.max_seconds * 1000,
                    llmTokens: 4000,
                    toolCalls: budget.max_steps,
                });
            }
        }
        this.logger.debug(`Starting System2 ReAct loop for request: ${currentState.request_id} (traceId: ${traceId})`);
        (_b = this.auditLog) === null || _b === void 0 ? void 0 : _b.logUserAction({
            traceId,
            userId: 'system',
            action: 'orchestrator_start',
            resource: `request:${currentState.request_id}`,
            params: { budget },
        });
        try {
            currentState = this.stateService.update(currentState.request_id, {
                react: {
                    ...currentState.react,
                    step: 0,
                    observations: [],
                    decision_log: [],
                },
                result: {
                    ...currentState.result,
                    status: 'DRAFT',
                },
            });
            while (this.shouldContinue(currentState, budget, startTime)) {
                currentState = this.stateService.get(currentState.request_id) || currentState;
                const actions = await this.plan(currentState);
                if (!actions || actions.length === 0) {
                    this.logger.debug('No actions selected, breaking loop');
                    break;
                }
                if (actions.length === 1) {
                    const action = actions[0];
                    this.logger.debug(`Step ${currentState.react.step}: Executing action ${action.name}`);
                    const actResult = await this.actWithCacheInfo(currentState, action);
                    currentState = actResult.state;
                    const cacheHit = actResult.cacheHit;
                    if (currentState.result.status === 'FAILED') {
                        this.logger.warn(`Action ${action.name} failed, stopping ReAct loop`);
                        break;
                    }
                    if (currentState.result.status === 'SUSPENDED') {
                        this.logger.warn(`Action ${action.name} requires approval, suspending ReAct loop`);
                        break;
                    }
                    currentState = this.stateService.updateNested(currentState.request_id, ['react', 'last_action_cache_hit'], cacheHit);
                    currentState = this.stateService.get(currentState.request_id) || currentState;
                    currentState = await this.observe(currentState, action);
                }
                else {
                    this.logger.debug(`Step ${currentState.react.step}: Executing ${actions.length} actions in parallel: ${actions.map(a => a.name).join(', ')}`);
                    currentState = await this.actParallel(currentState, actions);
                    currentState = this.stateService.get(currentState.request_id) || currentState;
                    for (const action of actions) {
                        currentState = await this.observe(currentState, action);
                        currentState = this.stateService.get(currentState.request_id) || currentState;
                    }
                }
                currentState = this.stateService.get(currentState.request_id) || currentState;
                if (actions.length === 1 && actions[0].name === 'places.resolve_entities') {
                }
                const criticResult = await this.critic.validateFeasibility(currentState);
                const decisionLogEntries = actions.map(action => {
                    var _a, _b;
                    let reasonCode = 'UNKNOWN';
                    if (action.name === 'places.resolve_entities') {
                        reasonCode = currentState.draft.nodes.length === 0 ? 'MISSING_NODES' : 'NODES_ALREADY_EXIST';
                    }
                    else if (action.name === 'places.get_poi_facts') {
                        reasonCode = currentState.memory.semantic_facts.pois.length === 0 ? 'MISSING_POI_FACTS' : 'FETCHING_FACTS';
                    }
                    else if (action.name === 'transport.build_time_matrix') {
                        reasonCode = currentState.compute.time_matrix_robust === null ? 'MISSING_TIME_MATRIX' : 'BUILDING_MATRIX';
                    }
                    else if (action.name === 'itinerary.optimize_day_vrptw') {
                        reasonCode = currentState.compute.optimization_results.length === 0 ? 'MISSING_OPTIMIZATION' : 'OPTIMIZING';
                    }
                    else if (action.name === 'policy.validate_feasibility') {
                        reasonCode = criticResult.pass ? 'VALIDATION_PASSED' : (((_a = criticResult.violations[0]) === null || _a === void 0 ? void 0 : _a.type) || 'VALIDATION_FAILED');
                    }
                    else if (action.name === 'readiness.check') {
                        reasonCode = 'READINESS_CHECK_REQUIRED';
                    }
                    else if (action.name === 'trip.load_draft') {
                        reasonCode = 'TRIP_INFO_REQUIRED';
                    }
                    else if (action.name.startsWith('webbrowse.')) {
                        reasonCode = 'WEB_BROWSE_REQUIRED';
                    }
                    else {
                        reasonCode = criticResult.pass ? 'CRITIC_PASSED' : (((_b = criticResult.violations[0]) === null || _b === void 0 ? void 0 : _b.type) || 'UNKNOWN');
                    }
                    const stateSnapshot = {
                        nodes: currentState.draft.nodes.length,
                        facts: currentState.memory.semantic_facts.pois.length,
                        time_matrix: currentState.compute.time_matrix_robust ? 'exists' : 'null',
                    };
                    const cacheHit = currentState.react.last_action_cache_hit || false;
                    return {
                        step: currentState.react.step,
                        chosen_action: action.name,
                        reason_code: reasonCode,
                        facts: {
                            ...this.extractFacts(criticResult),
                            ...stateSnapshot,
                        },
                        policy_id: 'REACT_LOOP',
                        cache_hit: cacheHit,
                    };
                });
                currentState = this.stateService.updateNested(currentState.request_id, ['react', 'decision_log'], [...currentState.react.decision_log, ...decisionLogEntries]);
                if (criticResult.pass) {
                    if (currentState.result.status === 'FAILED') {
                        this.logger.warn('Critic passed but action execution failed, not marking as READY');
                        break;
                    }
                    if (currentState.result.status === 'SUSPENDED') {
                        this.logger.warn('Critic passed but action requires approval, keeping SUSPENDED status');
                        break;
                    }
                    this.logger.debug('Critic passed, marking as READY');
                    currentState = this.stateService.update(currentState.request_id, {
                        result: {
                            ...currentState.result,
                            status: 'READY',
                        },
                    });
                    break;
                }
                if (criticResult.violations.length > 0) {
                    currentState = await this.repair(currentState, criticResult);
                }
                currentState = this.stateService.updateNested(currentState.request_id, ['react', 'step'], currentState.react.step + 1);
            }
            if (currentState.result.status === 'DRAFT') {
                if (this.isTimeout(currentState, budget, startTime)) {
                    currentState = this.stateService.update(currentState.request_id, {
                        result: {
                            ...currentState.result,
                            status: 'TIMEOUT',
                        },
                    });
                }
                else if (this.isHardInfeasible(currentState)) {
                    currentState = this.stateService.update(currentState.request_id, {
                        result: {
                            ...currentState.result,
                            status: 'FAILED',
                        },
                    });
                }
            }
            const latency = Date.now() - startTime;
            currentState = this.stateService.update(currentState.request_id, {
                observability: {
                    ...currentState.observability,
                    latency_ms: latency,
                    tool_calls: currentState.react.step,
                },
            });
            if (this.telemetry && traceId) {
                const summary = this.telemetry.endTrace(traceId, 'success');
                this.logger.debug(`Trace completed: ${summary === null || summary === void 0 ? void 0 : summary.totalDurationMs}ms, tools: ${summary === null || summary === void 0 ? void 0 : summary.totalToolCalls}, SLA: ${(summary === null || summary === void 0 ? void 0 : summary.slaBreached) ? 'BREACHED' : 'OK'}`);
            }
            (_c = this.auditLog) === null || _c === void 0 ? void 0 : _c.logSystemDecision({
                traceId,
                actor: 'orchestrator',
                decision: 'execute_complete',
                inputs: { budget, steps: currentState.react.step },
                output: { status: currentState.result.status },
                reason: `Completed in ${latency}ms with ${currentState.react.step} steps`,
            });
            this.logger.debug(`System2 ReAct loop completed: ${currentState.result.status}, steps: ${currentState.react.step}`);
            return currentState;
        }
        catch (error) {
            this.logger.error(`Orchestrator error: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
            (_d = this.auditLog) === null || _d === void 0 ? void 0 : _d.logException({
                traceId,
                actor: 'orchestrator',
                action: 'execute',
                resource: `request:${currentState.request_id}`,
                error: {
                    code: 'ORCHESTRATOR_ERROR',
                    message: (error === null || error === void 0 ? void 0 : error.message) || String(error),
                    stack: error === null || error === void 0 ? void 0 : error.stack,
                },
            });
            if (this.telemetry && traceId) {
                this.telemetry.endTrace(traceId, 'error', {
                    code: 'ORCHESTRATOR_ERROR',
                    message: (error === null || error === void 0 ? void 0 : error.message) || String(error),
                });
            }
            return this.stateService.update(currentState.request_id, {
                result: {
                    ...currentState.result,
                    status: 'FAILED',
                },
            });
        }
    }
    async plan(state) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this.logger.debug(`Plan: 当前状态 - nodes: ${state.draft.nodes.length}, facts: ${state.memory.semantic_facts.pois.length}, time_matrix: ${state.compute.time_matrix_robust ? 'exists' : 'null'}, optimizations: ${state.compute.optimization_results.length}`);
        const resolveEntitiesAttempts = state.react.decision_log.filter(log => log.chosen_action === 'places.resolve_entities').length;
        const recentResolveAttempts = state.react.decision_log
            .filter(log => log.chosen_action === 'places.resolve_entities')
            .slice(-2);
        const recentEmptyResults = recentResolveAttempts.length >= 2 &&
            state.draft.nodes.length === 0;
        const consecutiveResolveAttempts = state.react.decision_log
            .slice(-3)
            .filter(log => log.chosen_action === 'places.resolve_entities');
        const shouldBlockResolveEntities = (recentEmptyResults && resolveEntitiesAttempts >= 2) ||
            (consecutiveResolveAttempts.length >= 3);
        let plannerType = 'rule_based';
        if (this.llmPlan) {
            try {
                const llmAction = await this.llmPlan.selectAction(state);
                if (llmAction) {
                    if (shouldBlockResolveEntities && llmAction.name === 'places.resolve_entities') {
                        this.logger.warn(`Plan: LLM selected blocked action (places.resolve_entities), 已连续执行 ${consecutiveResolveAttempts.length} 次，强制停止以避免无限循环`);
                        this.markNeedMoreInfo(state, '无法从输入中解析指定的地点信息（如"杭州西湖"、"宁波宁海十里红妆"），请提供更具体的地名或POI列表');
                        return null;
                    }
                    else {
                        this.logger.debug(`Plan: LLM selected action: ${llmAction.name}`);
                        plannerType = 'llm';
                        this.stateService.update(state.request_id, {
                            observability: {
                                ...state.observability,
                                planner_type: plannerType,
                            },
                        });
                        return [llmAction];
                    }
                }
                else {
                    this.logger.debug(`Plan: LLM determined no more actions needed, falling back to rule-based planning`);
                    plannerType = 'rule_based';
                }
            }
            catch (error) {
                this.logger.warn(`LLM Plan failed: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}, falling back to rule-based planning`);
                plannerType = 'rule_based';
            }
        }
        this.stateService.update(state.request_id, {
            observability: {
                ...state.observability,
                planner_type: plannerType,
            },
        });
        const candidateActions = [];
        if (state.trip.trip_id && !state.tripInfo) {
            const loadDraftAttempts = state.react.decision_log.filter(log => log.chosen_action === 'trip.load_draft').length;
            if (loadDraftAttempts === 0) {
                this.logger.debug(`Plan: 检测到 trip_id，选择 trip.load_draft`);
                candidateActions.push({
                    name: 'trip.load_draft',
                    input: { trip_id: state.trip.trip_id },
                });
                return candidateActions.length > 0 ? candidateActions : null;
            }
        }
        if (state.trip.trip_id) {
            const readinessCheckAttempts = state.react.decision_log.filter(log => log.chosen_action === 'readiness.check').length;
            if (readinessCheckAttempts === 0) {
                const tripInfo = state.tripInfo || null;
                if (tripInfo) {
                    let destinationId = tripInfo.destination || tripInfo.destinationId;
                    if (!destinationId && tripInfo.country) {
                        destinationId = tripInfo.country;
                    }
                    if (destinationId) {
                        this.logger.debug(`Plan: 检测到 trip_id 和目的地，选择 readiness.check`);
                        candidateActions.push({
                            name: 'readiness.check',
                            input: {
                                destination_id: destinationId,
                                traveler: {
                                    nationality: (_a = tripInfo.traveler) === null || _a === void 0 ? void 0 : _a.nationality,
                                    budget_level: ((_b = tripInfo.budget) === null || _b === void 0 ? void 0 : _b.style) || tripInfo.budgetLevel,
                                    risk_tolerance: ((_c = tripInfo.preferences) === null || _c === void 0 ? void 0 : _c.riskTolerance) || tripInfo.riskTolerance,
                                },
                                trip: {
                                    start_date: tripInfo.startDate || tripInfo.start_date,
                                    end_date: tripInfo.endDate || tripInfo.end_date,
                                },
                                itinerary: {
                                    countries: tripInfo.countries || [destinationId.split('-')[0]],
                                    activities: tripInfo.activities,
                                    season: tripInfo.season,
                                },
                                geo: tripInfo.startLocation ? {
                                    lat: tripInfo.startLocation.lat,
                                    lng: tripInfo.startLocation.lng,
                                    enhance_with_geo: true,
                                } : undefined,
                            },
                        });
                    }
                }
            }
        }
        const urlMatch = this.extractUrlFromInput(state.user_input);
        if (urlMatch) {
            this.logger.debug(`Plan: Detected URL in input, selecting webbrowse.browse`);
            return [{
                    name: 'webbrowse.browse',
                    input: {
                        url: urlMatch,
                        extract_text: true,
                        extract_links: false,
                        take_screenshot: false,
                    },
                }];
        }
        if (shouldBlockResolveEntities) {
            this.logger.warn(`Plan: 已连续执行 ${consecutiveResolveAttempts.length} 次 places.resolve_entities，强制停止以避免无限循环`);
            this.markNeedMoreInfo(state, '无法从输入中解析指定的地点信息（如"杭州西湖"、"宁波宁海十里红妆"），请提供更具体的地名或POI列表');
            return null;
        }
        const userInput = ((_d = state.user_input) === null || _d === void 0 ? void 0 : _d.trim()) || '';
        const isInvalidQuery = !userInput || userInput.toLowerCase() === 'unknown';
        if (isInvalidQuery && state.draft.nodes.length === 0) {
            this.markNeedMoreInfo(state, '用户输入无效或为空，无法解析地点信息');
            return null;
        }
        if (state.draft.nodes.length === 0 && userInput && resolveEntitiesAttempts < 2) {
            const lastAttempt = state.react.decision_log
                .filter(log => log.chosen_action === 'places.resolve_entities')
                .slice(-1)[0];
            if (lastAttempt && state.draft.nodes.length === 0 && resolveEntitiesAttempts >= 1) {
                this.markNeedMoreInfo(state, '无法从输入中解析地点信息，请提供更具体的地名或POI列表');
                return null;
            }
            this.logger.debug(`Plan: 缺少节点，选择 places.resolve_entities (尝试次数: ${resolveEntitiesAttempts})`);
            candidateActions.push({
                name: 'places.resolve_entities',
                input: {
                    query: userInput,
                    limit: 20,
                },
            });
            return candidateActions.length > 0 ? candidateActions : null;
        }
        if (state.draft.nodes.length === 0 && resolveEntitiesAttempts >= 2) {
            this.logger.warn(`Plan: 已尝试 ${resolveEntitiesAttempts} 次解析实体但未成功，跳过解析步骤`);
        }
        if (state.draft.nodes.length > 0) {
            this.logger.debug(`Plan: 已有 ${state.draft.nodes.length} 个节点，跳过 resolve_entities`);
        }
        if (state.draft.nodes.length > 0) {
            const nodeIds = state.draft.nodes.map((n) => n.id).filter(Boolean);
            const hasFacts = state.memory.semantic_facts.pois.length > 0;
            if (nodeIds.length > 0 && !hasFacts) {
                this.logger.debug('Plan: 节点已解析但缺少事实，选择 places.get_poi_facts');
                candidateActions.push({
                    name: 'places.get_poi_facts',
                    input: { poi_ids: nodeIds },
                });
            }
        }
        if (state.draft.nodes.length > 0 &&
            state.compute.time_matrix_robust === null &&
            state.compute.time_matrix_api === null) {
            const hasFacts = state.memory.semantic_facts.pois.length > 0;
            if (hasFacts) {
                this.logger.debug('Plan: 缺少时间矩阵，选择 transport.build_time_matrix');
                candidateActions.push({
                    name: 'transport.build_time_matrix',
                    input: { nodes: state.draft.nodes },
                });
            }
        }
        if (state.draft.nodes.length > 0 &&
            state.compute.time_matrix_robust !== null &&
            state.compute.optimization_results.length === 0) {
            const hasFacts = ((_f = (_e = state.memory) === null || _e === void 0 ? void 0 : _e.semantic_facts) === null || _f === void 0 ? void 0 : _f.pois) && state.memory.semantic_facts.pois.length > 0;
            if (hasFacts) {
                this.logger.debug('Plan: 前置条件满足（包括 facts），选择 itinerary.optimize_day_vrptw');
                candidateActions.push({
                    name: 'itinerary.optimize_day_vrptw',
                    input: {
                        nodes: state.draft.nodes,
                        time_matrix: state.compute.time_matrix_robust,
                        trip: state.trip,
                    },
                });
                return candidateActions.length > 0 ? candidateActions : null;
            }
            else {
                this.logger.debug('Plan: 缺少 facts，不能执行优化，需要先执行 places.get_poi_facts');
            }
        }
        if (state.compute.optimization_results.length > 0 &&
            state.result.timeline.length > 0 &&
            state.result.status === 'DRAFT') {
            this.logger.debug('Plan: 优化已完成，选择 policy.validate_feasibility');
            candidateActions.push({
                name: 'policy.validate_feasibility',
                input: {
                    timeline: state.result.timeline,
                    policy: (_h = (_g = state.memory) === null || _g === void 0 ? void 0 : _g.user_profile) === null || _h === void 0 ? void 0 : _h.policy,
                },
            });
            return candidateActions.length > 0 ? candidateActions : null;
        }
        if (state.draft.nodes.length > 0 &&
            state.compute.time_matrix_robust !== null &&
            state.compute.optimization_results.length > 0) {
            this.logger.debug('Plan: 所有步骤已完成');
            return null;
        }
        if (candidateActions.length > 0 && this.dependencyAnalyzer) {
            const parallelGroups = this.dependencyAnalyzer.findParallelizableActions(candidateActions, state);
            if (parallelGroups.length > 0 && parallelGroups[0].length > 0) {
                this.logger.debug(`Plan: Found ${parallelGroups[0].length} parallelizable actions`);
                return parallelGroups[0];
            }
        }
        if (candidateActions.length > 0) {
            const lastAction = state.react.decision_log.length > 0
                ? state.react.decision_log[state.react.decision_log.length - 1].chosen_action
                : null;
            const selectedAction = candidateActions[0];
            const recentSameActions = state.react.decision_log
                .slice(-3)
                .filter(log => log.chosen_action === selectedAction.name);
            if (recentSameActions.length >= 3 && lastAction === selectedAction.name) {
                this.logger.warn(`Plan: 已连续执行 ${recentSameActions.length} 次 ${selectedAction.name}，强制中断以避免无限循环`);
                this.markNeedMoreInfo(state, `已多次尝试执行 ${selectedAction.name}，但未能推进规划流程。可能需要调整搜索策略或提供更具体的信息。`);
                return null;
            }
            if (recentSameActions.length >= 2 && lastAction === selectedAction.name) {
                const lastTwoLogs = state.react.decision_log.slice(-2);
                if (lastTwoLogs.length >= 2) {
                    const prevState = lastTwoLogs[0].facts || {};
                    const currentState = {
                        nodes: state.draft.nodes.length,
                        facts: state.memory.semantic_facts.pois.length,
                        time_matrix: state.compute.time_matrix_robust ? 'exists' : 'null',
                    };
                    const allCacheHits = lastTwoLogs.every(log => log.cache_hit === true);
                    const stateChanged = prevState.nodes !== currentState.nodes ||
                        prevState.facts !== currentState.facts ||
                        prevState.time_matrix !== currentState.time_matrix;
                    if (!stateChanged && allCacheHits) {
                        this.logger.warn(`Plan: 已连续执行 ${recentSameActions.length} 次 ${selectedAction.name}，且都是缓存命中且状态未改变，跳过以避免无限循环`);
                        if (candidateActions.length > 1) {
                            this.logger.debug(`Plan: 选择替代 action: ${candidateActions[1].name}`);
                            return [candidateActions[1]];
                        }
                        this.logger.warn('Plan: 没有其他候选 action，结束循环');
                        this.markNeedMoreInfo(state, '无法继续推进规划流程，可能需要更多信息');
                        return null;
                    }
                    if (!stateChanged) {
                        this.logger.warn(`Plan: 已连续执行 ${recentSameActions.length} 次 ${selectedAction.name}，且状态未改变，跳过以避免无限循环`);
                        if (candidateActions.length > 1) {
                            this.logger.debug(`Plan: 选择替代 action: ${candidateActions[1].name}`);
                            return [candidateActions[1]];
                        }
                        this.logger.warn('Plan: 没有其他候选 action，结束循环');
                        this.markNeedMoreInfo(state, '无法继续推进规划流程，可能需要更多信息');
                        return null;
                    }
                }
            }
            const recentSameActions3 = state.react.decision_log
                .slice(-3)
                .filter(log => log.chosen_action === selectedAction.name);
            if (recentSameActions3.length >= 3 && lastAction === selectedAction.name) {
                this.logger.warn(`Plan: 已连续执行 ${recentSameActions3.length} 次 ${selectedAction.name}，跳过以避免无限循环`);
                if (candidateActions.length > 1) {
                    this.logger.debug(`Plan: 选择替代 action: ${candidateActions[1].name}`);
                    return [candidateActions[1]];
                }
                this.logger.warn('Plan: 没有其他候选 action，结束循环');
                this.markNeedMoreInfo(state, '无法继续推进规划流程，可能需要更多信息');
                return null;
            }
            return [selectedAction];
        }
        const finalResolveAttempts = state.react.decision_log.filter(log => log.chosen_action === 'places.resolve_entities').length;
        if (state.draft.nodes.length === 0 && finalResolveAttempts >= 3) {
            this.logger.warn('Plan: 无法解析实体，且已尝试多次，无法继续执行');
            this.markNeedMoreInfo(state, '无法从输入中解析地点信息，请提供更具体的地名或POI列表');
            return null;
        }
        this.logger.warn('Plan: 无法确定下一步 Action');
        this.markNeedMoreInfo(state, '无法确定下一步操作，可能需要更多信息');
        return null;
    }
    extractUrlFromInput(userInput) {
        if (!userInput) {
            return null;
        }
        const urlRegex = /https?:\/\/[^\s]+/gi;
        const match = userInput.match(urlRegex);
        if (match && match.length > 0) {
            return match[0];
        }
        const wwwRegex = /www\.[^\s]+/gi;
        const wwwMatch = userInput.match(wwwRegex);
        if (wwwMatch && wwwMatch.length > 0) {
            return `https://${wwwMatch[0]}`;
        }
        return null;
    }
    async actWithCacheInfo(state, action) {
        var _a, _b, _c, _d, _e, _f, _g;
        const actionDef = this.actionRegistry.get(action.name);
        if (!actionDef) {
            this.logger.warn(`Action not found: ${action.name}`);
            return { state, cacheHit: false };
        }
        if (!this.actionRegistry.checkPreconditions(action.name, state)) {
            this.logger.warn(`Preconditions not met for action: ${action.name}`);
            return { state, cacheHit: false };
        }
        const actStartTime = Date.now();
        let cacheHit = false;
        (_a = this.auditLog) === null || _a === void 0 ? void 0 : _a.logUserAction({
            traceId: state.request_id,
            userId: 'system',
            action: 'tool_call',
            resource: `tool:${action.name}`,
            params: action.input,
            sessionId: state.request_id,
        });
        try {
            let result;
            if (actionDef.metadata.cacheable && this.actionCache) {
                const cacheKey = this.actionCache.generateCacheKey(action.name, action.input, actionDef.metadata.cache_key);
                const cachedResult = this.actionCache.get(cacheKey);
                if (cachedResult !== null) {
                    this.logger.debug(`Cache hit for action: ${action.name}, key: ${cacheKey}`);
                    result = cachedResult;
                    cacheHit = true;
                }
            }
            if (!cacheHit) {
                result = await actionDef.execute(action.input, state);
                if (actionDef.metadata.cacheable && this.actionCache) {
                    const cacheKey = this.actionCache.generateCacheKey(action.name, action.input, actionDef.metadata.cache_key);
                    this.actionCache.set(cacheKey, result);
                    this.logger.debug(`Cached result for action: ${action.name}, key: ${cacheKey}`);
                }
            }
            const actLatency = Date.now() - actStartTime;
            if (this.eventTelemetry) {
                this.eventTelemetry.recordSystem2Step(state.request_id, state.react.step, action.name, result, actLatency, { phase: 'act', cache_hit: cacheHit });
            }
            if ((_b = this.agentResumeService) === null || _b === void 0 ? void 0 : _b.detectSuspensionSignal(result)) {
                this.logger.warn(`检测到 SUSPENDED 信号: action=${action.name}, request_id=${state.request_id}`);
                const suspensionInfo = this.agentResumeService.extractSuspensionInfo(result);
                if (!suspensionInfo) {
                    this.logger.error(`无法提取挂起信息，使用默认处理`);
                    const errorState = this.stateService.update(state.request_id, {
                        result: {
                            ...state.result,
                            status: 'FAILED',
                            explanations: [
                                ...(state.result.explanations || []),
                                `操作需要审批，但无法正确挂起执行`,
                            ],
                        },
                    });
                    return { state: errorState, cacheHit: false };
                }
                try {
                    const toolCallId = `${state.request_id}-${action.name}-${state.react.step}`;
                    const actualToolCallId = result.toolCallId || toolCallId;
                    await this.agentResumeService.saveAgentState(state.request_id, {
                        threadId: state.request_id,
                        lastToolCallId: actualToolCallId,
                        messages: [],
                        metadata: {
                            actionName: action.name,
                            actionInput: action.input,
                            currentStep: state.react.step,
                            toolCallId: actualToolCallId,
                            agentState: state,
                        },
                    });
                    this.logger.log(`Agent 状态已保存: request_id=${state.request_id}, approvalId=${suspensionInfo.approvalId}, toolCallId=${actualToolCallId}`);
                }
                catch (error) {
                    this.logger.error(`保存 Agent 状态失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
                }
                const suspendedState = this.stateService.update(state.request_id, {
                    result: {
                        ...state.result,
                        status: 'SUSPENDED',
                        explanations: [
                            ...(state.result.explanations || []),
                            suspensionInfo.message || `操作需要用户审批（ID: ${suspensionInfo.approvalId}）`,
                        ],
                        suspensionInfo: {
                            approvalId: suspensionInfo.approvalId,
                            skillName: action.name,
                            summary: ((_d = (_c = result.userUI) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.summary) || action.name,
                            payload: ((_f = (_e = result.userUI) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.payload) || action.input,
                        },
                    },
                });
                if (this.eventTelemetry) {
                    this.eventTelemetry.recordSystem2Step(state.request_id, state.react.step, action.name, { suspended: true, approvalId: suspensionInfo.approvalId }, actLatency, { phase: 'act', suspended: true });
                }
                this.logger.log(`Agent 执行已挂起: request_id=${state.request_id}, approvalId=${suspensionInfo.approvalId}`);
                return { state: suspendedState, cacheHit: false };
            }
            if (result && typeof result === 'object' && 'success' in result && result.success === false) {
                const errorMessage = result.error || result.message || 'Action execution failed';
                this.logger.error(`Action execution failed: ${action.name}, error: ${errorMessage}`);
                if (this.eventTelemetry) {
                    this.eventTelemetry.recordSystem2Step(state.request_id, state.react.step, action.name, { error: errorMessage, result }, Date.now() - actStartTime, { phase: 'act', error: true });
                }
                const errorState = this.stateService.update(state.request_id, {
                    result: {
                        ...state.result,
                        status: 'FAILED',
                        explanations: [
                            ...(state.result.explanations || []),
                            `操作失败: ${errorMessage}`,
                        ],
                    },
                });
                return { state: errorState, cacheHit: false };
            }
            const updatedState = this.updateStateFromAction(state, action.name, result);
            return { state: updatedState, cacheHit };
        }
        catch (error) {
            this.logger.error(`Action execution error: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
            const actLatency = Date.now() - actStartTime;
            if (this.eventTelemetry) {
                this.eventTelemetry.recordSystem2Step(state.request_id, state.react.step, action.name, { error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, actLatency, { phase: 'act', error: true });
            }
            (_g = this.auditLog) === null || _g === void 0 ? void 0 : _g.logException({
                traceId: state.request_id,
                actor: 'orchestrator',
                action: `tool:${action.name}`,
                resource: `request:${state.request_id}`,
                error: {
                    code: 'TOOL_EXECUTION_ERROR',
                    message: (error === null || error === void 0 ? void 0 : error.message) || String(error),
                    stack: error === null || error === void 0 ? void 0 : error.stack,
                },
            });
            const errorState = this.stateService.update(state.request_id, {
                result: {
                    ...state.result,
                    status: 'FAILED',
                    explanations: [
                        ...(state.result.explanations || []),
                        `操作失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`,
                    ],
                },
            });
            return { state: errorState, cacheHit: false };
        }
    }
    async act(state, action) {
        const actionDef = this.actionRegistry.get(action.name);
        if (!actionDef) {
            this.logger.warn(`Action not found: ${action.name}`);
            return state;
        }
        if (!this.actionRegistry.checkPreconditions(action.name, state)) {
            this.logger.warn(`Preconditions not met for action: ${action.name}`);
            return state;
        }
        const actStartTime = Date.now();
        let cacheHit = false;
        try {
            let result;
            if (actionDef.metadata.cacheable && this.actionCache) {
                const cacheKey = this.actionCache.generateCacheKey(action.name, action.input, actionDef.metadata.cache_key);
                const cachedResult = this.actionCache.get(cacheKey);
                if (cachedResult !== null) {
                    this.logger.debug(`Cache hit for action: ${action.name}, key: ${cacheKey}`);
                    result = cachedResult;
                    cacheHit = true;
                }
            }
            if (!cacheHit) {
                result = await actionDef.execute(action.input, state);
                if (actionDef.metadata.cacheable && this.actionCache) {
                    const cacheKey = this.actionCache.generateCacheKey(action.name, action.input, actionDef.metadata.cache_key);
                    this.actionCache.set(cacheKey, result);
                    this.logger.debug(`Cached result for action: ${action.name}, key: ${cacheKey}`);
                }
            }
            const actLatency = Date.now() - actStartTime;
            if (this.eventTelemetry) {
                this.eventTelemetry.recordSystem2Step(state.request_id, state.react.step, action.name, result, actLatency, { phase: 'act', cache_hit: cacheHit });
            }
            return this.updateStateFromAction(state, action.name, result);
        }
        catch (error) {
            this.logger.error(`Action execution error: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
            if (this.eventTelemetry) {
                this.eventTelemetry.recordSystem2Step(state.request_id, state.react.step, action.name, { error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, Date.now() - actStartTime, { phase: 'act', error: true });
            }
            return state;
        }
    }
    async actParallel(state, actions) {
        if (actions.length === 0) {
            return state;
        }
        const actStartTime = Date.now();
        let currentState = state;
        const executionPromises = actions.map(async (action) => {
            const actionDef = this.actionRegistry.get(action.name);
            if (!actionDef) {
                this.logger.warn(`Action not found: ${action.name}`);
                return { action, result: null, error: new Error(`Action not found: ${action.name}`) };
            }
            if (!this.actionRegistry.checkPreconditions(action.name, currentState)) {
                this.logger.warn(`Preconditions not met for action: ${action.name}`);
                return { action, result: null, error: new Error(`Preconditions not met: ${action.name}`) };
            }
            const actionStartTime = Date.now();
            let cacheHit = false;
            try {
                let result;
                if (actionDef.metadata.cacheable && this.actionCache) {
                    const cacheKey = this.actionCache.generateCacheKey(action.name, action.input, actionDef.metadata.cache_key);
                    const cachedResult = this.actionCache.get(cacheKey);
                    if (cachedResult !== null) {
                        this.logger.debug(`Cache hit for action: ${action.name}, key: ${cacheKey}`);
                        result = cachedResult;
                        cacheHit = true;
                    }
                }
                if (!cacheHit) {
                    result = await actionDef.execute(action.input, currentState);
                    if (actionDef.metadata.cacheable && this.actionCache) {
                        const cacheKey = this.actionCache.generateCacheKey(action.name, action.input, actionDef.metadata.cache_key);
                        this.actionCache.set(cacheKey, result);
                        this.logger.debug(`Cached result for action: ${action.name}, key: ${cacheKey}`);
                    }
                }
                const actLatency = Date.now() - actionStartTime;
                if (this.eventTelemetry) {
                    this.eventTelemetry.recordSystem2Step(currentState.request_id, currentState.react.step, action.name, result, actLatency, { phase: 'act_parallel', cache_hit: cacheHit });
                }
                return { action, result, error: null };
            }
            catch (error) {
                this.logger.error(`Action execution error: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
                if (this.eventTelemetry) {
                    this.eventTelemetry.recordSystem2Step(currentState.request_id, currentState.react.step, action.name, { error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, Date.now() - actionStartTime, { phase: 'act_parallel', error: true });
                }
                return { action, result: null, error };
            }
        });
        const executionResults = await Promise.all(executionPromises);
        for (const { action, result, error } of executionResults) {
            if (error || !result) {
                this.logger.warn(`Action ${action.name} failed, skipping state update`);
                continue;
            }
            currentState = this.updateStateFromAction(currentState, action.name, result);
        }
        const totalLatency = Date.now() - actStartTime;
        this.logger.debug(`Parallel execution completed: ${actions.length} actions in ${totalLatency}ms ` +
            `(avg: ${Math.round(totalLatency / actions.length)}ms per action)`);
        return currentState;
    }
    async observe(state, action) {
        const observation = {
            step: state.react.step,
            action: action.name,
            timestamp: new Date().toISOString(),
        };
        return this.stateService.updateNested(state.request_id, ['react', 'observations'], [...state.react.observations, observation]);
    }
    async repair(state, criticResult) {
        var _a, _b;
        this.logger.debug(`Repairing ${criticResult.violations.length} violations`);
        let updatedState = state;
        for (const violation of criticResult.violations) {
            const violationType = typeof violation === 'string'
                ? violation.split(':')[0]
                : violation.type || violation;
            this.logger.debug(`Repairing violation: ${violationType}`);
            if (violationType === 'ROBUST_TIME_MISSING') {
                if (updatedState.draft.nodes.length > 0) {
                    const buildTimeMatrixAction = this.actionRegistry.get('transport.build_time_matrix');
                    if (buildTimeMatrixAction) {
                        try {
                            this.logger.debug('Repair: 执行 transport.build_time_matrix');
                            const result = await buildTimeMatrixAction.execute({ nodes: updatedState.draft.nodes, robust: true }, updatedState);
                            updatedState = this.updateStateFromAction(updatedState, 'transport.build_time_matrix', result);
                        }
                        catch (error) {
                            this.logger.error(`Repair action error (build_time_matrix): ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                        }
                    }
                }
                else {
                    this.logger.warn('Repair: ROBUST_TIME_MISSING 但 nodes=0，无法构建 time_matrix，标记为 NEED_MORE_INFO');
                    updatedState = this.stateService.update(updatedState.request_id, {
                        result: {
                            ...updatedState.result,
                            status: 'NEED_MORE_INFO',
                            explanations: [
                                ...(updatedState.result.explanations || []),
                                '无法解析用户输入中的地点信息，请提供更具体的地点名称',
                            ],
                        },
                    });
                }
            }
            if (violationType === 'LUNCH_MISSING') {
                const hasSchedule = updatedState.result.timeline && updatedState.result.timeline.length > 0;
                if (hasSchedule) {
                    const timeline = [...(updatedState.result.timeline || [])];
                    const lunchBreak = ((_a = updatedState.trip) === null || _a === void 0 ? void 0 : _a.lunch_break) || {
                        enabled: true,
                        duration_min: 60,
                        window: ['11:30', '13:30'],
                    };
                    const lunchStart = lunchBreak.window[0];
                    const lunchEnd = this.addMinutes(lunchStart, lunchBreak.duration_min);
                    const hasLunchEvent = timeline.some((event) => event.type === 'LUNCH');
                    if (!hasLunchEvent) {
                        let insertIndex = -1;
                        for (let i = 0; i < timeline.length; i++) {
                            const event = timeline[i];
                            if (event.start && this.compareTime(event.start, lunchStart) >= 0) {
                                insertIndex = i;
                                break;
                            }
                        }
                        if (insertIndex === -1) {
                            insertIndex = timeline.length;
                        }
                        timeline.splice(insertIndex, 0, {
                            type: 'LUNCH',
                            start: lunchStart,
                            end: lunchEnd,
                            duration_min: lunchBreak.duration_min,
                            description: '午餐休息',
                        });
                        this.logger.debug(`Repair: 在 timeline 位置 ${insertIndex} 插入 LUNCH 事件 (${lunchStart} - ${lunchEnd})`);
                        updatedState = this.stateService.update(updatedState.request_id, {
                            result: {
                                ...updatedState.result,
                                timeline,
                            },
                        });
                    }
                    else {
                        this.logger.debug('Repair: timeline 中已存在 LUNCH 事件，跳过插入');
                    }
                }
                else {
                    this.logger.debug('Repair: 检测到 LUNCH_MISSING，但尚未生成 schedule，标记为待修复');
                }
            }
            if (violationType === 'TIME_WINDOW_CONFLICT') {
                const repairAction = this.actionRegistry.get('itinerary.repair_cross_day');
                if (repairAction) {
                    try {
                        this.logger.debug('Repair: 执行 itinerary.repair_cross_day');
                        const result = await repairAction.execute({ violations: [violation] }, updatedState);
                        updatedState = this.updateStateFromAction(updatedState, 'itinerary.repair_cross_day', result);
                    }
                    catch (error) {
                        this.logger.error(`Repair action error (repair_cross_day): ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                    }
                }
            }
            if (violationType === 'DAYS_COUNT_MISMATCH') {
                const violationDetails = typeof violation === 'string'
                    ? { required_days: 0, actual_days: 0 }
                    : violation.details || {};
                const requiredDays = violationDetails.required_days ||
                    (typeof violation === 'string'
                        ? parseInt(((_b = violation.match(/(\d+)\s*天/)) === null || _b === void 0 ? void 0 : _b[1]) || '0')
                        : 0);
                if (requiredDays > 0 && requiredDays !== updatedState.trip.days) {
                    this.logger.debug(`Repair: 更新 trip.days 从 ${updatedState.trip.days} 到 ${requiredDays}`);
                    updatedState = this.stateService.update(updatedState.request_id, {
                        trip: {
                            ...updatedState.trip,
                            days: requiredDays,
                        },
                    });
                }
                else {
                    this.logger.warn(`Repair: DAYS_COUNT_MISMATCH 但无法确定正确的天数，跳过修复`);
                }
            }
        }
        return updatedState;
    }
    updateStateFromAction(state, actionName, result) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (actionName === 'readiness.check') {
            const readinessData = {
                findings: result.findings || [],
                summary: result.summary || {},
                constraints: result.constraints || [],
                tasks: result.tasks || [],
                checkedAt: new Date().toISOString(),
            };
            this.logger.debug(`Updated readiness data: ${readinessData.summary.totalBlockers} blockers, ${readinessData.summary.totalMust} must items`);
            return this.stateService.update(state.request_id, {
                memory: {
                    ...state.memory,
                    readiness: readinessData,
                },
            });
        }
        if (actionName === 'places.resolve_entities') {
            const updatedNodes = result.nodes || [];
            this.logger.debug(`Updated nodes: ${updatedNodes.length} nodes from ${actionName}`);
            if (result.error && (result.error.includes('Invalid query') || result.error.includes('unknown'))) {
                this.logger.error(`places.resolve_entities failed: ${result.error}`);
                return this.stateService.update(state.request_id, {
                    draft: {
                        ...state.draft,
                        nodes: [],
                    },
                    result: {
                        ...state.result,
                        status: 'NEED_MORE_INFO',
                        explanations: [
                            ...(state.result.explanations || []),
                            `无法解析用户输入中的地点信息，请提供更具体的地点名称`,
                        ],
                    },
                });
            }
            const diagnostics = result.diagnostics || {};
            const needsClarification = diagnostics.needsClarification || [];
            const missingPois = diagnostics.missingPois || [];
            if (needsClarification.length > 0 || missingPois.length > 0) {
                let clarificationMessage = '需要澄清以下地点信息：\n';
                for (const item of needsClarification) {
                    clarificationMessage += `\n"${item.poi}" 可能指：\n`;
                    for (const option of item.options) {
                        clarificationMessage += `  - ${option}\n`;
                    }
                }
                if (missingPois.length > 0 && needsClarification.length === 0) {
                    clarificationMessage += `\n无法找到以下地点：${missingPois.join(', ')}\n请提供更具体的地名或POI信息。`;
                }
                this.logger.warn(`[Orchestrator] 检测到需要澄清的POI，停止循环并返回澄清问题`);
                this.logger.debug(`[Orchestrator] 澄清消息: ${clarificationMessage}`);
                return this.stateService.update(state.request_id, {
                    draft: {
                        ...state.draft,
                        nodes: updatedNodes,
                    },
                    result: {
                        ...state.result,
                        status: 'NEED_MORE_INFO',
                        explanations: [
                            ...(state.result.explanations || []),
                            {
                                type: 'clarification',
                                message: clarificationMessage,
                                missing_pois: missingPois,
                                clarification_options: needsClarification,
                            },
                        ],
                    },
                });
            }
            const newState = this.stateService.update(state.request_id, {
                draft: {
                    ...state.draft,
                    nodes: updatedNodes,
                },
            });
            if (updatedNodes.length === 0) {
                const query = state.user_input || 'unknown';
                this.logger.warn(`places.resolve_entities returned empty nodes. Query: ${query}`);
            }
            return newState;
        }
        if (actionName === 'places.get_poi_facts') {
            const facts = (_a = result.facts) !== null && _a !== void 0 ? _a : {};
            this.logger.debug(`Updated POI facts: ${Object.keys(facts).length} facts`);
            return this.stateService.update(state.request_id, {
                memory: {
                    ...state.memory,
                    semantic_facts: {
                        ...state.memory.semantic_facts,
                        pois: result.facts != null ? Object.values(result.facts) : state.memory.semantic_facts.pois,
                    },
                },
            });
        }
        if (actionName.startsWith('places.')) {
            return this.stateService.update(state.request_id, {
                draft: {
                    ...state.draft,
                    nodes: (_b = result.nodes) !== null && _b !== void 0 ? _b : state.draft.nodes,
                },
            });
        }
        if (actionName.startsWith('transport.')) {
            return this.stateService.update(state.request_id, {
                compute: {
                    ...state.compute,
                    time_matrix_api: (_c = result.time_matrix_api) !== null && _c !== void 0 ? _c : state.compute.time_matrix_api,
                    time_matrix_robust: (_d = result.time_matrix_robust) !== null && _d !== void 0 ? _d : state.compute.time_matrix_robust,
                },
            });
        }
        if (actionName.startsWith('itinerary.')) {
            return this.stateService.update(state.request_id, {
                compute: {
                    ...state.compute,
                    optimization_results: (_e = result.results) !== null && _e !== void 0 ? _e : state.compute.optimization_results,
                },
                result: {
                    ...state.result,
                    timeline: (_f = result.timeline) !== null && _f !== void 0 ? _f : state.result.timeline,
                    dropped_items: (_g = result.dropped_items) !== null && _g !== void 0 ? _g : state.result.dropped_items,
                },
            });
        }
        if (actionName.startsWith('policy.')) {
            if (actionName === 'policy.validate_feasibility' && result.pass) {
                return this.stateService.update(state.request_id, {
                    result: {
                        ...state.result,
                        status: 'READY',
                    },
                });
            }
            return state;
        }
        if (actionName.startsWith('trip.')) {
            if (actionName === 'trip.load_draft') {
                const tripInfo = {
                    ...result.trip,
                    items: result.items || [],
                };
                this.logger.debug(`Updated trip info: ${tripInfo.destination || tripInfo.country || 'unknown'}`);
                return this.stateService.update(state.request_id, {
                    tripInfo: tripInfo,
                });
            }
            return state;
        }
        if (actionName.startsWith('webbrowse.')) {
            this.logger.debug(`WebBrowse result: ${result.success ? 'success' : 'failed'}, URL: ${result.url}`);
            return this.stateService.update(state.request_id, {
                memory: {
                    ...state.memory,
                    episodic_snippets: [
                        ...state.memory.episodic_snippets,
                        {
                            type: 'webbrowse',
                            url: result.url,
                            title: result.title,
                            content: (_j = (_h = result.extracted_text) !== null && _h !== void 0 ? _h : result.content) !== null && _j !== void 0 ? _j : '',
                            timestamp: new Date().toISOString(),
                            success: result.success,
                        },
                    ],
                },
                observability: {
                    ...state.observability,
                    browser_steps: state.observability.browser_steps + 1,
                },
            });
        }
        return state;
    }
    shouldContinue(state, budget, startTime) {
        if (state.result.status === 'READY' ||
            state.result.status === 'FAILED' ||
            state.result.status === 'NEED_MORE_INFO') {
            return false;
        }
        if (state.react.step >= budget.max_steps) {
            return false;
        }
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= budget.max_seconds) {
            return false;
        }
        return true;
    }
    isTimeout(state, budget, startTime) {
        const elapsed = (Date.now() - startTime) / 1000;
        return elapsed >= budget.max_seconds;
    }
    markNeedMoreInfo(state, reason) {
        this.logger.warn(`Marking as NEED_MORE_INFO: ${reason}`);
        return this.stateService.update(state.request_id, {
            result: {
                ...state.result,
                status: 'NEED_MORE_INFO',
                explanations: [
                    ...(state.result.explanations || []),
                    reason,
                ],
            },
        });
    }
    addMinutes(timeStr, minutes) {
        const [hours, mins] = timeStr.split(':').map(Number);
        const totalMinutes = hours * 60 + mins + minutes;
        const newHours = Math.floor(totalMinutes / 60);
        const newMins = totalMinutes % 60;
        return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
    }
    compareTime(time1, time2) {
        const [h1, m1] = time1.split(':').map(Number);
        const [h2, m2] = time2.split(':').map(Number);
        const total1 = h1 * 60 + m1;
        const total2 = h2 * 60 + m2;
        if (total1 < total2)
            return -1;
        if (total1 > total2)
            return 1;
        return 0;
    }
    isHardInfeasible(state) {
        const hardNodes = state.draft.hard_nodes || [];
        const droppedItems = state.result.dropped_items || [];
        for (const hardNode of hardNodes) {
            if (droppedItems.some(item => item.id === hardNode.id)) {
                return true;
            }
        }
        return false;
    }
    getReasonCode(action, criticResult, state) {
        var _a;
        if (criticResult.pass) {
            return 'CRITIC_PASSED';
        }
        if (criticResult.violations && criticResult.violations.length > 0) {
            return ((_a = criticResult.violations[0]) === null || _a === void 0 ? void 0 : _a.type) || 'UNKNOWN';
        }
        if (action.name === 'places.resolve_entities') {
            if (state && state.draft.nodes.length === 0) {
                return 'NO_NODES_RESOLVED';
            }
            return 'ENTITIES_RESOLVED';
        }
        if (action.name === 'places.get_poi_facts') {
            return 'FETCHING_POI_FACTS';
        }
        if (action.name === 'transport.build_time_matrix') {
            return 'BUILDING_TIME_MATRIX';
        }
        if (action.name === 'itinerary.optimize_day_vrptw') {
            return 'OPTIMIZING_ITINERARY';
        }
        return 'UNKNOWN';
    }
    extractFacts(criticResult) {
        return {
            violations_count: criticResult.violations.length,
            min_slack: criticResult.min_slack,
            total_wait: criticResult.total_wait,
        };
    }
};
exports.OrchestratorService = OrchestratorService;
exports.OrchestratorService = OrchestratorService = OrchestratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __param(9, (0, common_1.Optional)()),
    __param(10, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [action_registry_service_1.ActionRegistryService,
        critic_service_1.CriticService,
        agent_state_service_1.AgentStateService,
        event_telemetry_service_1.EventTelemetryService,
        action_cache_service_1.ActionCacheService,
        action_dependency_analyzer_service_1.ActionDependencyAnalyzerService,
        llm_plan_service_1.LlmPlanService,
        tripnara_system_prompt_service_1.TripNaraSystemPromptService,
        agent_resume_service_1.AgentResumeService,
        telemetry_service_1.TelemetryService,
        audit_log_service_1.AuditLogService])
], OrchestratorService);
//# sourceMappingURL=orchestrator.service.js.map