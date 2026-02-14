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
var EnhancedVRPTWOptimizerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedVRPTWOptimizerService = void 0;
const common_1 = require("@nestjs/common");
const plan_request_interface_1 = require("../interfaces/plan-request.interface");
const robust_time_matrix_service_1 = require("./robust-time-matrix.service");
const explanation_service_1 = require("./explanation.service");
const data_expiry_policy_service_1 = require("./data-expiry-policy.service");
const conservative_strategy_service_1 = require("./conservative-strategy.service");
const metrics_aggregator_service_1 = require("./metrics-aggregator.service");
let EnhancedVRPTWOptimizerService = EnhancedVRPTWOptimizerService_1 = class EnhancedVRPTWOptimizerService {
    constructor(robustTimeMatrixService, explanationService, dataExpiryPolicyService, conservativeStrategyService, metricsAggregatorService) {
        this.robustTimeMatrixService = robustTimeMatrixService;
        this.explanationService = explanationService;
        this.dataExpiryPolicyService = dataExpiryPolicyService;
        this.conservativeStrategyService = conservativeStrategyService;
        this.metricsAggregatorService = metricsAggregatorService;
        this.logger = new common_1.Logger(EnhancedVRPTWOptimizerService_1.name);
    }
    async solve(request, options) {
        const startTime = Date.now();
        const requestId = (options === null || options === void 0 ? void 0 : options.request_id) || `req_${Date.now()}`;
        this.logger.debug(`开始求解单日规划：${request.nodes.length} 个节点, request_id=${requestId}`);
        try {
            if (options === null || options === void 0 ? void 0 : options.data_sources) {
                const dataQuality = await this.conservativeStrategyService.checkDataQuality(request, options.data_sources);
                const conservativeResult = await this.conservativeStrategyService.applyConservativeStrategy(request, dataQuality);
                if (conservativeResult.decision === 'REJECT') {
                    const solveTime = Date.now() - startTime;
                    this.recordExecution({
                        request_id: requestId,
                        timestamp: new Date().toISOString(),
                        status: 'REJECTED',
                        rejection_reason: conservativeResult.reason || 'DATA_QUALITY_ISSUE',
                        solve_time_ms: solveTime,
                        data_quality: {
                            missing: dataQuality.missing_data_list.map(m => m.type),
                            stale: dataQuality.stale_data_list.map(s => s.type),
                            low_reliability: dataQuality.stale_data_list
                                .filter(s => s.reliability === 'LOW')
                                .map(s => s.type),
                        },
                    });
                    return this.createInfeasibleResult(conservativeResult.explanation || '数据质量不符合要求', request, request.nodes);
                }
                if (conservativeResult.decision === 'ADJUST' && conservativeResult.constraints) {
                    request = this.applyConservativeConstraints(request, conservativeResult.constraints);
                    this.logger.debug(`应用保守策略约束: ${conservativeResult.strategy}`);
                }
                if (conservativeResult.warnings && conservativeResult.warnings.length > 0) {
                    this.logger.warn(`数据质量警告: ${conservativeResult.warnings.map(w => w.message).join('; ')}`);
                }
            }
            const adjustedRequest = this.applyPacingPreference(request);
            const { expandedNodes, virtualNodeMap } = this.expandMultiTimeWindows(adjustedRequest.nodes);
            const earlyDepartureCheck = this.checkEarlyDepartureConstraints(adjustedRequest, expandedNodes);
            if (!earlyDepartureCheck.feasible) {
                return this.createInfeasibleResult(earlyDepartureCheck.reason || '早起限制冲突', adjustedRequest, expandedNodes);
            }
            const transportPolicy = adjustedRequest.transport_policy
                ? {
                    ...adjustedRequest.transport_policy,
                    switch_cost_min: adjustedRequest.transport_policy.switch_cost_min
                        ? Object.fromEntries(Object.entries(adjustedRequest.transport_policy.switch_cost_min).filter(([_, v]) => v !== undefined))
                        : undefined,
                }
                : undefined;
            const timeMatrix = await this.robustTimeMatrixService.computeRobustTimeMatrix(expandedNodes, transportPolicy);
            const disjunctionGroups = this.buildDisjunctionGroups(expandedNodes);
            const solution = await this.solveWithHeuristic(adjustedRequest, expandedNodes, timeMatrix, disjunctionGroups);
            const result = this.postProcess(adjustedRequest, solution, expandedNodes, virtualNodeMap, timeMatrix);
            const solveTime = Date.now() - startTime;
            this.recordExecution({
                request_id: requestId,
                timestamp: new Date().toISOString(),
                status: result.status === 'INFEASIBLE' ? 'REJECTED' : 'SUCCESS',
                rejection_reason: result.status === 'INFEASIBLE' ? 'INFEASIBLE_SOLUTION' : undefined,
                optimization_result: result,
                solve_time_ms: solveTime,
                data_quality: (options === null || options === void 0 ? void 0 : options.data_sources) ? {
                    missing: [],
                    stale: [],
                    low_reliability: [],
                } : undefined,
            });
            return result;
        }
        catch (error) {
            const solveTime = Date.now() - startTime;
            this.recordExecution({
                request_id: requestId,
                timestamp: new Date().toISOString(),
                status: 'FAILED',
                solve_time_ms: solveTime,
            });
            this.logger.error(`求解失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    applyPacingPreference(request) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const pacing = request.pacing || 'normal';
        const pacingConfig = this.getPacingConfig(pacing);
        return {
            ...request,
            transport_policy: {
                ...request.transport_policy,
                buffer_factor: (_b = (_a = request.transport_policy) === null || _a === void 0 ? void 0 : _a.buffer_factor) !== null && _b !== void 0 ? _b : pacingConfig.buffer_factor,
                fixed_buffer_min: (_d = (_c = request.transport_policy) === null || _c === void 0 ? void 0 : _c.fixed_buffer_min) !== null && _d !== void 0 ? _d : pacingConfig.fixed_buffer,
            },
            objective_weights: {
                ...request.objective_weights,
                wait: (_f = (_e = request.objective_weights) === null || _e === void 0 ? void 0 : _e.wait) !== null && _f !== void 0 ? _f : pacingConfig.wait_weight,
                travel: (_h = (_g = request.objective_weights) === null || _g === void 0 ? void 0 : _g.travel) !== null && _h !== void 0 ? _h : 1.0,
            },
        };
    }
    getPacingConfig(pacing) {
        switch (pacing) {
            case 'relaxed':
                return {
                    buffer_factor: 1.3,
                    fixed_buffer: 20,
                    wait_weight: 1.8,
                    density_weight: 1.5,
                };
            case 'intense':
                return {
                    buffer_factor: 1.1,
                    fixed_buffer: 10,
                    wait_weight: 1.2,
                    density_weight: 0.7,
                };
            case 'normal':
            default:
                return {
                    buffer_factor: 1.2,
                    fixed_buffer: 15,
                    wait_weight: 1.5,
                    density_weight: 1.0,
                };
        }
    }
    checkEarlyDepartureConstraints(request, nodes) {
        var _a;
        const earliestFirstStop = (_a = request.lifestyle_policy) === null || _a === void 0 ? void 0 : _a.earliest_first_stop;
        if (!earliestFirstStop) {
            return { feasible: true };
        }
        const earliestDeparture = this.parseTimeToMinutes(earliestFirstStop);
        const hardNodes = nodes.filter((n) => { var _a; return (_a = n.constraints) === null || _a === void 0 ? void 0 : _a.is_hard_node; });
        for (const node of hardNodes) {
            if (node.time_windows && node.time_windows.length > 0) {
                const earliestWindow = node.time_windows
                    .map((w) => this.parseTimeToMinutes(w[0]))
                    .sort((a, b) => a - b)[0];
                if (earliestWindow < earliestDeparture) {
                    return {
                        feasible: false,
                        reason: `硬节点 ${node.name} 要求 ${this.minutesToTimeString(earliestWindow)} 前入场，但最早出发时间为 ${this.minutesToTimeString(earliestDeparture)}`,
                        conflictingNode: node,
                    };
                }
            }
        }
        return { feasible: true };
    }
    createInfeasibleResult(reason, request, nodes) {
        var _a, _b, _c, _d;
        const hardNodes = nodes.filter((n) => { var _a; return (_a = n.constraints) === null || _a === void 0 ? void 0 : _a.is_hard_node; });
        return {
            status: 'INFEASIBLE',
            summary: {
                total_travel_min: 0,
                total_wait_min: 0,
                total_service_min: 0,
                total_day_min: 0,
                dropped_count: nodes.length,
                robustness_score: 0,
            },
            route: [],
            dropped: hardNodes.map((node) => {
                var _a, _b;
                return ({
                    node_id: node.id,
                    name: node.name,
                    reason_code: plan_request_interface_1.DropReasonCode.EARLY_DEPARTURE_CONFLICT,
                    penalty: 0,
                    explanation: this.explanationService.generateDropExplanation(node, plan_request_interface_1.DropReasonCode.EARLY_DEPARTURE_CONFLICT, {
                        requiredDeparture: ((_a = node.time_windows) === null || _a === void 0 ? void 0 : _a[0])
                            ? this.parseTimeToMinutes(node.time_windows[0][0])
                            : undefined,
                        arrivalTime: ((_b = request.lifestyle_policy) === null || _b === void 0 ? void 0 : _b.earliest_first_stop)
                            ? this.parseTimeToMinutes(request.lifestyle_policy.earliest_first_stop)
                            : undefined,
                    }),
                });
            }),
            diagnostics: {
                assumptions: {
                    buffer_factor: (_b = (_a = request.transport_policy) === null || _a === void 0 ? void 0 : _a.buffer_factor) !== null && _b !== void 0 ? _b : 1.2,
                    fixed_buffer_min: (_d = (_c = request.transport_policy) === null || _c === void 0 ? void 0 : _c.fixed_buffer_min) !== null && _d !== void 0 ? _d : 15,
                },
            },
        };
    }
    expandMultiTimeWindows(nodes) {
        const expandedNodes = [];
        const virtualNodeMap = new Map();
        for (const node of nodes) {
            if (!node.time_windows || node.time_windows.length === 0) {
                expandedNodes.push(node);
                continue;
            }
            if (node.time_windows.length === 1) {
                expandedNodes.push(node);
                continue;
            }
            const virtualIds = [];
            for (let i = 0; i < node.time_windows.length; i++) {
                const virtualNode = {
                    ...node,
                    id: node.id * 1000 + i,
                    name: `${node.name} (窗口${i + 1})`,
                    time_windows: [node.time_windows[i]],
                    meta: {
                        ...node.meta,
                        origin_id: node.id,
                        disjunction_group_id: node.id,
                    },
                };
                expandedNodes.push(virtualNode);
                virtualIds.push(virtualNode.id);
            }
            virtualNodeMap.set(node.id, virtualIds);
        }
        return { expandedNodes, virtualNodeMap };
    }
    buildDisjunctionGroups(nodes) {
        var _a;
        const groups = new Map();
        for (const node of nodes) {
            const groupId = (_a = node.meta) === null || _a === void 0 ? void 0 : _a.disjunction_group_id;
            if (groupId !== undefined) {
                if (!groups.has(groupId)) {
                    groups.set(groupId, []);
                }
                groups.get(groupId).push(node.id);
            }
        }
        return groups;
    }
    async solveWithHeuristic(request, nodes, timeMatrix, disjunctionGroups) {
        const solution = await this.greedyConstructionWithDrops(request, nodes, timeMatrix, disjunctionGroups);
        return { ...solution, timeMatrix };
    }
    greedyConstructionWithDrops(request, nodes, timeMatrix, disjunctionGroups) {
        var _a, _b, _c, _d, _e, _f;
        const route = [];
        const dropped = [];
        const waitTimes = [];
        const arrivalTimes = [];
        const dayStart = this.parseTimeToMinutes(request.day_boundary.start);
        const dayEnd = this.parseTimeToMinutes(request.day_boundary.end);
        let currentTime = dayStart;
        const visited = new Set();
        const visitedGroups = new Set();
        const hardNodes = nodes.filter((n) => { var _a; return (_a = n.constraints) === null || _a === void 0 ? void 0 : _a.is_hard_node; });
        const softNodes = nodes.filter((n) => { var _a; return !((_a = n.constraints) === null || _a === void 0 ? void 0 : _a.is_hard_node); });
        for (const hardNode of hardNodes) {
            if (this.canVisitNode(hardNode, currentTime, dayEnd, timeMatrix, route, nodes)) {
                const result = this.visitNode(hardNode, currentTime, timeMatrix, route, nodes, arrivalTimes, waitTimes);
                currentTime = result.departureTime;
                visited.add(hardNode.id);
            }
            else {
                this.logger.warn(`硬节点 ${hardNode.name} 无法访问，求解不可行`);
                return {
                    route: [],
                    dropped: nodes.map((n) => n.id),
                    waitTimes: [],
                    arrivalTimes: [],
                };
            }
        }
        if ((_b = (_a = request.lifestyle_policy) === null || _a === void 0 ? void 0 : _a.lunch_break) === null || _b === void 0 ? void 0 : _b.enabled) {
            const lunchBreak = request.lifestyle_policy.lunch_break;
            const lunchWindowStart = this.parseTimeToMinutes(lunchBreak.window[0]);
            const lunchWindowEnd = this.parseTimeToMinutes(lunchBreak.window[1]);
            const lunchDuration = lunchBreak.duration_min;
            if (currentTime < lunchWindowEnd && currentTime + lunchDuration <= lunchWindowEnd) {
                const lunchStart = Math.max(currentTime, lunchWindowStart);
                const lunchEnd = lunchStart + lunchDuration;
                if (lunchEnd <= lunchWindowEnd) {
                    const lunchNode = {
                        id: -1,
                        name: '午餐时间',
                        type: 'break',
                        service_duration_min: lunchDuration,
                        time_windows: [[lunchBreak.window[0], lunchBreak.window[1]]],
                        geo: route.length > 0
                            ? (_d = (_c = nodes.find((n) => n.id === route[route.length - 1])) === null || _c === void 0 ? void 0 : _c.geo) !== null && _d !== void 0 ? _d : { lat: 0, lng: 0 }
                            : { lat: 0, lng: 0 },
                    };
                    const result = this.visitNode(lunchNode, lunchStart, timeMatrix, route, nodes, arrivalTimes, waitTimes);
                    currentTime = result.departureTime;
                }
            }
        }
        const remainingSoftNodes = softNodes.filter((n) => !visited.has(n.id));
        while (remainingSoftNodes.length > 0 && currentTime < dayEnd) {
            let bestNode = null;
            let bestScore = -Infinity;
            let bestArrivalTime = currentTime;
            for (const node of remainingSoftNodes) {
                const groupId = (_e = node.meta) === null || _e === void 0 ? void 0 : _e.disjunction_group_id;
                if (groupId !== undefined && visitedGroups.has(groupId)) {
                    continue;
                }
                if (!this.canVisitNode(node, currentTime, dayEnd, timeMatrix, route, nodes)) {
                    continue;
                }
                const travelTime = route.length > 0
                    ? timeMatrix.matrix[route[route.length - 1]][node.id]
                    : 0;
                const arrivalTime = currentTime + travelTime;
                const waitTime = this.calculateWaitTime(node, arrivalTime);
                const score = this.calculateNodeScore(node, arrivalTime, waitTime, travelTime, request);
                if (score > bestScore) {
                    bestNode = node;
                    bestScore = score;
                    bestArrivalTime = arrivalTime;
                }
            }
            if (bestNode) {
                const result = this.visitNode(bestNode, bestArrivalTime, timeMatrix, route, nodes, arrivalTimes, waitTimes);
                currentTime = result.departureTime;
                visited.add(bestNode.id);
                const groupId = (_f = bestNode.meta) === null || _f === void 0 ? void 0 : _f.disjunction_group_id;
                if (groupId !== undefined) {
                    visitedGroups.add(groupId);
                }
                const index = remainingSoftNodes.indexOf(bestNode);
                if (index > -1) {
                    remainingSoftNodes.splice(index, 1);
                }
            }
            else {
                break;
            }
        }
        for (const node of remainingSoftNodes) {
            dropped.push(node.id);
        }
        return {
            route,
            dropped,
            waitTimes,
            arrivalTimes,
        };
    }
    canVisitNode(node, currentTime, dayEnd, timeMatrix, route, nodes) {
        var _a;
        const travelTime = route.length > 0
            ? timeMatrix.matrix[route[route.length - 1]][node.id]
            : 0;
        const arrivalTime = currentTime + travelTime;
        if (node.time_windows && node.time_windows.length > 0) {
            const window = node.time_windows[0];
            const windowStart = this.parseTimeToMinutes(window[0]);
            const windowEnd = this.parseTimeToMinutes(window[1]);
            if (arrivalTime > windowEnd) {
                return false;
            }
        }
        const serviceTime = node.service_duration_min;
        const departureTime = Math.max(arrivalTime, ((_a = node.time_windows) === null || _a === void 0 ? void 0 : _a[0]) ? this.parseTimeToMinutes(node.time_windows[0][0]) : arrivalTime) + serviceTime;
        if (departureTime > dayEnd) {
            return false;
        }
        return true;
    }
    visitNode(node, arrivalTime, timeMatrix, route, nodes, arrivalTimes, waitTimes) {
        route.push(node.id);
        arrivalTimes.push(arrivalTime);
        const waitTime = this.calculateWaitTime(node, arrivalTime);
        waitTimes.push(waitTime);
        const actualStartTime = arrivalTime + waitTime;
        const departureTime = actualStartTime + node.service_duration_min;
        return { departureTime };
    }
    calculateArrivalTime(node, currentTime, timeMatrix, route, nodes) {
        const travelTime = route.length > 0
            ? timeMatrix.matrix[route[route.length - 1]][node.id]
            : 0;
        return currentTime + travelTime;
    }
    calculateWaitTime(node, arrivalTime) {
        if (!node.time_windows || node.time_windows.length === 0) {
            return 0;
        }
        const windowStart = this.parseTimeToMinutes(node.time_windows[0][0]);
        if (arrivalTime < windowStart) {
            return windowStart - arrivalTime;
        }
        return 0;
    }
    calculateNodeScore(node, arrivalTime, waitTime, travelTime, request) {
        var _a, _b, _c, _d, _e;
        const weights = request.objective_weights || {};
        const travelWeight = (_a = weights.travel) !== null && _a !== void 0 ? _a : 1.0;
        const waitWeight = (_b = weights.wait) !== null && _b !== void 0 ? _b : 1.5;
        const rewardWeight = (_c = weights.reward) !== null && _c !== void 0 ? _c : 1.0;
        const reward = (_e = (_d = node.constraints) === null || _d === void 0 ? void 0 : _d.reward) !== null && _e !== void 0 ? _e : 0;
        const penalty = travelTime * travelWeight + waitTime * waitWeight;
        return reward * rewardWeight - penalty;
    }
    parseTimeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }
    postProcess(request, solution, expandedNodes, virtualNodeMap, timeMatrix) {
        var _a, _b, _c, _d;
        const nodeMap = new Map(expandedNodes.map((n) => [n.id, n]));
        const dayStart = this.parseTimeToMinutes(request.day_boundary.start);
        const dayEnd = this.parseTimeToMinutes(request.day_boundary.end);
        const routeNodes = [];
        let totalTravel = 0;
        let totalWait = 0;
        let totalService = 0;
        for (let i = 0; i < solution.route.length; i++) {
            const nodeId = solution.route[i];
            const node = nodeMap.get(nodeId);
            if (!node)
                continue;
            const arrivalTime = solution.arrivalTimes[i];
            const waitTime = solution.waitTimes[i];
            const serviceTime = node.service_duration_min;
            const startService = arrivalTime + waitTime;
            const endService = startService + serviceTime;
            const travelTime = i > 0
                ? this.calculateTravelTimeBetweenNodes(solution.route[i - 1], nodeId, expandedNodes, request, timeMatrix)
                : 0;
            totalTravel += travelTime;
            totalWait += waitTime;
            totalService += serviceTime;
            const originId = (_b = (_a = node.meta) === null || _a === void 0 ? void 0 : _a.origin_id) !== null && _b !== void 0 ? _b : node.id;
            routeNodes.push({
                seq: i + 1,
                node_id: nodeId,
                origin_id: originId !== nodeId ? originId : undefined,
                name: node.name,
                arrival: this.minutesToTimeString(arrivalTime),
                start_service: this.minutesToTimeString(startService),
                end_service: this.minutesToTimeString(endService),
                wait_min: waitTime,
                travel_min_from_prev: travelTime,
            });
        }
        const droppedNodes = [];
        for (const droppedId of solution.dropped) {
            const node = nodeMap.get(droppedId);
            if (!node)
                continue;
            const reasonCode = this.determineDropReasonCode(node, solution, request, expandedNodes, timeMatrix);
            const penalty = this.calculateDropPenalty(node);
            const context = this.buildDropContext(node, solution, request, expandedNodes, timeMatrix);
            const explanation = this.explanationService.generateDropExplanation(node, reasonCode, context);
            droppedNodes.push({
                node_id: (_d = (_c = node.meta) === null || _c === void 0 ? void 0 : _c.origin_id) !== null && _d !== void 0 ? _d : node.id,
                name: node.name,
                reason_code: reasonCode,
                reason: reasonCode,
                penalty,
                explanation,
            });
        }
        const totalDay = totalTravel + totalWait + totalService;
        const robustnessScore = this.calculateRobustnessScore(routeNodes, request, dayEnd);
        const timeline = this.generateTimeline(routeNodes, request, solution);
        const diagnostics = this.generateDiagnostics(routeNodes, request, expandedNodes, nodeMap);
        const robustness = this.generateRobustnessMetadata(routeNodes, request, timeMatrix, dayEnd);
        const hardNodes = expandedNodes.filter((n) => { var _a; return (_a = n.constraints) === null || _a === void 0 ? void 0 : _a.is_hard_node; });
        const allHardNodesVisited = hardNodes.every((n) => solution.route.includes(n.id));
        const status = !allHardNodesVisited
            ? 'INFEASIBLE'
            : solution.route.length > 0
                ? 'FEASIBLE'
                : 'INFEASIBLE';
        return {
            status,
            summary: {
                total_travel_min: totalTravel,
                total_wait_min: totalWait,
                total_service_min: totalService,
                total_day_min: totalDay,
                dropped_count: droppedNodes.length,
                robustness_score: robustnessScore,
            },
            route: routeNodes,
            dropped: droppedNodes,
            timeline,
            diagnostics,
            robustness,
        };
    }
    generateTimeline(routeNodes, request, solution) {
        var _a;
        const events = [];
        const dayStart = this.parseTimeToMinutes(request.day_boundary.start);
        for (let i = 0; i < routeNodes.length; i++) {
            const node = routeNodes[i];
            const arrivalMinutes = this.parseTimeToMinutes(node.arrival);
            const startServiceMinutes = this.parseTimeToMinutes(node.start_service);
            const endServiceMinutes = this.parseTimeToMinutes(node.end_service);
            events.push({
                type: 'NODE',
                start: node.arrival,
                end: node.end_service,
                duration_min: endServiceMinutes - arrivalMinutes,
                description: node.name,
                node_id: node.node_id,
            });
            if (node.wait_min > 15) {
                events.push({
                    type: 'WAIT',
                    start: node.arrival,
                    end: node.start_service,
                    duration_min: node.wait_min,
                    description: `等待 ${node.wait_min} 分钟`,
                    node_id: node.node_id,
                });
            }
            if (i < routeNodes.length - 1) {
                const nextNode = routeNodes[i + 1];
                events.push({
                    type: 'TRAVEL',
                    start: node.end_service,
                    end: nextNode.arrival,
                    duration_min: node.travel_min_from_prev,
                    description: `前往 ${nextNode.name}`,
                });
            }
        }
        const lunchBreak = (_a = request.lifestyle_policy) === null || _a === void 0 ? void 0 : _a.lunch_break;
        if (lunchBreak === null || lunchBreak === void 0 ? void 0 : lunchBreak.enabled) {
            const lunchWindowStart = this.parseTimeToMinutes(lunchBreak.window[0]);
            const lunchWindowEnd = this.parseTimeToMinutes(lunchBreak.window[1]);
            for (const event of events) {
                if (event.type === 'NODE' && event.description === '午餐时间') {
                    events.push({
                        type: 'LUNCH',
                        start: event.start,
                        end: event.end,
                        duration_min: event.duration_min,
                        description: '午餐时间',
                    });
                    break;
                }
            }
        }
        return events.sort((a, b) => this.parseTimeToMinutes(a.start) - this.parseTimeToMinutes(b.start));
    }
    generateRobustnessMetadata(routeNodes, request, timeMatrix, dayEnd) {
        var _a, _b, _c, _d;
        const bufferFactor = (_b = (_a = request.transport_policy) === null || _a === void 0 ? void 0 : _a.buffer_factor) !== null && _b !== void 0 ? _b : 1.2;
        const fixedBuffer = (_d = (_c = request.transport_policy) === null || _c === void 0 ? void 0 : _c.fixed_buffer_min) !== null && _d !== void 0 ? _d : 15;
        let totalBuffer = 0;
        for (let i = 0; i < routeNodes.length - 1; i++) {
            const travelTime = routeNodes[i].travel_min_from_prev;
            const apiTime = travelTime / bufferFactor;
            const buffer = travelTime - apiTime + fixedBuffer;
            totalBuffer += buffer;
        }
        const totalWait = routeNodes.reduce((sum, node) => sum + node.wait_min, 0);
        const slackNodes = routeNodes.map((node) => {
            const endService = this.parseTimeToMinutes(node.end_service);
            const slack = dayEnd - endService;
            return {
                node_id: node.node_id,
                slack_min: slack,
            };
        }).sort((a, b) => a.slack_min - b.slack_min).slice(0, 3);
        const avgSlack = slackNodes.length > 0
            ? slackNodes.reduce((sum, n) => sum + n.slack_min, 0) / slackNodes.length
            : Infinity;
        const riskLevel = avgSlack < 30 ? 'high' :
            avgSlack < 60 ? 'medium' :
                'low';
        return {
            total_buffer_minutes: Math.round(totalBuffer),
            total_wait_minutes: totalWait,
            top3_min_slack_nodes: slackNodes,
            risk_level: riskLevel,
        };
    }
    calculateTravelTimeBetweenNodes(fromId, toId, nodes, request, timeMatrix) {
        if (timeMatrix) {
            const fromIndex = nodes.findIndex((n) => n.id === fromId);
            const toIndex = nodes.findIndex((n) => n.id === toId);
            if (fromIndex >= 0 && toIndex >= 0) {
                return timeMatrix.matrix[fromIndex][toIndex];
            }
        }
        const fromNode = nodes.find((n) => n.id === fromId);
        const toNode = nodes.find((n) => n.id === toId);
        if (!fromNode || !toNode) {
            return 0;
        }
        const distance = this.calculateDistance(fromNode.geo, toNode.geo);
        return Math.round((distance / 1000 / 30) * 60);
    }
    calculateDistance(point1, point2) {
        const R = 6371000;
        const dLat = this.toRadians(point2.lat - point1.lat);
        const dLng = this.toRadians(point2.lng - point1.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(point1.lat)) *
                Math.cos(this.toRadians(point2.lat)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    determineDropReasonCode(node, solution, request, nodes, timeMatrix) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        if (node.time_windows && node.time_windows.length > 0) {
            const dayEnd = this.parseTimeToMinutes(request.day_boundary.end);
            const lastArrival = solution.arrivalTimes[solution.arrivalTimes.length - 1] || 0;
            const travelTime = solution.route.length > 0
                ? 30
                : 0;
            const arrivalTime = lastArrival + travelTime;
            const windowEnd = this.parseTimeToMinutes(node.time_windows[0][1]);
            if (arrivalTime > windowEnd || arrivalTime + node.service_duration_min > dayEnd) {
                return plan_request_interface_1.DropReasonCode.TIME_WINDOW_CONFLICT;
            }
        }
        if (solution.route.length > 0) {
            const lastNodeId = solution.route[solution.route.length - 1];
            const lastNodeIndex = nodes.findIndex((n) => n.id === lastNodeId);
            const nodeIndex = nodes.findIndex((n) => n.id === node.id);
            if (lastNodeIndex >= 0 && nodeIndex >= 0) {
                const idealTime = (_d = (_c = (_b = (_a = timeMatrix.components) === null || _a === void 0 ? void 0 : _a.api) === null || _b === void 0 ? void 0 : _b[lastNodeIndex]) === null || _c === void 0 ? void 0 : _c[nodeIndex]) !== null && _d !== void 0 ? _d : 0;
                const robustTime = timeMatrix.matrix[lastNodeIndex][nodeIndex];
                if (idealTime < robustTime && idealTime > 0) {
                    return plan_request_interface_1.DropReasonCode.ROBUST_TIME_INFEASIBLE;
                }
            }
        }
        const hardNodes = nodes.filter((n) => { var _a; return (_a = n.constraints) === null || _a === void 0 ? void 0 : _a.is_hard_node; });
        if (hardNodes.length > 0 && !((_e = node.constraints) === null || _e === void 0 ? void 0 : _e.is_hard_node)) {
            return plan_request_interface_1.DropReasonCode.HARD_NODE_PROTECTION;
        }
        if (node.time_windows && node.time_windows.length > 0) {
            const windowStart = this.parseTimeToMinutes(node.time_windows[0][0]);
            const lastArrival = solution.arrivalTimes[solution.arrivalTimes.length - 1] || 0;
            const travelTime = solution.route.length > 0
                ? ((_j = (_h = (_g = (_f = timeMatrix.components) === null || _f === void 0 ? void 0 : _f.api) === null || _g === void 0 ? void 0 : _g[solution.route.length - 1]) === null || _h === void 0 ? void 0 : _h[nodes.findIndex((n) => n.id === node.id)]) !== null && _j !== void 0 ? _j : 30)
                : 0;
            const arrivalTime = lastArrival + travelTime;
            const waitTime = Math.max(0, windowStart - arrivalTime);
            if (waitTime > 15) {
                return plan_request_interface_1.DropReasonCode.HIGH_WAIT_TIME;
            }
        }
        const priority = (_l = (_k = node.constraints) === null || _k === void 0 ? void 0 : _k.priority_level) !== null && _l !== void 0 ? _l : 5;
        if (priority >= 4) {
            return plan_request_interface_1.DropReasonCode.LOW_PRIORITY_NOT_WORTH;
        }
        return plan_request_interface_1.DropReasonCode.INSUFFICIENT_TOTAL_TIME;
    }
    buildDropContext(node, solution, request, nodes, timeMatrix) {
        var _a, _b, _c, _d;
        const dayEnd = this.parseTimeToMinutes(request.day_boundary.end);
        const lastArrival = solution.arrivalTimes[solution.arrivalTimes.length - 1] || 0;
        const lastNodeId = solution.route.length > 0 ? solution.route[solution.route.length - 1] : undefined;
        const lastNodeIndex = lastNodeId !== undefined ? nodes.findIndex((n) => n.id === lastNodeId) : -1;
        const nodeIndex = nodes.findIndex((n) => n.id === node.id);
        const travelTime = lastNodeIndex >= 0 && nodeIndex >= 0
            ? timeMatrix.matrix[lastNodeIndex][nodeIndex]
            : 30;
        const arrivalTime = lastArrival + travelTime;
        const context = {
            arrivalTime,
            dayEnd,
        };
        if (node.time_windows && node.time_windows.length > 0) {
            const windowEnd = this.parseTimeToMinutes(node.time_windows[0][1]);
            context.closeTime = windowEnd;
            const windowStart = this.parseTimeToMinutes(node.time_windows[0][0]);
            const waitTime = Math.max(0, windowStart - arrivalTime);
            if (waitTime > 0) {
                context.waitMinutes = waitTime;
            }
        }
        const hardNodes = nodes.filter((n) => { var _a; return (_a = n.constraints) === null || _a === void 0 ? void 0 : _a.is_hard_node; });
        if (hardNodes.length > 0) {
            context.hardNodeCount = hardNodes.length;
        }
        if (lastNodeIndex >= 0 && nodeIndex >= 0) {
            const idealTime = (_d = (_c = (_b = (_a = timeMatrix.components) === null || _a === void 0 ? void 0 : _a.api) === null || _b === void 0 ? void 0 : _b[lastNodeIndex]) === null || _c === void 0 ? void 0 : _c[nodeIndex]) !== null && _d !== void 0 ? _d : 0;
            const robustTime = timeMatrix.matrix[lastNodeIndex][nodeIndex];
            if (idealTime < robustTime && idealTime > 0) {
                context.robustTimeInfeasible = true;
            }
        }
        return context;
    }
    calculateDropPenalty(node) {
        var _a, _b, _c;
        if (((_a = node.constraints) === null || _a === void 0 ? void 0 : _a.drop_penalty) !== undefined) {
            return node.constraints.drop_penalty;
        }
        const priority = (_c = (_b = node.constraints) === null || _b === void 0 ? void 0 : _b.priority_level) !== null && _c !== void 0 ? _c : 5;
        const basePenalty = 1000;
        return basePenalty * (6 - priority);
    }
    calculateRobustnessScore(routeNodes, request, dayEnd) {
        if (routeNodes.length === 0) {
            return 0;
        }
        let totalSlack = 0;
        let criticalCount = 0;
        for (const node of routeNodes) {
            const endService = this.parseTimeToMinutes(node.end_service);
            const slack = dayEnd - endService;
            totalSlack += Math.max(0, slack);
            if (slack < 30) {
                criticalCount++;
            }
        }
        const criticalRatio = criticalCount / routeNodes.length;
        const avgSlack = totalSlack / routeNodes.length;
        const slackRatio = Math.min(1, avgSlack / 60);
        return Math.max(0, Math.min(1, 1 - criticalRatio * 0.5 - (1 - slackRatio) * 0.3));
    }
    generateDiagnostics(routeNodes, request, nodes, nodeMap) {
        var _a, _b, _c, _d, _e;
        const criticalWindows = [];
        const dayEnd = this.parseTimeToMinutes(request.day_boundary.end);
        for (const routeNode of routeNodes) {
            const node = nodeMap.get(routeNode.node_id);
            if (!node || !node.time_windows || node.time_windows.length === 0) {
                continue;
            }
            const windowEnd = this.parseTimeToMinutes(node.time_windows[0][1]);
            const endService = this.parseTimeToMinutes(routeNode.end_service);
            const slack = windowEnd - endService;
            if (slack < 30) {
                criticalWindows.push({
                    node_id: (_a = routeNode.origin_id) !== null && _a !== void 0 ? _a : routeNode.node_id,
                    slack_to_close_min: slack,
                });
            }
        }
        return {
            critical_windows: criticalWindows.length > 0 ? criticalWindows : undefined,
            assumptions: {
                buffer_factor: (_c = (_b = request.transport_policy) === null || _b === void 0 ? void 0 : _b.buffer_factor) !== null && _c !== void 0 ? _c : 1.2,
                fixed_buffer_min: (_e = (_d = request.transport_policy) === null || _d === void 0 ? void 0 : _d.fixed_buffer_min) !== null && _e !== void 0 ? _e : 15,
            },
        };
    }
    minutesToTimeString(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }
    applyConservativeConstraints(request, constraints) {
        var _a, _b;
        const modified = { ...request };
        if (constraints.safety_buffer_multiplier) {
            modified.transport_policy = {
                ...modified.transport_policy,
                buffer_factor: (((_a = modified.transport_policy) === null || _a === void 0 ? void 0 : _a.buffer_factor) || 1.2) * constraints.safety_buffer_multiplier,
                fixed_buffer_min: Math.round((((_b = modified.transport_policy) === null || _b === void 0 ? void 0 : _b.fixed_buffer_min) || 15) * constraints.safety_buffer_multiplier),
            };
        }
        if (constraints.avoid_segments && constraints.avoid_segments.length > 0) {
            const avoidNodeIds = new Set(constraints.avoid_segments
                .map(seg => seg.split('-').map(Number))
                .flat());
            modified.nodes = modified.nodes.filter(node => { var _a; return !avoidNodeIds.has(node.id) || ((_a = node.constraints) === null || _a === void 0 ? void 0 : _a.is_hard_node); });
            this.logger.debug(`保守策略：避开 ${avoidNodeIds.size} 个节点`);
        }
        return modified;
    }
    recordExecution(record) {
        try {
            this.metricsAggregatorService.recordExecution(record);
        }
        catch (error) {
            this.logger.warn(`记录执行结果失败: ${error.message}`);
        }
    }
};
exports.EnhancedVRPTWOptimizerService = EnhancedVRPTWOptimizerService;
exports.EnhancedVRPTWOptimizerService = EnhancedVRPTWOptimizerService = EnhancedVRPTWOptimizerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [robust_time_matrix_service_1.RobustTimeMatrixService,
        explanation_service_1.ExplanationService,
        data_expiry_policy_service_1.DataExpiryPolicyService,
        conservative_strategy_service_1.ConservativeStrategyService,
        metrics_aggregator_service_1.MetricsAggregatorService])
], EnhancedVRPTWOptimizerService);
//# sourceMappingURL=enhanced-vrptw-optimizer.service.js.map