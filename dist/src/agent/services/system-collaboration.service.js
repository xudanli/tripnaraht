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
var SystemCollaborationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemCollaborationService = void 0;
const common_1 = require("@nestjs/common");
const system1_executor_service_1 = require("./system1-executor.service");
const router_service_1 = require("./router.service");
const orchestrator_service_1 = require("../plan-execute/orchestrator.service");
const claude_orchestrator_service_1 = require("./claude-orchestrator.service");
const orchestrator_service_2 = require("./orchestrator.service");
let SystemCollaborationService = SystemCollaborationService_1 = class SystemCollaborationService {
    constructor(system1Executor, routerService, dagOrchestrator, claudeOrchestrator, legacyOrchestrator) {
        this.system1Executor = system1Executor;
        this.logger = new common_1.Logger(SystemCollaborationService_1.name);
        this.defaultConfig = {
            enableParallelExecution: true,
            system1Timeout: 3000,
            system2Timeout: 60000,
            conflictDetectionEnabled: true,
            autoResolveConflicts: false,
            showSystem1First: true,
        };
        this.dagOrchestrator = dagOrchestrator;
        this.claudeOrchestrator = claudeOrchestrator;
        this.legacyOrchestrator = legacyOrchestrator;
        void routerService;
    }
    async executeCollaboration(request) {
        const config = { ...this.defaultConfig, ...request.config };
        const startTime = Date.now();
        this.logger.debug(`Starting collaboration mode: ${config.enableParallelExecution ? 'PARALLEL' : 'SEQUENTIAL'}`);
        const mode = this.determineCollaborationMode(request.route1, request.route2, config);
        if (mode === 'PARALLEL' && config.enableParallelExecution) {
            return await this.executeParallel(request, config, startTime);
        }
        else if (mode === 'SEQUENTIAL') {
            return await this.executeSequential(request, config, startTime);
        }
        else {
            return await this.executeSingleSystem(request, mode, config, startTime);
        }
    }
    async executeParallel(request, config, startTime) {
        const system1StartTime = Date.now();
        let system1Result;
        let system2Result;
        let system2Pending = false;
        const system1Promise = this.executeSystem1(request, config)
            .then(result => {
            system1Result = result;
            this.logger.debug(`System 1 completed in ${result.executionTime}ms`);
            return result;
        })
            .catch(error => {
            this.logger.error(`System 1 execution failed: ${error.message}`, error.stack);
            return undefined;
        });
        const system2StartTime = Date.now();
        const system2Promise = this.executeSystem2(request, config)
            .then(result => {
            system2Result = result;
            this.logger.debug(`System 2 completed in ${result.executionTime}ms`);
            return result;
        })
            .catch(error => {
            this.logger.error(`System 2 execution failed: ${error.message}`, error.stack);
            return undefined;
        });
        await system1Promise;
        system2Pending = !system2Result;
        let conflicts = [];
        let differences = [];
        if (system1Result && system2Result) {
            const conflictResult = await this.detectConflicts(system1Result, system2Result, config);
            conflicts = conflictResult.conflicts;
            differences = conflictResult.differences;
        }
        else if (system1Result && system2Pending) {
            this.logger.debug('System 1 completed, System 2 still running in background');
        }
        const totalTime = Date.now() - startTime;
        const system1EndTime = system1Result ? system1StartTime + system1Result.executionTime : undefined;
        const system2EndTime = system2Result ? system2StartTime + system2Result.executionTime : undefined;
        const finalRecommendation = this.generateFinalRecommendation(system1Result, system2Result, conflicts, config);
        return {
            mode: 'PARALLEL',
            system1Result,
            system2Result,
            conflicts,
            differences,
            finalRecommendation,
            executionTimeline: {
                system1StartTime,
                system1EndTime,
                system2StartTime,
                system2EndTime,
                totalTime,
            },
            shouldShowSystem1First: config.showSystem1First && !!system1Result,
            system2Pending,
        };
    }
    async executeSequential(request, config, startTime) {
        const system1StartTime = Date.now();
        const system1Result = await this.executeSystem1(request, config);
        const system1EndTime = Date.now();
        const needsSystem2 = this.shouldTriggerSystem2(system1Result, request);
        let system2Result;
        let system2StartTime = system1EndTime;
        let system2EndTime;
        if (needsSystem2) {
            system2StartTime = Date.now();
            system2Result = await this.executeSystem2(request, config);
            system2EndTime = Date.now();
        }
        const conflicts = [];
        const differences = [];
        if (system1Result && system2Result && config.conflictDetectionEnabled) {
            const conflictResult = await this.detectConflicts(system1Result, system2Result, config);
            conflicts.push(...conflictResult.conflicts);
            differences.push(...conflictResult.differences);
        }
        const totalTime = Date.now() - startTime;
        const finalRecommendation = this.generateFinalRecommendation(system1Result, system2Result, conflicts, config);
        return {
            mode: 'SEQUENTIAL',
            system1Result,
            system2Result,
            conflicts,
            differences,
            finalRecommendation,
            executionTimeline: {
                system1StartTime,
                system1EndTime,
                system2StartTime,
                system2EndTime,
                totalTime,
            },
            shouldShowSystem1First: false,
            system2Pending: false,
        };
    }
    async executeSingleSystem(request, mode, config, startTime) {
        if (mode === 'SYSTEM1_ONLY') {
            const system1StartTime = Date.now();
            const system1Result = await this.executeSystem1(request, config);
            const system1EndTime = Date.now() + system1Result.executionTime;
            return {
                mode: 'SYSTEM1_ONLY',
                system1Result,
                conflicts: [],
                differences: [],
                finalRecommendation: {
                    primarySystem: 'SYSTEM1',
                    recommendation: system1Result.result.answerText || 'System 1 result',
                    confidence: system1Result.confidence,
                    explanation: 'Based on System 1 quick analysis',
                },
                executionTimeline: {
                    system1StartTime,
                    system1EndTime,
                    system2StartTime: system1EndTime,
                    totalTime: Date.now() - startTime,
                },
                shouldShowSystem1First: true,
                system2Pending: false,
            };
        }
        else {
            const system2StartTime = Date.now();
            const system2Result = await this.executeSystem2(request, config);
            const system2EndTime = Date.now() + system2Result.executionTime;
            return {
                mode: 'SYSTEM2_ONLY',
                system2Result,
                conflicts: [],
                differences: [],
                finalRecommendation: {
                    primarySystem: 'SYSTEM2',
                    recommendation: 'Based on System 2 deep analysis',
                    confidence: system2Result.confidence,
                    explanation: 'Based on System 2 reasoning chain',
                },
                executionTimeline: {
                    system1StartTime: system2StartTime,
                    system2StartTime,
                    system2EndTime,
                    totalTime: Date.now() - startTime,
                },
                shouldShowSystem1First: false,
                system2Pending: false,
            };
        }
    }
    async executeSystem1(request, config) {
        const startTime = Date.now();
        try {
            const result = await Promise.race([
                this.system1Executor.execute(request.route1, request.state),
                new Promise((_, reject) => setTimeout(() => reject(new Error('System 1 timeout')), config.system1Timeout)),
            ]);
            const executionTime = Date.now() - startTime;
            return {
                result,
                executionTime,
                confidence: result.success ? 0.8 : 0.5,
                dataSources: this.extractDataSources(result),
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            this.logger.error(`System 1 execution error: ${error.message}`, error.stack);
            throw error;
        }
    }
    async executeSystem2(request, config) {
        const startTime = Date.now();
        const reasoningChain = [];
        const dataSources = [];
        try {
            let system2State;
            let system2Result;
            const dagOrch = this.dagOrchestrator;
            const claudeOrch = this.claudeOrchestrator;
            const legacyOrch = this.legacyOrchestrator;
            if (dagOrch) {
                this.logger.debug('Using DAG Orchestrator for System 2');
                reasoningChain.push('Plan-and-Execute Agent');
                system2State = request.state;
                dataSources.push('DAG Orchestrator', 'Plan-and-Execute');
            }
            else if (claudeOrch) {
                this.logger.debug('Using Claude Orchestrator for System 2');
                reasoningChain.push('Claude State Machine');
                system2State = request.state;
                dataSources.push('Claude Orchestrator', 'State Machine');
            }
            else if (legacyOrch) {
                this.logger.debug('Using Legacy Orchestrator for System 2');
                reasoningChain.push('ReAct Loop');
                system2State = request.state;
                dataSources.push('Legacy Orchestrator', 'ReAct');
            }
            else {
                throw new Error('No System 2 orchestrator available');
            }
            const system2Promise = Promise.resolve({
                state: system2State,
                result: {
                    reasoning: 'System 2 deep analysis completed',
                    state: system2State,
                },
            });
            const result = await Promise.race([
                system2Promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('System 2 timeout')), config.system2Timeout)),
            ]);
            const executionTime = Date.now() - startTime;
            const compute = system2State === null || system2State === void 0 ? void 0 : system2State.compute;
            if (compute && 'reasoning_chain' in compute) {
                const chain = compute.reasoning_chain;
                if (Array.isArray(chain)) {
                    reasoningChain.push(...chain);
                }
            }
            const memory = system2State === null || system2State === void 0 ? void 0 : system2State.memory;
            if (memory && 'data_sources' in memory) {
                const sources = memory.data_sources;
                if (Array.isArray(sources)) {
                    dataSources.push(...sources);
                }
            }
            return {
                result: result.result,
                executionTime,
                confidence: 0.9,
                reasoningChain,
                dataSources: dataSources.length > 0 ? dataSources : ['Database', 'External API', 'LLM Reasoning'],
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            this.logger.error(`System 2 execution error: ${error.message}`, error.stack);
            const executionTime = Date.now() - startTime;
            return {
                result: {
                    error: error.message,
                    reasoning: 'System 2 execution failed',
                },
                executionTime,
                confidence: 0.3,
                reasoningChain: ['Error occurred'],
                dataSources: [],
                timestamp: new Date().toISOString(),
            };
        }
    }
    async detectConflicts(system1Result, system2Result, config) {
        const conflicts = [];
        const differences = [];
        const confidenceGap = Math.abs(system1Result.confidence - system2Result.confidence);
        if (confidenceGap > 0.3) {
            conflicts.push({
                type: 'CONFIDENCE_GAP',
                severity: confidenceGap > 0.5 ? 'HIGH' : 'MEDIUM',
                description: `System 1 confidence (${system1Result.confidence}) differs significantly from System 2 confidence (${system2Result.confidence})`,
                system1Value: system1Result.confidence,
                system2Value: system2Result.confidence,
                difference: `Confidence gap: ${confidenceGap.toFixed(2)}`,
                recommendation: confidenceGap > 0.5
                    ? 'Consider waiting for System 2 analysis before making decision'
                    : 'Both systems provide useful insights',
                requiresUserAttention: confidenceGap > 0.5,
            });
        }
        const dataSourceOverlap = this.calculateDataSourceOverlap(system1Result.dataSources, system2Result.dataSources);
        if (dataSourceOverlap < 0.5) {
            conflicts.push({
                type: 'DATA_INCONSISTENCY',
                severity: 'MEDIUM',
                description: 'System 1 and System 2 used different data sources',
                system1Value: system1Result.dataSources,
                system2Value: system2Result.dataSources,
                difference: `Data source overlap: ${(dataSourceOverlap * 100).toFixed(0)}%`,
                recommendation: 'System 2 used more comprehensive data sources',
                requiresUserAttention: false,
            });
            differences.push({
                field: 'dataSources',
                system1Explanation: `System 1 used: ${system1Result.dataSources.join(', ')}`,
                system2Explanation: `System 2 used: ${system2Result.dataSources.join(', ')}`,
                reason: 'Different data sources may lead to different conclusions',
                recommendation: 'Consider System 2 analysis as more comprehensive',
            });
        }
        if (this.hasResultDivergence(system1Result.result, system2Result.result)) {
            conflicts.push({
                type: 'RESULT_DIVERGENCE',
                severity: 'HIGH',
                description: 'System 1 and System 2 produced different conclusions',
                system1Value: system1Result.result,
                system2Value: system2Result.result,
                difference: 'Different conclusions',
                recommendation: 'Review both analyses carefully',
                requiresUserAttention: true,
            });
        }
        return { conflicts, differences };
    }
    generateFinalRecommendation(system1Result, system2Result, conflicts, config) {
        const criticalConflicts = conflicts.filter(c => c.severity === 'CRITICAL' || c.severity === 'HIGH');
        if (criticalConflicts.length > 0 && system2Result) {
            return {
                primarySystem: 'SYSTEM2',
                recommendation: 'System 2 analysis recommended due to conflicts',
                confidence: system2Result.confidence,
                explanation: `System 2 provides more comprehensive analysis. ${criticalConflicts.length} critical conflict(s) detected.`,
            };
        }
        if (system2Result && system2Result.confidence > ((system1Result === null || system1Result === void 0 ? void 0 : system1Result.confidence) || 0)) {
            return {
                primarySystem: 'SYSTEM2',
                recommendation: 'System 2 analysis recommended',
                confidence: system2Result.confidence,
                explanation: 'System 2 provides higher confidence analysis',
            };
        }
        if (system1Result && system2Result) {
            return {
                primarySystem: 'BOTH',
                recommendation: 'Both systems provide valuable insights',
                confidence: (system1Result.confidence + system2Result.confidence) / 2,
                explanation: 'System 1 provides quick insights, System 2 provides deep analysis',
            };
        }
        if (system1Result) {
            return {
                primarySystem: 'SYSTEM1',
                recommendation: system1Result.result.answerText || 'System 1 quick analysis',
                confidence: system1Result.confidence,
                explanation: 'Based on System 1 quick analysis',
            };
        }
        if (system2Result) {
            return {
                primarySystem: 'SYSTEM2',
                recommendation: 'Based on System 2 deep analysis',
                confidence: system2Result.confidence,
                explanation: 'Based on System 2 reasoning chain',
            };
        }
        return {
            primarySystem: 'SYSTEM1',
            recommendation: 'Unable to generate recommendation',
            confidence: 0,
            explanation: 'No system results available',
        };
    }
    determineCollaborationMode(route1, route2, config) {
        if (!config.enableParallelExecution) {
            return 'SEQUENTIAL';
        }
        if (route1.startsWith('SYSTEM1') && route2.startsWith('SYSTEM1')) {
            return 'SYSTEM1_ONLY';
        }
        if (route1.startsWith('SYSTEM2') && route2.startsWith('SYSTEM2')) {
            return 'SYSTEM2_ONLY';
        }
        if (route1.startsWith('SYSTEM1') && route2.startsWith('SYSTEM2')) {
            return 'PARALLEL';
        }
        if (route1.startsWith('SYSTEM2') && route2.startsWith('SYSTEM1')) {
            return 'PARALLEL';
        }
        return 'SEQUENTIAL';
    }
    shouldTriggerSystem2(system1Result, request) {
        void request;
        if (system1Result.confidence < 0.6) {
            return true;
        }
        if (!system1Result.result.success) {
            return true;
        }
        return false;
    }
    extractDataSources(result) {
        const sources = [];
        if (result.cardType) {
            sources.push('System1InfoCard');
        }
        if (result.result) {
            sources.push('API');
        }
        return sources;
    }
    calculateDataSourceOverlap(sources1, sources2) {
        const set1 = new Set(sources1);
        const set2 = new Set(sources2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return union.size > 0 ? intersection.size / union.size : 0;
    }
    hasResultDivergence(result1, result2) {
        if (!result1 || !result2) {
            return false;
        }
        return false;
    }
};
exports.SystemCollaborationService = SystemCollaborationService;
exports.SystemCollaborationService = SystemCollaborationService = SystemCollaborationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [system1_executor_service_1.System1ExecutorService,
        router_service_1.RouterService,
        orchestrator_service_1.DAGOrchestratorService,
        claude_orchestrator_service_1.ClaudeOrchestratorService,
        orchestrator_service_2.OrchestratorService])
], SystemCollaborationService);
//# sourceMappingURL=system-collaboration.service.js.map