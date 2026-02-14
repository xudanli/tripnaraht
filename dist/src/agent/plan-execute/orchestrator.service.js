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
var DAGOrchestratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAGOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const planner_service_1 = require("./planner.service");
const replanner_service_1 = require("./replanner.service");
const executor_service_1 = require("./executor.service");
const context_assembler_service_1 = require("./context-assembler.service");
const agent_state_service_1 = require("../services/agent-state.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const llm_service_1 = require("../../llm/services/llm.service");
const trajectory_collection_service_1 = require("../training/services/trajectory-collection.service");
const rl_integration_service_1 = require("../training/services/rl-integration.service");
let DAGOrchestratorService = DAGOrchestratorService_1 = class DAGOrchestratorService {
    constructor(planner, replanner, executor, contextAssembler, agentStateService, llmService, trajectoryCollection, rlIntegration) {
        this.planner = planner;
        this.replanner = replanner;
        this.executor = executor;
        this.contextAssembler = contextAssembler;
        this.agentStateService = agentStateService;
        this.llmService = llmService;
        this.trajectoryCollection = trajectoryCollection;
        this.rlIntegration = rlIntegration;
        this.logger = new common_1.Logger(DAGOrchestratorService_1.name);
        this.executionContext = {};
        this.maxSteps = 50;
        this.maxIterations = 100;
        this.maxReplanAttempts = 5;
    }
    async run(threadId, userGoal, executionContext) {
        var _a, _b, _c;
        this.logger.log(`[DAG] 开始 DAG 编排: threadId=${threadId}, goal=${userGoal.substring(0, 50)}...`);
        try {
            const context = await this.contextAssembler.getSummary(threadId, userGoal);
            const contextSummary = context.currentState || '初始状态';
            this.executionContext = executionContext || {};
            const llmProvider = this.getLlmProvider(threadId);
            let tasks = await this.planner.generateDAGPlan(userGoal, contextSummary, llmProvider);
            const memory = {};
            let iteration = 0;
            let totalStepsExecuted = 0;
            let consecutiveReplanAttempts = 0;
            this.logger.log(`[DAG] Plan generated with ${tasks.length} tasks.`);
            while (true && iteration < this.maxIterations) {
                iteration++;
                const allCompleted = tasks.every(t => t.status === 'completed');
                if (allCompleted) {
                    this.logger.log('[DAG] ✅ All tasks completed');
                    break;
                }
                const anyFailed = tasks.some(t => t.status === 'failed');
                if (anyFailed) {
                    if (consecutiveReplanAttempts >= this.maxReplanAttempts) {
                        this.logger.error(`[DAG] ❌ 连续重规划次数已达上限 (${this.maxReplanAttempts})，停止重规划`);
                        return {
                            status: 'failed',
                            plan: tasks,
                            memory,
                            error: `连续重规划 ${this.maxReplanAttempts} 次后仍无法恢复，可能存在根本性问题`,
                        };
                    }
                    consecutiveReplanAttempts++;
                    this.logger.warn(`[DAG] ⚠️ Some tasks failed, triggering replanner (attempt ${consecutiveReplanAttempts}/${this.maxReplanAttempts})`);
                    const replanResult = await this.replanner.replan(userGoal, tasks, memory, llmProvider);
                    if (replanResult.hasUpdates) {
                        this.logger.log('[DAG] 🔄 Plan updated by Replanner');
                        tasks = replanResult.newPlan;
                        tasks.forEach(t => {
                            if (t.status === 'failed') {
                                t.status = 'pending';
                            }
                        });
                        continue;
                    }
                    else {
                        this.logger.error(`[DAG] ❌ 重规划未产生更新，停止重规划`);
                        return {
                            status: 'failed',
                            plan: tasks,
                            memory,
                            error: '存在失败步骤且无法通过重规划恢复',
                        };
                    }
                }
                const runnableTasks = this.findRunnableTasks(tasks);
                const hasPending = tasks.some(t => t.status === 'pending');
                if (runnableTasks.length === 0 && hasPending) {
                    const deadlockInfo = this.detectDeadlock(tasks);
                    this.logger.error(`[DAG] ⚠️ Deadlock detected: ${deadlockInfo.reason}`);
                    this.logger.error(`Remaining pending tasks: ${tasks.filter(t => t.status === 'pending').map(t => t.id).join(', ')}`);
                    const replanResult = await this.replanner.replan(userGoal, tasks, memory, llmProvider);
                    if (replanResult.hasUpdates) {
                        this.logger.log('[DAG] 🔄 Replanner attempted to resolve deadlock');
                        tasks = replanResult.newPlan;
                        continue;
                    }
                    return {
                        status: 'deadlock',
                        plan: tasks,
                        memory,
                        error: `死锁检测: ${deadlockInfo.reason}`,
                    };
                }
                if (runnableTasks.length === 0) {
                    break;
                }
                totalStepsExecuted += runnableTasks.length;
                if (totalStepsExecuted > this.maxSteps) {
                    this.logger.warn(`[DAG] ⚠️ Max steps limit reached: ${this.maxSteps}`);
                    return {
                        status: 'timeout',
                        plan: tasks,
                        memory,
                        error: `达到最大步骤数限制: ${this.maxSteps}`,
                    };
                }
                runnableTasks.forEach(t => {
                    t.status = 'in_progress';
                    t.startedAt = new Date();
                });
                this.logger.log(`[DAG] 🚀 Parallel Batch ${iteration}: ${runnableTasks.map(t => t.id).join(', ')}`);
                const batchResults = await Promise.allSettled(runnableTasks.map(task => this.executeTaskWrapper(task, memory, contextSummary)));
                let batchHasFailures = false;
                let shouldReplan = false;
                batchResults.forEach((outcome, index) => {
                    const task = runnableTasks[index];
                    if (outcome.status === 'fulfilled') {
                        const execResult = outcome.value;
                        if (execResult.success) {
                            task.status = 'completed';
                            task.result = execResult.summary;
                            task.outputData = execResult.fullData;
                            task.completedAt = new Date();
                            memory[task.id] = execResult.fullData;
                            consecutiveReplanAttempts = 0;
                            if (execResult.shouldReplan) {
                                shouldReplan = true;
                            }
                        }
                        else {
                            task.status = 'failed';
                            task.error = execResult.error || execResult.summary;
                            task.completedAt = new Date();
                            batchHasFailures = true;
                        }
                    }
                    else {
                        const error = outcome.reason;
                        this.logger.error(`[DAG] Task ${task.id} failed:`, error);
                        task.status = 'failed';
                        task.error = (error === null || error === void 0 ? void 0 : error.message) || String(error);
                        task.completedAt = new Date();
                        batchHasFailures = true;
                    }
                });
                if (batchHasFailures || shouldReplan) {
                    this.logger.log('[DAG] 🔄 Triggering replanner');
                    const replanResult = await this.replanner.replan(userGoal, tasks, memory, llmProvider);
                    if (replanResult.hasUpdates) {
                        this.logger.log(`[DAG] Plan updated: +${((_a = replanResult.changes) === null || _a === void 0 ? void 0 : _a.added) || 0}, ` +
                            `-${((_b = replanResult.changes) === null || _b === void 0 ? void 0 : _b.removed) || 0}, ` +
                            `~${((_c = replanResult.changes) === null || _c === void 0 ? void 0 : _c.modified) || 0}`);
                        tasks = replanResult.newPlan;
                    }
                }
            }
            const summary = this.generateFinalSummary(tasks, memory);
            if (this.trajectoryCollection && this.executionContext.requestId) {
                try {
                    const trajectoryResult = await this.trajectoryCollection.findTrajectoryByRequestId(this.executionContext.requestId);
                    if (trajectoryResult.trajectoryId) {
                        const executionResult = {
                            success: true,
                            metadata: {
                                status: 'done',
                                completedTasks: tasks.filter(t => t.status === 'completed').length,
                                totalTasks: tasks.length,
                                summary,
                            },
                        };
                        await this.trajectoryCollection.updateTrajectoryWithExecution(trajectoryResult.trajectoryId, executionResult);
                        this.logger.debug(`轨迹执行结果已更新: trajectoryId=${trajectoryResult.trajectoryId}, success=true`);
                    }
                }
                catch (error) {
                    this.logger.warn(`更新轨迹执行结果失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                }
            }
            return {
                status: 'done',
                plan: tasks,
                memory,
                summary,
            };
        }
        catch (error) {
            this.logger.error(`[DAG] 编排失败: ${error.message}`, error.stack);
            if (this.trajectoryCollection && this.executionContext.requestId) {
                try {
                    const trajectoryResult = await this.trajectoryCollection.findTrajectoryByRequestId(this.executionContext.requestId);
                    if (trajectoryResult.trajectoryId) {
                        const executionResult = {
                            success: false,
                            error: error.message,
                            metadata: {
                                status: 'failed',
                            },
                        };
                        await this.trajectoryCollection.updateTrajectoryWithExecution(trajectoryResult.trajectoryId, executionResult);
                        this.logger.debug(`轨迹执行结果已更新: trajectoryId=${trajectoryResult.trajectoryId}, success=false`);
                    }
                }
                catch (trajError) {
                    this.logger.warn(`更新轨迹执行结果失败: ${trajError === null || trajError === void 0 ? void 0 : trajError.message}`);
                }
            }
            return {
                status: 'failed',
                plan: [],
                memory: {},
                error: error.message,
            };
        }
    }
    findRunnableTasks(tasks) {
        return tasks.filter(task => {
            if (task.status !== 'pending') {
                return false;
            }
            const depsMet = task.dependencies.every(depId => {
                const depTask = tasks.find(t => t.id === depId);
                return depTask && depTask.status === 'completed';
            });
            return depsMet;
        });
    }
    async executeTaskWrapper(task, memory, globalContext) {
        var _a, _b;
        const startTime = Date.now();
        const requestId = this.executionContext.requestId || task.id;
        if ((_a = this.rlIntegration) === null || _a === void 0 ? void 0 : _a.isEnabled()) {
            try {
                const preDecision = await this.rlIntegration.preDecision({
                    requestId,
                    tripId: this.executionContext.tripId || undefined,
                    userRequest: task.description,
                    action: task.toolCategory || task.id,
                    params: {},
                    state: memory,
                });
                if (!preDecision.allowed) {
                    this.logger.warn(`[DAG] RL预检查拒绝任务: task=${task.id}, action=${preDecision.action}, reason=${preDecision.reasoning}`);
                    return {
                        success: false,
                        error: `RL pre-check rejected: ${preDecision.reasoning}`,
                        rl_action: preDecision.action,
                        rl_confidence: preDecision.confidence,
                    };
                }
                if (preDecision.warnings && preDecision.warnings.length > 0) {
                    this.logger.warn(`[DAG] RL预检查警告: ${preDecision.warnings.join(', ')}`);
                }
            }
            catch (error) {
                this.logger.warn(`[DAG] RL预检查失败，继续执行: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        const resolvedDescription = this.resolveVariableReferences(task.description, memory, task.dependencies);
        const dependencyContext = this.buildDependencyContext(task.dependencies, memory);
        const enrichedContext = `${globalContext}\n\nDependency Results:\n${dependencyContext}`;
        const enrichedTask = {
            ...task,
            description: resolvedDescription,
        };
        const result = await this.executor.executeStep(enrichedTask, memory, {
            context: enrichedContext,
            globalContext: globalContext,
            tripId: this.executionContext.tripId,
            userId: this.executionContext.userId,
            requestId: this.executionContext.requestId,
            trip: this.executionContext.tripId ? { trip_id: this.executionContext.tripId } : undefined,
        });
        if ((_b = this.rlIntegration) === null || _b === void 0 ? void 0 : _b.isEnabled()) {
            try {
                const duration_ms = Date.now() - startTime;
                await this.rlIntegration.postDecision({
                    requestId,
                    tripId: this.executionContext.tripId || undefined,
                    action: task.toolCategory || task.id,
                    params: {},
                    result,
                    success: !(result === null || result === void 0 ? void 0 : result.error),
                    duration_ms,
                    state: memory,
                });
            }
            catch (error) {
                this.logger.warn(`[DAG] RL后置处理失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        return result;
    }
    resolveVariableReferences(description, memory, dependencies) {
        let resolved = description;
        const variablePattern = /\$\{([^}]+)\}/g;
        const matches = description.matchAll(variablePattern);
        for (const match of matches) {
            const fullMatch = match[0];
            const variablePath = match[1];
            const pathParts = variablePath.split('.');
            if (pathParts.length < 2) {
                this.logger.warn(`[DAG] 无效的变量引用格式: ${fullMatch}`);
                continue;
            }
            const taskId = pathParts[0];
            const fieldPath = pathParts.slice(1).join('.');
            if (!dependencies.includes(taskId)) {
                this.logger.warn(`[DAG] 变量引用 ${fullMatch} 引用了非依赖任务 ${taskId}`);
                continue;
            }
            const taskData = memory[taskId];
            if (!taskData) {
                this.logger.warn(`[DAG] 任务 ${taskId} 的数据不存在于 memory`);
                continue;
            }
            const value = this.getNestedValue(taskData, fieldPath);
            if (value !== undefined && value !== null) {
                resolved = resolved.replace(fullMatch, String(value));
            }
            else {
                this.logger.warn(`[DAG] 无法解析变量: ${fullMatch} (字段路径: ${fieldPath})`);
            }
        }
        return resolved;
    }
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && typeof current === 'object' ? current[key] : undefined;
        }, obj);
    }
    buildDependencyContext(dependencies, memory) {
        if (dependencies.length === 0) {
            return 'No dependencies.';
        }
        return dependencies
            .map(depId => {
            const depData = memory[depId];
            if (!depData) {
                return `Task ${depId}: (no data)`;
            }
            const summary = this.summarizeData(depData);
            return `Task ${depId}:\n${summary}`;
        })
            .join('\n\n');
    }
    summarizeData(data) {
        if (typeof data === 'string') {
            return data;
        }
        if (typeof data === 'object' && data !== null) {
            if (data.summary) {
                return data.summary;
            }
            if (data.message) {
                return data.message;
            }
            const keys = Object.keys(data);
            if (keys.length > 5) {
                const limited = keys.slice(0, 5).reduce((acc, key) => {
                    acc[key] = data[key];
                    return acc;
                }, {});
                return JSON.stringify(limited, null, 2) + '\n... (truncated)';
            }
            return JSON.stringify(data, null, 2);
        }
        return String(data);
    }
    detectDeadlock(tasks) {
        const pendingTasks = tasks.filter(t => t.status === 'pending');
        const failedTasks = tasks.filter(t => t.status === 'failed');
        if (pendingTasks.length === 0) {
            return { isDeadlock: false, reason: '' };
        }
        const hasCycle = this.detectCycle(tasks);
        if (hasCycle) {
            return {
                isDeadlock: true,
                reason: '检测到循环依赖',
            };
        }
        const allBlockedByFailed = pendingTasks.every(task => {
            return task.dependencies.some(depId => {
                return failedTasks.some(f => f.id === depId);
            });
        });
        if (allBlockedByFailed) {
            return {
                isDeadlock: false,
                reason: '所有待处理任务都被失败任务阻断',
            };
        }
        const allDepsFailedOrMissing = pendingTasks.every(task => {
            return task.dependencies.every(depId => {
                const depTask = tasks.find(t => t.id === depId);
                return !depTask || depTask.status === 'failed';
            });
        });
        if (allDepsFailedOrMissing) {
            return {
                isDeadlock: true,
                reason: '存在待处理任务但所有依赖都失败或不存在',
            };
        }
        return {
            isDeadlock: true,
            reason: '存在待处理任务但无法运行（依赖关系问题）',
        };
    }
    detectCycle(tasks) {
        const visited = new Set();
        const recStack = new Set();
        const dfs = (taskId) => {
            if (recStack.has(taskId)) {
                return true;
            }
            if (visited.has(taskId)) {
                return false;
            }
            visited.add(taskId);
            recStack.add(taskId);
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                for (const depId of task.dependencies) {
                    if (dfs(depId)) {
                        return true;
                    }
                }
            }
            recStack.delete(taskId);
            return false;
        };
        for (const task of tasks) {
            if (!visited.has(task.id)) {
                if (dfs(task.id)) {
                    return true;
                }
            }
        }
        return false;
    }
    generateFinalSummary(tasks, memory) {
        const completed = tasks.filter(t => t.status === 'completed').length;
        const failed = tasks.filter(t => t.status === 'failed').length;
        const total = tasks.length;
        return `执行完成: ${completed}/${total} 成功, ${failed} 失败`;
    }
    getLlmProvider(threadId) {
        if (this.agentStateService) {
            const state = this.agentStateService.get(threadId);
            if ((state === null || state === void 0 ? void 0 : state.llm_provider) && state.llm_provider !== 'auto') {
                switch (state.llm_provider) {
                    case 'openai':
                        return llm_request_dto_1.LlmProvider.OPENAI;
                    case 'deepseek':
                        return llm_request_dto_1.LlmProvider.DEEPSEEK;
                    case 'gemini':
                        return llm_request_dto_1.LlmProvider.GEMINI;
                    case 'anthropic':
                        return llm_request_dto_1.LlmProvider.ANTHROPIC;
                }
            }
        }
        if (this.llmService) {
            return this.llmService.getDefaultProvider();
        }
        return llm_request_dto_1.LlmProvider.OPENAI;
    }
};
exports.DAGOrchestratorService = DAGOrchestratorService;
exports.DAGOrchestratorService = DAGOrchestratorService = DAGOrchestratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [planner_service_1.PlannerService,
        replanner_service_1.ReplannerService,
        executor_service_1.ExecutorService,
        context_assembler_service_1.ContextAssemblerService,
        agent_state_service_1.AgentStateService,
        llm_service_1.LlmService,
        trajectory_collection_service_1.TrajectoryCollectionService,
        rl_integration_service_1.RLIntegrationService])
], DAGOrchestratorService);
//# sourceMappingURL=orchestrator.service.js.map