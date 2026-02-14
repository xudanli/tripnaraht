"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TrainingController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const trajectory_collection_service_1 = require("./services/trajectory-collection.service");
const trajectory_validator_service_1 = require("./services/trajectory-validator.service");
const training_data_preparation_service_1 = require("./services/training-data-preparation.service");
const trajectory_etl_service_1 = require("./services/trajectory-etl.service");
const data_quality_checker_service_1 = require("./services/data-quality-checker.service");
const dataset_version_manager_service_1 = require("./services/dataset-version-manager.service");
const training_pipeline_service_1 = require("./services/training-pipeline.service");
const model_registry_service_1 = require("./services/model-registry.service");
const policy_service_manager_service_1 = require("./services/policy-service-manager.service");
const eval_suite_service_1 = require("./services/eval-suite.service");
const offline_policy_evaluator_service_1 = require("./services/offline-policy-evaluator.service");
const replay_comparator_service_1 = require("./services/replay-comparator.service");
const regression_gate_service_1 = require("./services/regression-gate.service");
const training_metrics_service_1 = require("./services/training-metrics.service");
const training_batch_processor_service_1 = require("./services/training-batch-processor.service");
const model_collapse_monitor_service_1 = require("./services/model-collapse-monitor.service");
const training_quality_analyzer_service_1 = require("./services/training-quality-analyzer.service");
const constraints_engine_service_1 = require("./services/constraints-engine.service");
const risk_event_manager_service_1 = require("./services/risk-event-manager.service");
const compliance_audit_service_1 = require("./services/compliance-audit.service");
const security_red_team_service_1 = require("./services/security-red-team.service");
const reward_definition_service_1 = require("./services/reward-definition.service");
const user_feedback_loop_service_1 = require("./services/user-feedback-loop.service");
const ab_test_manager_service_1 = require("./services/ab-test-manager.service");
const explainable_output_service_1 = require("./services/explainable-output.service");
const clarification_prompt_designer_service_1 = require("./services/clarification-prompt-designer.service");
const risk_prompt_designer_service_1 = require("./services/risk-prompt-designer.service");
const decision_explanation_designer_service_1 = require("./services/decision-explanation-designer.service");
const domain_expert_knowledge_service_1 = require("./services/domain-expert-knowledge.service");
const judge_prompt_designer_service_1 = require("./services/judge-prompt-designer.service");
const reward_model_trainer_service_1 = require("./services/reward-model-trainer.service");
const diagnostic_label_system_service_1 = require("./services/diagnostic-label-system.service");
const quality_scorer_service_1 = require("./services/quality-scorer.service");
const roll_monitoring_service_1 = require("./services/roll-monitoring.service");
const roll_ab_test_service_1 = require("./services/roll-ab-test.service");
const iterative_deployment_workflow_service_1 = require("./services/iterative-deployment-workflow.service");
const model_ab_test_service_1 = require("./services/model-ab-test.service");
const trajectory_dto_1 = require("./dto/trajectory.dto");
const training_dto_1 = require("./dto/training.dto");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
let TrainingController = TrainingController_1 = class TrainingController {
    constructor(collectionService, validatorService, trainingDataPrepService, etlService, qualityChecker, versionManager, trainingPipeline, modelRegistry, policyService, evalSuite, opeEvaluator, replayComparator, regressionGate, constraintsEngine, riskEventManager, complianceAudit, securityRedTeam, rewardDefinition, userFeedbackLoop, abTestManager, explainableOutput, clarificationPromptDesigner, riskPromptDesigner, decisionExplanationDesigner, domainExpertKnowledge, judgePromptDesigner, rewardModelTrainer, diagnosticLabelSystem, qualityScorer, metricsService, batchProcessor, collapseMonitor, qualityAnalyzer, rollMonitoring, rollABTest, iterativeDeploymentWorkflow, modelABTest) {
        this.collectionService = collectionService;
        this.validatorService = validatorService;
        this.trainingDataPrepService = trainingDataPrepService;
        this.etlService = etlService;
        this.qualityChecker = qualityChecker;
        this.versionManager = versionManager;
        this.trainingPipeline = trainingPipeline;
        this.modelRegistry = modelRegistry;
        this.policyService = policyService;
        this.evalSuite = evalSuite;
        this.opeEvaluator = opeEvaluator;
        this.replayComparator = replayComparator;
        this.regressionGate = regressionGate;
        this.constraintsEngine = constraintsEngine;
        this.riskEventManager = riskEventManager;
        this.complianceAudit = complianceAudit;
        this.securityRedTeam = securityRedTeam;
        this.rewardDefinition = rewardDefinition;
        this.userFeedbackLoop = userFeedbackLoop;
        this.abTestManager = abTestManager;
        this.explainableOutput = explainableOutput;
        this.clarificationPromptDesigner = clarificationPromptDesigner;
        this.riskPromptDesigner = riskPromptDesigner;
        this.decisionExplanationDesigner = decisionExplanationDesigner;
        this.domainExpertKnowledge = domainExpertKnowledge;
        this.judgePromptDesigner = judgePromptDesigner;
        this.rewardModelTrainer = rewardModelTrainer;
        this.diagnosticLabelSystem = diagnosticLabelSystem;
        this.qualityScorer = qualityScorer;
        this.metricsService = metricsService;
        this.batchProcessor = batchProcessor;
        this.collapseMonitor = collapseMonitor;
        this.qualityAnalyzer = qualityAnalyzer;
        this.rollMonitoring = rollMonitoring;
        this.rollABTest = rollABTest;
        this.iterativeDeploymentWorkflow = iterativeDeploymentWorkflow;
        this.modelABTest = modelABTest;
        this.logger = new common_1.Logger(TrainingController_1.name);
        if (this.rollMonitoring) {
            this.logger.log('[TrainingController] ROLL 监控已启用');
        }
    }
    async collectTrajectory(dto) {
        this.logger.log(`[TrainingController] 收集轨迹: requestId=${dto.requestId}`);
        try {
            const result = await this.collectionService.collectTrajectory({
                requestId: dto.requestId,
                tripId: dto.tripId,
                plan: dto.plan,
                decisionTrace: dto.decisionTrace,
                researchData: dto.researchData,
                gateResult: dto.gateResult,
                complianceResult: dto.complianceResult,
                modelVersion: dto.modelVersion,
                countryCode: dto.countryCode,
            });
            return {
                success: true,
                data: {
                    trajectoryId: result.trajectoryId,
                    status: result.status,
                },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 收集轨迹失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async validateTrajectory(trajectoryId, dto) {
        this.logger.log(`[TrainingController] 验证轨迹: trajectoryId=${trajectoryId}`);
        try {
            if (!dto.gateResult || !dto.complianceResult) {
                throw new Error('gateResult 和 complianceResult 必须提供');
            }
            const userApproval = dto.userApproval
                ? dto.userApproval
                : undefined;
            const executionResult = dto.executionResult
                ? {
                    success: dto.executionResult.success,
                    error: dto.executionResult.error,
                }
                : undefined;
            const validationResult = await this.validatorService.validateTrajectory(dto.gateResult, dto.complianceResult, userApproval, executionResult);
            return {
                success: true,
                data: {
                    isValid: validationResult.isValid,
                    score: validationResult.score,
                    reasons: validationResult.reasons,
                    validationStatus: validationResult.isValid ? 'VALIDATED' : 'REJECTED',
                },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 验证轨迹失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async findTrajectoryByRequestId(requestId) {
        this.logger.log(`[TrainingController] 查找轨迹: requestId=${requestId}`);
        try {
            const result = await this.collectionService.findTrajectoryByRequestId(requestId);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 查找轨迹失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async prepareTrainingBatch(dto = {}) {
        this.logger.log(`[TrainingController] 准备训练批次`);
        try {
            const batch = await this.trainingDataPrepService.prepareTrainingBatch(dto);
            return {
                success: true,
                data: {
                    batchId: batch.batchId,
                    trajectoryCount: batch.trajectories.length,
                    trainingDataCount: batch.trainingData.length,
                    stats: batch.stats,
                    createdAt: batch.createdAt,
                },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 准备训练批次失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async markBatchAsUsed(batchId, dto) {
        this.logger.log(`[TrainingController] 标记批次为已使用: batchId=${batchId}, count=${dto.trajectoryIds.length}`);
        try {
            await this.trainingDataPrepService.markAsUsed(dto.trajectoryIds, batchId);
            return {
                success: true,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 标记批次失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async exportBatchToJSONL(batchId, dto = {}) {
        this.logger.log(`[TrainingController] 导出批次为 JSONL: batchId=${batchId}`);
        try {
            const batch = await this.trainingDataPrepService.prepareTrainingBatch({});
            const outputPath = dto.outputPath ||
                `./exports/training_batch_${batchId}_${Date.now()}.jsonl`;
            const result = await this.trainingDataPrepService.exportToJSONL(batch, outputPath);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 导出 JSONL 失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async exportBatchToJSON(batchId, dto = {}) {
        this.logger.log(`[TrainingController] 导出批次为 JSON: batchId=${batchId}`);
        try {
            const batch = await this.trainingDataPrepService.prepareTrainingBatch({});
            const outputPath = dto.outputPath ||
                `./exports/training_batch_${batchId}_${Date.now()}.json`;
            const result = await this.trainingDataPrepService.exportToJSON(batch, outputPath);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 导出 JSON 失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getCollectionStats(dto = {}) {
        this.logger.log(`[TrainingController] 获取收集统计`);
        try {
            const stats = await this.metricsService.getCollectionStats({
                startDate: dto.startDate ? new Date(dto.startDate) : undefined,
                endDate: dto.endDate ? new Date(dto.endDate) : undefined,
                modelVersion: dto.modelVersion,
                countryCode: dto.countryCode,
            });
            return {
                success: true,
                data: stats,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取统计失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getTrainingQuality(dto = {}) {
        this.logger.log(`[TrainingController] 获取训练数据质量指标`);
        try {
            const quality = await this.metricsService.getTrainingDataQuality({
                minScore: dto.minScore,
                minReward: dto.minReward,
            });
            return {
                success: true,
                data: quality,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取质量指标失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async createBatchTask(dto) {
        this.logger.log(`[TrainingController] 创建批量处理任务`);
        try {
            const task = await this.batchProcessor.createBatchTask(dto);
            return {
                success: true,
                data: {
                    taskId: task.taskId,
                    status: task.status,
                },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 创建任务失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getTaskStatus(taskId) {
        this.logger.log(`[TrainingController] 获取任务状态: taskId=${taskId}`);
        try {
            const task = this.batchProcessor.getTaskStatus(taskId);
            if (!task) {
                return {
                    success: false,
                    data: { error: 'Task not found' },
                };
            }
            return {
                success: true,
                data: {
                    taskId: task.taskId,
                    status: task.status,
                    progress: task.progress,
                    currentStage: task.currentStage,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                    error: task.error,
                    result: task.result
                        ? {
                            batchId: task.result.batch.batchId,
                            trajectoryCount: task.result.batch.trajectories.length,
                            exports: task.result.exports,
                        }
                        : null,
                },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取任务状态失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getAllTasks() {
        this.logger.log(`[TrainingController] 获取所有任务`);
        try {
            const tasks = this.batchProcessor.getAllTasks();
            return {
                success: true,
                data: tasks.map((task) => ({
                    taskId: task.taskId,
                    status: task.status,
                    progress: task.progress,
                    currentStage: task.currentStage,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                })),
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取任务列表失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async detectCollapseRisk(dto = {}) {
        this.logger.log(`[TrainingController] 检测 Model Collapse 风险`);
        try {
            const report = await this.collapseMonitor.detectCollapseRisk({
                modelVersion: dto.modelVersion,
                lookbackDays: dto.lookbackDays,
                minTrajectories: dto.minTrajectories,
            });
            return {
                success: true,
                data: report,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 检测 Model Collapse 风险失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async analyzeQuality(dto = {}) {
        this.logger.log(`[TrainingController] 分析训练数据质量`);
        try {
            const report = await this.qualityAnalyzer.analyzeQuality({
                startDate: dto.startDate ? new Date(dto.startDate) : undefined,
                endDate: dto.endDate ? new Date(dto.endDate) : undefined,
                modelVersion: dto.modelVersion,
                countryCode: dto.countryCode,
                minScore: dto.minScore,
                minReward: dto.minReward,
            });
            return {
                success: true,
                data: report,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 分析训练数据质量失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async extractTrajectories(dto = {}) {
        this.logger.log(`[TrainingController] ETL抽取轨迹数据`);
        try {
            const trajectories = await this.etlService.extractTrajectories(dto);
            return {
                success: true,
                data: {
                    count: trajectories.length,
                    trajectories: trajectories.map((t) => ({
                        trajectory_id: t.trajectory_id,
                        request_id: t.request_id,
                        steps_count: t.steps.length,
                        metadata: t.metadata,
                    })),
                },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] ETL抽取轨迹失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async exportTrajectories(dto = {}) {
        this.logger.log(`[TrainingController] ETL导出轨迹数据集: format=${dto.format || 'jsonl'}`);
        try {
            const result = await this.etlService.loadToDataset({
                trajectory_ids: dto.trajectory_ids,
                request_ids: dto.request_ids,
                min_validation_score: dto.min_validation_score,
                min_total_reward: dto.min_total_reward,
                model_version: dto.model_version,
                country_code: dto.country_code,
                date_range: dto.date_range,
            }, dto.format || 'jsonl', dto.output_dir || './data/training');
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] ETL导出失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async checkDataQuality(dto = {}) {
        this.logger.log(`[TrainingController] 检查数据质量`);
        try {
            const trajectories = await this.etlService.extractTrajectories(dto);
            const qualityResult = await this.qualityChecker.validateDataset(trajectories);
            return {
                success: true,
                data: qualityResult,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 数据质量检查失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async createDatasetVersion(dto) {
        this.logger.log(`[TrainingController] 创建数据集版本`);
        try {
            const version = await this.versionManager.createDatasetVersion(dto.export_result, dto.quality_result, dto.data_source, dto.anonymization);
            return {
                success: true,
                data: version,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 创建数据集版本失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getDatasetVersion(version) {
        this.logger.log(`[TrainingController] 获取数据集版本: version=${version}`);
        try {
            const datasetVersion = await this.versionManager.getDatasetVersion(version);
            if (!datasetVersion) {
                return {
                    success: false,
                    data: { message: `版本不存在: ${version}` },
                };
            }
            return {
                success: true,
                data: datasetVersion,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取数据集版本失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async listDatasetVersions() {
        this.logger.log(`[TrainingController] 列出所有数据集版本`);
        try {
            const versions = await this.versionManager.listDatasetVersions();
            return {
                success: true,
                data: versions,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 列出数据集版本失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async compareVersions(version1, version2) {
        this.logger.log(`[TrainingController] 对比数据集版本: version1=${version1}, version2=${version2}`);
        try {
            const comparison = await this.versionManager.compareVersions(version1, version2);
            return {
                success: true,
                data: comparison,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 对比数据集版本失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async createTrainingJob(dto) {
        this.logger.log(`[TrainingController] 创建训练任务: datasetVersion=${dto.dataset_version}`);
        try {
            const job = await this.trainingPipeline.createTrainingJob(dto.dataset_version, dto.model_config, dto.training_config, dto.hyperparameter_search);
            return {
                success: true,
                data: job,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 创建训练任务失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async startTraining(jobId) {
        this.logger.log(`[TrainingController] 启动训练: jobId=${jobId}`);
        try {
            const job = await this.trainingPipeline.startTraining(jobId);
            return {
                success: true,
                data: job,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 启动训练失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getAllEnumOptions() {
        const { ALL_ENUM_OPTIONS } = await Promise.resolve().then(() => __importStar(require('./interfaces/enums.interface')));
        return {
            success: true,
            data: ALL_ENUM_OPTIONS,
        };
    }
    async getEnumOptions(enumKey) {
        const { ALL_ENUM_OPTIONS } = await Promise.resolve().then(() => __importStar(require('./interfaces/enums.interface')));
        const options = ALL_ENUM_OPTIONS[enumKey];
        if (!options) {
            return {
                success: false,
                data: [],
            };
        }
        return {
            success: true,
            data: options,
        };
    }
    async getTrainingJobStatus(jobId) {
        try {
            const job = await this.trainingPipeline.getTrainingJobStatus(jobId);
            return {
                success: true,
                data: job,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取训练任务状态失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async listTrainingJobs() {
        try {
            const jobs = await this.trainingPipeline.listTrainingJobs();
            return {
                success: true,
                data: jobs,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 列出训练任务失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async registerModel(dto) {
        this.logger.log(`[TrainingController] 注册模型: version=${dto.model_version.version}`);
        try {
            const entry = await this.modelRegistry.registerModel(dto.model_version, dto.eval_metrics);
            return {
                success: true,
                data: entry,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 注册模型失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getModelVersion(version) {
        try {
            const modelVersion = await this.modelRegistry.getModelVersion(version);
            if (!modelVersion) {
                return {
                    success: false,
                    data: { message: `Model version not found: ${version}` },
                };
            }
            return {
                success: true,
                data: modelVersion,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取模型版本失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async listModelVersions() {
        try {
            const versions = await this.modelRegistry.listModelVersions();
            return {
                success: true,
                data: versions,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 列出模型版本失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async rollbackModel(version) {
        this.logger.log(`[TrainingController] 回滚模型: version=${version}`);
        try {
            const modelVersion = await this.modelRegistry.rollbackToVersion(version);
            return {
                success: true,
                data: modelVersion,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 回滚模型失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async policyPredict(dto) {
        this.logger.debug(`[TrainingController] PolicyService推理: requestId=${dto.request_id}`);
        try {
            const result = await this.policyService.predict(dto);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] PolicyService推理失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async policyHealthCheck() {
        try {
            const health = await this.policyService.healthCheck();
            return {
                success: true,
                data: health,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] PolicyService健康检查失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async policyMetrics() {
        try {
            const metrics = await this.policyService.getMetrics();
            return {
                success: true,
                data: metrics,
            };
        }
        catch (error) {
            this.logger.warn(`[TrainingController] PolicyService不可用，返回降级数据: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                success: true,
                data: {
                    qps: 0,
                    p50_latency_ms: 0,
                    p95_latency_ms: 0,
                    p99_latency_ms: 0,
                    error_rate: 0,
                    total_requests: 0,
                    total_errors: 0,
                    model_versions: {},
                    status: 'unavailable',
                    message: 'PolicyService is not running',
                },
            };
        }
    }
    async deployPolicyModel(dto) {
        this.logger.log(`[TrainingController] 部署模型到PolicyService: version=${dto.model_version}`);
        try {
            await this.policyService.deployModel(dto.model_version);
            return {
                success: true,
                data: { message: `Model ${dto.model_version} deployed successfully` },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 部署模型失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async evaluateRouter(dto) {
        this.logger.log(`[TrainingController] Router评测: modelVersion=${dto.model_version}`);
        try {
            const result = await this.evalSuite.evaluateRouter(dto.model_version, dto.test_cases);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] Router评测失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async evaluateGate(dto) {
        this.logger.log(`[TrainingController] Gate评测: modelVersion=${dto.model_version}`);
        try {
            const result = await this.evalSuite.evaluateGate(dto.model_version, dto.test_cases);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] Gate评测失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async evaluateItinerary(dto) {
        this.logger.log(`[TrainingController] Itinerary评测: modelVersion=${dto.model_version}`);
        try {
            const result = await this.evalSuite.evaluateItinerary(dto.model_version, dto.test_cases);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] Itinerary评测失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async evaluateFullPipeline(dto) {
        this.logger.log(`[TrainingController] 完整流程评测: modelVersion=${dto.model_version}`);
        try {
            const result = await this.evalSuite.evaluateFullPipeline(dto.model_version, dto.test_cases);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 完整流程评测失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async generateOPEReport(dto) {
        this.logger.log(`[TrainingController] 生成OPE报告: modelVersion=${dto.model_version}`);
        try {
            return {
                success: true,
                data: { message: 'OPE report generation (not fully implemented)' },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 生成OPE报告失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async replayCompare(dto) {
        this.logger.log(`[TrainingController] 回放对照: baseline=${dto.baseline_version}, newPolicy=${dto.new_policy_version}`);
        try {
            const trajectories = await this.etlService.extractTrajectories({
                trajectory_ids: dto.trajectory_ids,
                request_ids: dto.request_ids,
                min_validation_score: dto.min_validation_score,
                min_total_reward: dto.min_total_reward,
                country_code: dto.country_code,
                date_range: dto.date_range,
                limit: dto.limit || 1000,
                offset: dto.offset || 0,
            });
            if (trajectories.length === 0) {
                return {
                    success: false,
                    data: { error: 'No trajectories found matching the criteria' },
                };
            }
            const result = await this.replayComparator.compareResults(dto.baseline_version, dto.new_policy_version, trajectories);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 回放对照失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async checkRegressionGate(dto) {
        this.logger.log(`[TrainingController] 检查回归门槛: newPolicy=${dto.new_policy_version}, baseline=${dto.baseline_version}`);
        try {
            const result = await this.regressionGate.checkRegression(dto.new_policy_version, dto.baseline_version, dto.comparison_result, dto.config);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 检查回归门槛失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async checkConstraints(dto) {
        this.logger.log(`[TrainingController] 检查约束`);
        try {
            const result = await this.constraintsEngine.checkConstraints(dto.itinerary, dto.context);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 检查约束失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async classifyRiskEvent(dto) {
        this.logger.log(`[TrainingController] 分级风险事件: requestId=${dto.request_id}`);
        try {
            const event = await this.riskEventManager.classifyRiskEvent(dto.request_id, dto.violations, dto.category, dto.description);
            return {
                success: true,
                data: event,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 分级风险事件失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async handleRiskEvent(eventId, dto) {
        this.logger.log(`[TrainingController] 处置风险事件: eventId=${eventId}`);
        try {
            const event = await this.riskEventManager.handleRiskEvent(eventId, dto.action, dto.resolved_by, dto.mitigation_details);
            return {
                success: true,
                data: event,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 处置风险事件失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async recordAudit(dto) {
        this.logger.log(`[TrainingController] 记录决策审计: requestId=${dto.request_id}`);
        try {
            const record = await this.complianceAudit.recordDecision(dto.request_id, dto.decision_type, dto.decision_result, dto.constraint_check_result, dto.context, dto.risk_event);
            return {
                success: true,
                data: record,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 记录决策审计失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getComplianceReportList(page, limit, periodStart, periodEnd) {
        const pageNum = parseInt(page || '1', 10);
        const limitNum = parseInt(limit || '50', 10);
        this.logger.log(`[TrainingController] 获取合规审计报告列表: page=${pageNum}, limit=${limitNum}`);
        try {
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const start = periodStart || thirtyDaysAgo.toISOString();
            const end = periodEnd || now.toISOString();
            const report = await this.complianceAudit.generateComplianceReport(start, end);
            return {
                success: true,
                data: {
                    items: report ? [report] : [],
                    total: report ? 1 : 0,
                    page: pageNum,
                    limit: limitNum,
                    period: { start, end },
                },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取合规审计报告列表失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            return {
                success: true,
                data: {
                    items: [],
                    total: 0,
                    page: pageNum,
                    limit: limitNum,
                },
            };
        }
    }
    async generateComplianceReport(dto) {
        this.logger.log(`[TrainingController] 生成合规审计报告: periodStart=${dto.period_start}, periodEnd=${dto.period_end}`);
        try {
            const report = await this.complianceAudit.generateComplianceReport(dto.period_start, dto.period_end);
            return {
                success: true,
                data: report,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 生成合规审计报告失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async runRedTeamTests(dto) {
        this.logger.log(`[TrainingController] 运行红队测试`);
        try {
            const results = await this.securityRedTeam.runRedTeamTests(dto.test_case_ids);
            return {
                success: true,
                data: results,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 运行红队测试失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async listRedTeamTestCases(dto = {}) {
        try {
            const testCases = this.securityRedTeam.listTestCases(dto.category);
            return {
                success: true,
                data: testCases,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 列出红队测试用例失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async calculateReward(dto) {
        this.logger.log(`[TrainingController] 计算Reward`);
        try {
            const config = dto.weights
                ? this.rewardDefinition.updateWeights(dto.weights)
                : this.rewardDefinition.getDefaultConfig();
            const result = this.rewardDefinition.calculateReward(dto.metrics, config);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 计算Reward失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async trackUserAction(dto) {
        this.logger.log(`[TrainingController] 追踪用户行为: actionType=${dto.action_type}`);
        try {
            const action = await this.userFeedbackLoop.trackUserAction(dto.user_id, dto.action_type, dto.context);
            return {
                success: true,
                data: action,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 追踪用户行为失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async collectFeedback(dto) {
        this.logger.log(`[TrainingController] 收集用户反馈: requestId=${dto.request_id}`);
        try {
            const feedback = await this.userFeedbackLoop.collectFeedback(dto.user_id, dto.request_id, dto.plan_id, dto.feedback);
            return {
                success: true,
                data: feedback,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 收集用户反馈失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async analyzeFeedback(dto) {
        this.logger.log(`[TrainingController] 分析用户反馈: startDate=${dto.start_date}, endDate=${dto.end_date}`);
        try {
            const analysis = await this.userFeedbackLoop.analyzeFeedback(dto.start_date, dto.end_date);
            return {
                success: true,
                data: analysis,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 分析用户反馈失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async createABTest(dto) {
        this.logger.log(`[TrainingController] 创建A/B实验: name=${dto.name}`);
        try {
            const experiment = await this.abTestManager.createExperiment(dto.name, dto.description, dto.variants, dto.success_metrics);
            return {
                success: true,
                data: experiment,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 创建A/B实验失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async assignToGroup(dto) {
        this.logger.log(`[TrainingController] 分配用户到实验组: experimentId=${dto.experiment_id}`);
        try {
            const assignment = await this.abTestManager.assignToGroup(dto.experiment_id, dto.request_id, dto.user_id);
            return {
                success: true,
                data: assignment,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 分配用户到实验组失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async analyzeABTestResults(dto) {
        this.logger.log(`[TrainingController] 分析A/B实验结果: experimentId=${dto.experiment_id}`);
        try {
            const result = await this.abTestManager.analyzeResults(dto.experiment_id, dto.variant_metrics);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 分析A/B实验结果失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async generateExplainableOutput(dto) {
        this.logger.log(`[TrainingController] 生成可解释输出: traceId=${dto.trace_id}`);
        try {
            const explanation = await this.explainableOutput.generateExplanation(dto.decision_log, dto.evidence_refs, dto.model_version, dto.trace_id);
            const userFriendlyText = this.explainableOutput.generateUserFriendlyExplanation(explanation);
            return {
                success: true,
                data: {
                    ...explanation,
                    user_friendly_text: userFriendlyText,
                },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 生成可解释输出失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getClarificationPrompt(query) {
        try {
            const effectiveScenario = query.scenario || 'general';
            const effectiveMissingField = query.missing_field || 'travel_dates';
            const prompt = this.clarificationPromptDesigner.getPrompt(effectiveScenario, effectiveMissingField, query.language || 'en');
            if (!prompt) {
                return {
                    success: true,
                    data: {
                        scenario: effectiveScenario,
                        missing_field: effectiveMissingField,
                        prompt: `Could you please provide more information about your ${effectiveMissingField.replace('_', ' ')}?`,
                        questions: [
                            {
                                field: effectiveMissingField,
                                question: `What is your ${effectiveMissingField.replace('_', ' ')}?`,
                                type: 'text',
                            },
                        ],
                    },
                };
            }
            return {
                success: true,
                data: prompt,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取追问话术失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getRiskPrompt(query) {
        try {
            const effectiveSevLevel = query.sev_level || 'SEV-2';
            const effectiveCategory = query.category || 'SAFETY';
            const effectiveReason = query.reason || 'general_risk';
            const prompt = this.riskPromptDesigner.getPrompt(effectiveSevLevel, effectiveCategory, effectiveReason, query.language || 'en');
            if (!prompt) {
                return {
                    success: true,
                    data: {
                        sev_level: effectiveSevLevel,
                        category: effectiveCategory,
                        title: `⚠️ ${effectiveCategory} Warning`,
                        message: `A ${effectiveSevLevel} ${effectiveCategory.toLowerCase()} risk has been detected: ${effectiveReason}`,
                        suggestions: [
                            'Please review the risk carefully before proceeding',
                            'Consider alternative options if available',
                        ],
                        action_required: effectiveSevLevel === 'SEV-1',
                    },
                };
            }
            return {
                success: true,
                data: prompt,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取风险提示失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async scoreQuality(dto) {
        this.logger.log(`[TrainingController] 质量评分`);
        try {
            const result = await this.qualityScorer.score(dto.plan, dto.user_request, dto.evidence, dto.decision_log, dto.use_rm || false);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 质量评分失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async trainRewardModel(dto) {
        this.logger.log(`[TrainingController] 训练Reward Model: type=${dto.training_type}`);
        try {
            let result;
            if (dto.training_type === 'PREFERENCE_COMPARISON') {
                result = await this.rewardModelTrainer.trainWithPreferenceComparison(dto.data, dto.config);
            }
            else {
                result = await this.rewardModelTrainer.trainWithScoreRegression(dto.data, dto.config);
            }
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 训练Reward Model失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getRedLineRules(dto = {}) {
        try {
            const rules = this.domainExpertKnowledge.getRedLineRules(dto.destination);
            return {
                success: true,
                data: rules,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取红线规则失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getSeasonalRisks(dto = {}) {
        try {
            const risks = this.domainExpertKnowledge.getSeasonalRisks(dto.destination, dto.month);
            return {
                success: true,
                data: risks,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取季节性风险失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getBaselineRewards(baselineVersion, trajectories) {
        const baselineRewards = new Map();
        if (!baselineVersion) {
            for (const trajectory of trajectories) {
                baselineRewards.set(trajectory.trajectory_id, trajectory.metadata.total_reward || 0);
            }
            return baselineRewards;
        }
        try {
            const baselineTrajectories = await this.etlService.extractTrajectories({
                model_version: baselineVersion,
                trajectory_ids: trajectories.map((t) => t.trajectory_id),
                limit: trajectories.length,
            });
            for (const trajectory of baselineTrajectories) {
                baselineRewards.set(trajectory.trajectory_id, trajectory.metadata.total_reward || 0);
            }
            for (const trajectory of trajectories) {
                if (!baselineRewards.has(trajectory.trajectory_id)) {
                    baselineRewards.set(trajectory.trajectory_id, trajectory.metadata.total_reward || 0);
                }
            }
        }
        catch (error) {
            this.logger.warn(`[TrainingController] 获取baseline rewards失败，使用当前rewards: ${error === null || error === void 0 ? void 0 : error.message}`);
            for (const trajectory of trajectories) {
                baselineRewards.set(trajectory.trajectory_id, trajectory.metadata.total_reward || 0);
            }
        }
        return baselineRewards;
    }
    async getRollMetrics() {
        if (!this.rollMonitoring) {
            return {
                success: false,
                error: 'ROLL 监控未启用',
            };
        }
        try {
            const metrics = await this.rollMonitoring.getMetrics();
            return { success: true, data: metrics };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取 ROLL 指标失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async getRollWorkersStatus() {
        if (!this.rollMonitoring) {
            return {
                success: false,
                error: 'ROLL 监控未启用',
            };
        }
        try {
            const status = await this.rollMonitoring.getWorkersStatus();
            return { success: true, data: status };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取 ROLL Workers 状态失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async getRollHealth() {
        if (!this.rollMonitoring) {
            return {
                success: false,
                status: 'unhealthy',
                error: 'ROLL 监控未启用',
            };
        }
        try {
            const health = await this.rollMonitoring.checkHealth();
            return {
                success: health.status === 'healthy',
                status: health.status,
                details: health.details,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] ROLL 健康检查失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                success: false,
                status: 'unhealthy',
                error: error.message,
            };
        }
    }
    async createRollABTestExperiment(dto) {
        if (!this.rollABTest) {
            return {
                success: false,
                error: 'ROLL A/B 测试未启用',
            };
        }
        try {
            const result = await this.rollABTest.createRollExperiment(dto.name, dto.description, dto.variants, dto.success_metrics);
            return result;
        }
        catch (error) {
            this.logger.error(`[TrainingController] 创建 ROLL A/B 测试实验失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async analyzeRollABTestResults(dto) {
        if (!this.rollABTest) {
            return {
                success: false,
                error: 'ROLL A/B 测试未启用',
            };
        }
        try {
            const result = await this.rollABTest.analyzeRollResults(dto.experiment_id, dto.variant_metrics);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 分析 ROLL A/B 测试结果失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async shouldUseRoll(experimentId, requestId, userId) {
        if (!this.rollABTest) {
            return {
                success: true,
                data: { shouldUse: false, reason: 'ROLL AB Test service not available' },
            };
        }
        try {
            const result = await this.rollABTest.shouldUseRoll(experimentId, requestId, userId);
            return {
                success: true,
                data: { shouldUse: result.useRoll, reason: result.useRoll ? 'Assigned to ROLL variant' : 'Assigned to control' },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 检查 ROLL 使用失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                success: false,
                data: { shouldUse: false, reason: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error' },
            };
        }
    }
    async executeWorkflow(dto) {
        if (!this.iterativeDeploymentWorkflow) {
            return {
                success: false,
                data: { message: 'Iterative deployment workflow service not available' },
            };
        }
        try {
            const result = await this.iterativeDeploymentWorkflow.executeWorkflow(dto);
            return {
                success: result.status === 'SUCCESS',
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 执行工作流失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async getWorkflowStatus(workflowId) {
        if (!this.iterativeDeploymentWorkflow) {
            return {
                success: false,
                data: { message: 'Iterative deployment workflow service not available' },
            };
        }
        try {
            const status = await this.iterativeDeploymentWorkflow.getWorkflowStatus(workflowId);
            return {
                success: true,
                data: status,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 获取工作流状态失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async createModelVersionExperiment(dto) {
        if (!this.modelABTest) {
            return {
                success: false,
                data: { message: 'Model AB Test service not available' },
            };
        }
        try {
            const result = await this.modelABTest.createModelVersionExperiment(dto);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 创建模型版本实验失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async analyzeModelVersionComparison(dto) {
        if (!this.modelABTest) {
            return {
                success: false,
                data: { message: 'Model AB Test service not available' },
            };
        }
        try {
            const result = await this.modelABTest.analyzeModelVersionComparison(dto.experimentId, dto.controlVersion, dto.treatmentVersion);
            return {
                success: true,
                data: result,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 分析模型版本对比失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async promoteModelVersion(dto) {
        if (!this.modelABTest) {
            return {
                success: false,
                data: { message: 'Model AB Test service not available' },
            };
        }
        try {
            await this.modelABTest.promoteModelVersion(dto.experimentId, dto.treatmentVersion);
            return {
                success: true,
                data: {
                    message: '模型版本已推广',
                    productionVersion: dto.treatmentVersion,
                },
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 推广模型版本失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async checkShouldUseRoll(experimentId, requestId, userId) {
        if (!this.rollABTest) {
            return {
                success: false,
                error: 'ROLL A/B 测试未启用',
            };
        }
        try {
            const result = await this.rollABTest.shouldUseRoll(experimentId, requestId, userId);
            return {
                success: true,
                use_roll: result.useRoll,
                variant_id: result.variantId,
                roll_config: result.rollConfig,
            };
        }
        catch (error) {
            this.logger.error(`[TrainingController] 检查 ROLL 使用状态失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                success: false,
                error: error.message,
            };
        }
    }
};
exports.TrainingController = TrainingController;
__decorate([
    (0, common_1.Post)('trajectories/collect'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '收集规划轨迹' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '轨迹收集成功',
        type: trajectory_dto_1.CollectTrajectoryResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [trajectory_dto_1.CollectTrajectoryDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "collectTrajectory", null);
__decorate([
    (0, common_1.Post)('trajectories/:trajectoryId/validate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '验证轨迹质量' }),
    (0, swagger_1.ApiParam)({ name: 'trajectoryId', description: '轨迹ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '验证成功',
        type: trajectory_dto_1.ValidateTrajectoryResponseDto,
    }),
    __param(0, (0, common_1.Param)('trajectoryId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, trajectory_dto_1.ValidateTrajectoryDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "validateTrajectory", null);
__decorate([
    (0, common_1.Get)('trajectories/by-request/:requestId'),
    (0, swagger_1.ApiOperation)({ summary: '根据请求ID查找轨迹' }),
    (0, swagger_1.ApiParam)({ name: 'requestId', description: '请求ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '查找成功',
    }),
    __param(0, (0, common_1.Param)('requestId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "findTrajectoryByRequestId", null);
__decorate([
    (0, common_1.Post)('batches/prepare'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '准备训练批次（筛选高质量轨迹）' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '训练批次准备成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "prepareTrainingBatch", null);
__decorate([
    (0, common_1.Post)('batches/:batchId/mark-used'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '标记训练批次中的轨迹为已使用' }),
    (0, swagger_1.ApiParam)({ name: 'batchId', description: '批次ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '标记成功',
    }),
    __param(0, (0, common_1.Param)('batchId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "markBatchAsUsed", null);
__decorate([
    (0, common_1.Post)('batches/:batchId/export/jsonl'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '导出训练批次为 JSONL 格式' }),
    (0, swagger_1.ApiParam)({ name: 'batchId', description: '批次ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '导出成功',
    }),
    __param(0, (0, common_1.Param)('batchId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "exportBatchToJSONL", null);
__decorate([
    (0, common_1.Post)('batches/:batchId/export/json'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '导出训练批次为 JSON 格式' }),
    (0, swagger_1.ApiParam)({ name: 'batchId', description: '批次ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '导出成功',
    }),
    __param(0, (0, common_1.Param)('batchId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "exportBatchToJSON", null);
__decorate([
    (0, common_1.Get)('metrics/collection-stats'),
    (0, swagger_1.ApiOperation)({ summary: '获取轨迹收集统计' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '统计成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getCollectionStats", null);
__decorate([
    (0, common_1.Get)('metrics/training-quality'),
    (0, swagger_1.ApiOperation)({ summary: '获取训练数据质量指标' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '指标获取成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getTrainingQuality", null);
__decorate([
    (0, common_1.Post)('batches/process-async'),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    (0, swagger_1.ApiOperation)({ summary: '创建异步批量处理任务' }),
    (0, swagger_1.ApiResponse)({
        status: 202,
        description: '任务已创建，正在异步处理',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [training_dto_1.CreateBatchTaskDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "createBatchTask", null);
__decorate([
    (0, common_1.Get)('batches/tasks/:taskId'),
    (0, swagger_1.ApiOperation)({ summary: '获取批量处理任务状态' }),
    (0, swagger_1.ApiParam)({ name: 'taskId', description: '任务ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '任务状态',
    }),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getTaskStatus", null);
__decorate([
    (0, common_1.Get)('batches/tasks'),
    (0, swagger_1.ApiOperation)({ summary: '获取所有批量处理任务' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '任务列表',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getAllTasks", null);
__decorate([
    (0, common_1.Get)('monitoring/collapse-risk'),
    (0, swagger_1.ApiOperation)({ summary: '检测 Model Collapse 风险' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '风险检测成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "detectCollapseRisk", null);
__decorate([
    (0, common_1.Get)('analysis/quality'),
    (0, swagger_1.ApiOperation)({ summary: '分析训练数据质量' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '质量分析成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "analyzeQuality", null);
__decorate([
    (0, common_1.Post)('etl/extract'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '抽取轨迹数据并转换为RL格式' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '轨迹抽取成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "extractTrajectories", null);
__decorate([
    (0, common_1.Post)('etl/export'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '导出轨迹数据集为文件（JSONL/JSON/Parquet）' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '导出成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "exportTrajectories", null);
__decorate([
    (0, common_1.Post)('quality/check'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '检查轨迹数据质量' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '质量检查成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "checkDataQuality", null);
__decorate([
    (0, common_1.Post)('versions/create'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '创建数据集版本' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '版本创建成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "createDatasetVersion", null);
__decorate([
    (0, common_1.Get)('versions/:version'),
    (0, swagger_1.ApiOperation)({ summary: '获取指定数据集版本' }),
    (0, swagger_1.ApiParam)({ name: 'version', description: '版本号（如v1.0.0）' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取版本成功',
    }),
    __param(0, (0, common_1.Param)('version')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getDatasetVersion", null);
__decorate([
    (0, common_1.Get)('versions'),
    (0, swagger_1.ApiOperation)({ summary: '列出所有数据集版本' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '列出版本成功',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "listDatasetVersions", null);
__decorate([
    (0, common_1.Get)('versions/:version1/compare/:version2'),
    (0, swagger_1.ApiOperation)({ summary: '对比两个数据集版本' }),
    (0, swagger_1.ApiParam)({ name: 'version1', description: '版本1' }),
    (0, swagger_1.ApiParam)({ name: 'version2', description: '版本2' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '对比成功',
    }),
    __param(0, (0, common_1.Param)('version1')),
    __param(1, (0, common_1.Param)('version2')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "compareVersions", null);
__decorate([
    (0, common_1.Post)('jobs'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '创建训练任务' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '训练任务创建成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "createTrainingJob", null);
__decorate([
    (0, common_1.Post)('jobs/:jobId/start'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '启动训练任务' }),
    (0, swagger_1.ApiParam)({ name: 'jobId', description: '训练任务ID' }),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "startTraining", null);
__decorate([
    (0, common_1.Get)('options/all'),
    (0, swagger_1.ApiOperation)({ summary: '获取所有枚举选项' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getAllEnumOptions", null);
__decorate([
    (0, common_1.Get)('options/:enumKey'),
    (0, swagger_1.ApiOperation)({ summary: '获取指定枚举选项' }),
    (0, swagger_1.ApiParam)({
        name: 'enumKey',
        description: '枚举键名',
        enum: ['modelType', 'baseModel', 'trainingStatus', 'trainingType', 'sevLevel', 'riskCategory', 'riskHandleAction', 'riskEventStatus', 'constraintType', 'constraintSeverity', 'constraintAction', 'userActionType', 'decisionType', 'decisionResult', 'evidenceType', 'visualizationType', 'language', 'season', 'timeRange', 'dangerLevel', 'executability', 'riskType', 'incidentType', 'trendType', 'sortOrder']
    }),
    __param(0, (0, common_1.Param)('enumKey')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getEnumOptions", null);
__decorate([
    (0, common_1.Get)('jobs/:jobId'),
    (0, swagger_1.ApiOperation)({ summary: '获取训练任务状态' }),
    (0, swagger_1.ApiParam)({ name: 'jobId', description: '训练任务ID' }),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getTrainingJobStatus", null);
__decorate([
    (0, common_1.Get)('jobs'),
    (0, swagger_1.ApiOperation)({ summary: '列出所有训练任务' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "listTrainingJobs", null);
__decorate([
    (0, common_1.Post)('models/register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '注册模型到Model Registry' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "registerModel", null);
__decorate([
    (0, common_1.Get)('models/:version'),
    (0, swagger_1.ApiOperation)({ summary: '获取指定模型版本' }),
    (0, swagger_1.ApiParam)({ name: 'version', description: '模型版本号' }),
    __param(0, (0, common_1.Param)('version')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getModelVersion", null);
__decorate([
    (0, common_1.Get)('models'),
    (0, swagger_1.ApiOperation)({ summary: '列出所有模型版本' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "listModelVersions", null);
__decorate([
    (0, common_1.Post)('models/:version/rollback'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '回滚模型到指定版本' }),
    (0, swagger_1.ApiParam)({ name: 'version', description: '目标版本号' }),
    __param(0, (0, common_1.Param)('version')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "rollbackModel", null);
__decorate([
    (0, common_1.Post)('policy/predict'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'PolicyService策略推理' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "policyPredict", null);
__decorate([
    (0, common_1.Get)('policy/health'),
    (0, swagger_1.ApiOperation)({ summary: 'PolicyService健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "policyHealthCheck", null);
__decorate([
    (0, common_1.Get)('policy/metrics'),
    (0, swagger_1.ApiOperation)({ summary: '获取PolicyService指标' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "policyMetrics", null);
__decorate([
    (0, common_1.Post)('policy/deploy'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '部署模型到PolicyService' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "deployPolicyModel", null);
__decorate([
    (0, common_1.Post)('evaluation/router'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '评测Router组件' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "evaluateRouter", null);
__decorate([
    (0, common_1.Post)('evaluation/gate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '评测Gate组件' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "evaluateGate", null);
__decorate([
    (0, common_1.Post)('evaluation/itinerary'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '评测Itinerary组件' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "evaluateItinerary", null);
__decorate([
    (0, common_1.Post)('evaluation/full-pipeline'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '评测完整流程' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "evaluateFullPipeline", null);
__decorate([
    (0, common_1.Post)('evaluation/ope/report'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '生成OPE报告' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "generateOPEReport", null);
__decorate([
    (0, common_1.Post)('evaluation/replay/compare'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '回放对照：对比baseline和新策略' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "replayCompare", null);
__decorate([
    (0, common_1.Post)('evaluation/regression-gate/check'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '检查回归门槛' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "checkRegressionGate", null);
__decorate([
    (0, common_1.Post)('safety/constraints/check'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '检查规划约束' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "checkConstraints", null);
__decorate([
    (0, common_1.Post)('safety/risk-events/classify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '分级风险事件' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [training_dto_1.ClassifyRiskEventDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "classifyRiskEvent", null);
__decorate([
    (0, common_1.Post)('safety/risk-events/:eventId/handle'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '处置风险事件' }),
    (0, swagger_1.ApiParam)({ name: 'eventId', description: '风险事件ID' }),
    __param(0, (0, common_1.Param)('eventId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "handleRiskEvent", null);
__decorate([
    (0, common_1.Post)('safety/compliance/audit/record'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '记录决策审计信息' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "recordAudit", null);
__decorate([
    (0, common_1.Get)('safety/compliance/audit/report'),
    (0, swagger_1.ApiOperation)({ summary: '获取合规审计报告列表' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('period_start')),
    __param(3, (0, common_1.Query)('period_end')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getComplianceReportList", null);
__decorate([
    (0, common_1.Post)('safety/compliance/audit/report'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '生成合规审计报告' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "generateComplianceReport", null);
__decorate([
    (0, common_1.Post)('safety/red-team/run'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '运行安全红队测试' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "runRedTeamTests", null);
__decorate([
    (0, common_1.Get)('safety/red-team/test-cases'),
    (0, swagger_1.ApiOperation)({ summary: '列出安全红队测试用例' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [training_dto_1.ListRedTeamTestCasesDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "listRedTeamTestCases", null);
__decorate([
    (0, common_1.Post)('product/reward/calculate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '计算Reward' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "calculateReward", null);
__decorate([
    (0, common_1.Post)('product/feedback/track-action'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '追踪用户行为' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [training_dto_1.TrackUserActionDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "trackUserAction", null);
__decorate([
    (0, common_1.Post)('product/feedback/collect'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '收集用户反馈' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "collectFeedback", null);
__decorate([
    (0, common_1.Post)('product/feedback/analyze'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '分析用户反馈' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "analyzeFeedback", null);
__decorate([
    (0, common_1.Post)('product/ab-test/create'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '创建A/B实验' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "createABTest", null);
__decorate([
    (0, common_1.Post)('product/ab-test/assign'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '分配用户到实验组' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "assignToGroup", null);
__decorate([
    (0, common_1.Post)('product/ab-test/analyze'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '分析A/B实验结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "analyzeABTestResults", null);
__decorate([
    (0, common_1.Post)('product/explainable/generate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '生成可解释输出' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "generateExplainableOutput", null);
__decorate([
    (0, common_1.Get)('enhancement/clarification-prompt'),
    (0, swagger_1.ApiOperation)({ summary: '获取追问话术模板' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [training_dto_1.GetClarificationPromptDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getClarificationPrompt", null);
__decorate([
    (0, common_1.Get)('enhancement/risk-prompt'),
    (0, swagger_1.ApiOperation)({ summary: '获取风险提示模板' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [training_dto_1.GetRiskPromptDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getRiskPrompt", null);
__decorate([
    (0, common_1.Post)('enhancement/quality/score'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '质量评分（LLM Judge + RM）' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "scoreQuality", null);
__decorate([
    (0, common_1.Post)('enhancement/rm/train'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '训练Reward Model' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "trainRewardModel", null);
__decorate([
    (0, common_1.Get)('enhancement/domain-expert/red-line-rules'),
    (0, swagger_1.ApiOperation)({ summary: '获取红线规则' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [training_dto_1.GetRedLineRulesDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getRedLineRules", null);
__decorate([
    (0, common_1.Get)('enhancement/domain-expert/seasonal-risks'),
    (0, swagger_1.ApiOperation)({ summary: '获取季节性风险' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getSeasonalRisks", null);
__decorate([
    (0, common_1.Get)('roll/metrics'),
    (0, swagger_1.ApiOperation)({ summary: '获取 ROLL 架构监控指标' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'ROLL 监控指标' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getRollMetrics", null);
__decorate([
    (0, common_1.Get)('roll/workers/status'),
    (0, swagger_1.ApiOperation)({ summary: '获取 ROLL Workers 状态' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Workers 状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getRollWorkersStatus", null);
__decorate([
    (0, common_1.Get)('roll/health'),
    (0, swagger_1.ApiOperation)({ summary: 'ROLL 架构健康检查' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '健康状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getRollHealth", null);
__decorate([
    (0, common_1.Post)('roll/ab-test/create'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '创建 ROLL A/B 测试实验',
        description: '创建一个新的 A/B 测试实验，用于对比 ROLL Workers 和基线实现的性能',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '实验创建成功',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                experimentId: { type: 'string', example: 'exp_roll_001' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'ROLL A/B 测试未启用或参数无效' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "createRollABTestExperiment", null);
__decorate([
    (0, common_1.Post)('roll/ab-test/analyze'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '分析 ROLL A/B 测试结果',
        description: '分析指定实验的 ROLL vs 基线性能对比结果，需要提供各变体的指标数据',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '分析成功',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'object',
                    properties: {
                        experimentId: { type: 'string' },
                        rollVsBaseline: {
                            type: 'object',
                            properties: {
                                roll_variant: { type: 'object' },
                                baseline_variant: { type: 'object' },
                                improvement: {
                                    type: 'object',
                                    properties: {
                                        success_rate: { type: 'number', example: 0.05 },
                                        avg_reward: { type: 'number', example: 0.12 },
                                        avg_latency: { type: 'number', example: 50 },
                                    },
                                },
                            },
                        },
                        recommendation: { type: 'string', example: 'ROLL 变体表现更好，建议逐步扩大流量' },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'ROLL A/B 测试未启用或参数无效' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "analyzeRollABTestResults", null);
__decorate([
    (0, common_1.Get)('roll/ab-test/should-use'),
    (0, swagger_1.ApiOperation)({ summary: '检查是否应该使用 ROLL' }),
    __param(0, (0, common_1.Query)('experimentId')),
    __param(1, (0, common_1.Query)('requestId')),
    __param(2, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "shouldUseRoll", null);
__decorate([
    (0, common_1.Post)('workflows/execute'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '执行迭代部署工作流' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                minScore: { type: 'number', description: '最小验证分数', default: 0.8 },
                minReward: { type: 'number', description: '最小 reward', default: 0 },
                batchSize: { type: 'number', description: '批次大小', default: 1000 },
                modelConfig: { type: 'object', description: '模型配置' },
                trainingConfig: { type: 'object', description: '训练配置' },
                autoDeploy: { type: 'boolean', description: '是否自动部署', default: false },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "executeWorkflow", null);
__decorate([
    (0, common_1.Get)('workflows/:workflowId'),
    (0, swagger_1.ApiOperation)({ summary: '获取工作流状态' }),
    (0, swagger_1.ApiParam)({ name: 'workflowId', description: '工作流 ID' }),
    __param(0, (0, common_1.Param)('workflowId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getWorkflowStatus", null);
__decorate([
    (0, common_1.Post)('models/ab-test/create'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '创建模型版本对比实验' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: '实验名称' },
                description: { type: 'string', description: '实验描述' },
                controlVersion: { type: 'string', description: '对照组版本' },
                treatmentVersion: { type: 'string', description: '实验组版本' },
                trafficSplit: {
                    type: 'object',
                    properties: {
                        control: { type: 'number', description: '对照组流量百分比' },
                        treatment: { type: 'number', description: '实验组流量百分比' },
                    },
                },
                successMetrics: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '成功指标',
                },
                minSampleSize: { type: 'number', description: '最小样本量' },
                durationDays: { type: 'number', description: '实验持续时间（天）' },
            },
            required: ['name', 'description', 'controlVersion', 'treatmentVersion', 'successMetrics'],
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "createModelVersionExperiment", null);
__decorate([
    (0, common_1.Post)('models/ab-test/analyze'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '分析模型版本对比结果' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                experimentId: { type: 'string', description: '实验 ID' },
                controlVersion: { type: 'string', description: '对照组版本' },
                treatmentVersion: { type: 'string', description: '实验组版本' },
            },
            required: ['experimentId', 'controlVersion', 'treatmentVersion'],
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "analyzeModelVersionComparison", null);
__decorate([
    (0, common_1.Post)('models/ab-test/promote'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '推广模型版本（如果 A/B 测试通过）' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                experimentId: { type: 'string', description: '实验 ID' },
                treatmentVersion: { type: 'string', description: '要推广的版本' },
            },
            required: ['experimentId', 'treatmentVersion'],
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "promoteModelVersion", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: '检查是否应使用 ROLL Workers',
        description: '根据实验分配判断指定请求/用户是否应该使用 ROLL Workers',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '检查结果',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                use_roll: { type: 'boolean', example: true },
                variant_id: { type: 'string', example: 'variant_roll_1' },
                roll_config: {
                    type: 'object',
                    properties: {
                        use_policy_worker: { type: 'boolean' },
                        use_reward_worker: { type: 'boolean' },
                        use_trajectory_worker: { type: 'boolean' },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'ROLL A/B 测试未启用' }),
    __param(0, (0, common_1.Query)('experiment_id')),
    __param(1, (0, common_1.Query)('request_id')),
    __param(2, (0, common_1.Query)('user_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "checkShouldUseRoll", null);
exports.TrainingController = TrainingController = TrainingController_1 = __decorate([
    (0, swagger_1.ApiTags)('training'),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('training'),
    __param(33, (0, common_1.Optional)()),
    __param(34, (0, common_1.Optional)()),
    __param(35, (0, common_1.Optional)()),
    __param(36, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [trajectory_collection_service_1.TrajectoryCollectionService,
        trajectory_validator_service_1.TrajectoryValidatorService,
        training_data_preparation_service_1.TrainingDataPreparationService,
        trajectory_etl_service_1.TrajectoryETLService,
        data_quality_checker_service_1.DataQualityCheckerService,
        dataset_version_manager_service_1.DatasetVersionManagerService,
        training_pipeline_service_1.TrainingPipelineService,
        model_registry_service_1.ModelRegistryService,
        policy_service_manager_service_1.PolicyServiceManagerService,
        eval_suite_service_1.EvalSuiteService,
        offline_policy_evaluator_service_1.OfflinePolicyEvaluatorService,
        replay_comparator_service_1.ReplayComparatorService,
        regression_gate_service_1.RegressionGateService,
        constraints_engine_service_1.ConstraintsEngineService,
        risk_event_manager_service_1.RiskEventManagerService,
        compliance_audit_service_1.ComplianceAuditService,
        security_red_team_service_1.SecurityRedTeamService,
        reward_definition_service_1.RewardDefinitionService,
        user_feedback_loop_service_1.UserFeedbackLoopService,
        ab_test_manager_service_1.ABTestManagerService,
        explainable_output_service_1.ExplainableOutputService,
        clarification_prompt_designer_service_1.ClarificationPromptDesignerService,
        risk_prompt_designer_service_1.RiskPromptDesignerService,
        decision_explanation_designer_service_1.DecisionExplanationDesignerService,
        domain_expert_knowledge_service_1.DomainExpertKnowledgeService,
        judge_prompt_designer_service_1.JudgePromptDesignerService,
        reward_model_trainer_service_1.RewardModelTrainerService,
        diagnostic_label_system_service_1.DiagnosticLabelSystemService,
        quality_scorer_service_1.QualityScorerService,
        training_metrics_service_1.TrainingMetricsService,
        training_batch_processor_service_1.TrainingBatchProcessorService,
        model_collapse_monitor_service_1.ModelCollapseMonitorService,
        training_quality_analyzer_service_1.TrainingQualityAnalyzerService,
        roll_monitoring_service_1.RollMonitoringService,
        roll_ab_test_service_1.RollABTestService,
        iterative_deployment_workflow_service_1.IterativeDeploymentWorkflowService,
        model_ab_test_service_1.ModelABTestService])
], TrainingController);
//# sourceMappingURL=training.controller.js.map