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
var IterativeDeploymentWorkflowService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IterativeDeploymentWorkflowService = void 0;
const common_1 = require("@nestjs/common");
const trajectory_collection_service_1 = require("./trajectory-collection.service");
const trajectory_validator_service_1 = require("./trajectory-validator.service");
const reward_signal_extractor_service_1 = require("./reward-signal-extractor.service");
const training_data_preparation_service_1 = require("./training-data-preparation.service");
const training_pipeline_service_1 = require("./training-pipeline.service");
const model_registry_service_1 = require("./model-registry.service");
const eval_suite_service_1 = require("./eval-suite.service");
const regression_gate_service_1 = require("./regression-gate.service");
const replay_comparator_service_1 = require("./replay-comparator.service");
const trajectory_etl_service_1 = require("./trajectory-etl.service");
let IterativeDeploymentWorkflowService = IterativeDeploymentWorkflowService_1 = class IterativeDeploymentWorkflowService {
    constructor(trajectoryCollection, trajectoryValidator, rewardExtractor, dataPrep, trainingPipeline, modelRegistry, evalSuite, regressionGate, replayComparator, trajectoryETL) {
        this.trajectoryCollection = trajectoryCollection;
        this.trajectoryValidator = trajectoryValidator;
        this.rewardExtractor = rewardExtractor;
        this.dataPrep = dataPrep;
        this.trainingPipeline = trainingPipeline;
        this.modelRegistry = modelRegistry;
        this.evalSuite = evalSuite;
        this.regressionGate = regressionGate;
        this.replayComparator = replayComparator;
        this.trajectoryETL = trajectoryETL;
        this.logger = new common_1.Logger(IterativeDeploymentWorkflowService_1.name);
    }
    async executeWorkflow(options) {
        var _a, _b;
        const workflowId = `workflow_${Date.now()}`;
        const steps = [];
        this.logger.log(`[IterativeDeployment] 开始执行工作流: workflowId=${workflowId}`);
        try {
            this.logger.log(`[IterativeDeployment] 步骤 1: 准备训练数据`);
            const trainingBatch = await this.dataPrep.prepareTrainingBatch({
                minScore: options.minScore || 0.8,
                minReward: options.minReward || 0,
                batchSize: options.batchSize || 1000,
            });
            if (trainingBatch.trajectories.length === 0) {
                this.logger.warn(`[IterativeDeployment] 没有符合条件的训练数据，工作流终止`);
                steps.push({
                    step: 'prepare_training_data',
                    status: 'SKIPPED',
                    result: { reason: 'No qualified trajectories' },
                });
                return {
                    workflowId,
                    status: 'BLOCKED',
                    steps,
                };
            }
            steps.push({
                step: 'prepare_training_data',
                status: 'SUCCESS',
                result: {
                    batchId: trainingBatch.batchId,
                    trajectoryCount: trainingBatch.trajectories.length,
                    stats: trainingBatch.stats,
                },
            });
            this.logger.log(`[IterativeDeployment] 步骤 2: 创建训练任务`);
            const trainingJob = await this.trainingPipeline.createTrainingJob(trainingBatch.batchId, options.modelConfig || {
                model_type: 'claude-3-5-sonnet',
                provider: 'anthropic',
            }, options.trainingConfig || {
                learning_rate: 0.0001,
                num_epochs: 3,
                batch_size: 32,
            });
            steps.push({
                step: 'create_training_job',
                status: 'SUCCESS',
                result: { jobId: trainingJob.job_id },
            });
            this.logger.log(`[IterativeDeployment] 步骤 3: 启动训练`);
            const startedJob = await this.trainingPipeline.startTraining(trainingJob.job_id);
            steps.push({
                step: 'start_training',
                status: 'SUCCESS',
                result: {
                    jobId: startedJob.job_id,
                    rayJobId: startedJob.ray_job_id,
                    mlflowRunId: startedJob.mlflow_run_id,
                },
            });
            this.logger.log(`[IterativeDeployment] 步骤 4: 等待训练完成`);
            let completedJob = startedJob;
            let attempts = 0;
            const maxAttempts = 120;
            while (completedJob.status === 'RUNNING' && attempts < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 5000));
                completedJob = await this.trainingPipeline.getTrainingJobStatus(completedJob.job_id);
                attempts++;
            }
            if (completedJob.status !== 'COMPLETED') {
                this.logger.error(`[IterativeDeployment] 训练未完成: status=${completedJob.status}, jobId=${completedJob.job_id}`);
                steps.push({
                    step: 'wait_training_complete',
                    status: 'FAILED',
                    error: `Training status: ${completedJob.status}`,
                });
                return {
                    workflowId,
                    status: 'FAILED',
                    steps,
                };
            }
            steps.push({
                step: 'wait_training_complete',
                status: 'SUCCESS',
                result: {
                    modelVersion: (_a = completedJob.model_version) === null || _a === void 0 ? void 0 : _a.version,
                    trainingMetrics: (_b = completedJob.model_version) === null || _b === void 0 ? void 0 : _b.training_metrics,
                },
            });
            if (!completedJob.model_version) {
                this.logger.error(`[IterativeDeployment] 训练完成但未生成模型版本`);
                return {
                    workflowId,
                    status: 'FAILED',
                    steps,
                };
            }
            const modelVersion = completedJob.model_version;
            this.logger.log(`[IterativeDeployment] 步骤 5: 注册模型`);
            const registryEntry = await this.modelRegistry.registerModel(modelVersion);
            steps.push({
                step: 'register_model',
                status: 'SUCCESS',
                result: {
                    version: registryEntry.version,
                    mlflowModelUri: registryEntry.mlflow_model_uri,
                },
            });
            this.logger.log(`[IterativeDeployment] 步骤 6: 评估模型`);
            const evalResults = await this.evalSuite.evaluateFullPipeline(modelVersion.version);
            steps.push({
                step: 'evaluate_model',
                status: 'SUCCESS',
                result: evalResults,
            });
            const baselineVersion = this.modelRegistry.getCurrentProductionVersion() || 'v1.0.0';
            const trajectoryIds = trainingBatch.trajectories
                .slice(0, Math.min(100, trainingBatch.trajectories.length))
                .map((t) => t.trajectoryId);
            const comparisonTrajectories = await this.trajectoryETL.extractTrajectories({
                trajectory_ids: trajectoryIds,
                limit: 100,
            });
            const comparisonResult = await this.replayComparator.compareResults(baselineVersion, modelVersion.version, comparisonTrajectories);
            this.logger.log(`[IterativeDeployment] 步骤 7: 回归门控检查`);
            const gateResult = await this.regressionGate.checkRegression(modelVersion.version, baselineVersion, comparisonResult);
            if (!gateResult.passed) {
                this.logger.warn(`[IterativeDeployment] 回归门控未通过: ${gateResult.recommendation.reasoning}`);
                steps.push({
                    step: 'regression_gate',
                    status: 'FAILED',
                    result: gateResult,
                });
                return {
                    workflowId,
                    status: 'BLOCKED',
                    steps,
                    modelVersion: modelVersion.version,
                };
            }
            steps.push({
                step: 'regression_gate',
                status: 'SUCCESS',
                result: gateResult,
            });
            if (options.autoDeploy) {
                this.logger.log(`[IterativeDeployment] 步骤 8: 部署模型`);
                await this.modelRegistry.setProductionVersion(modelVersion.version);
                steps.push({
                    step: 'deploy_model',
                    status: 'SUCCESS',
                    result: { productionVersion: modelVersion.version },
                });
            }
            else {
                steps.push({
                    step: 'deploy_model',
                    status: 'SKIPPED',
                    result: { reason: 'autoDeploy is false' },
                });
            }
            await this.dataPrep.markAsUsed(trainingBatch.trajectories.map((t) => t.trajectoryId), trainingBatch.batchId);
            this.logger.log(`[IterativeDeployment] 工作流执行成功: workflowId=${workflowId}`);
            return {
                workflowId,
                status: 'SUCCESS',
                steps,
                modelVersion: modelVersion.version,
            };
        }
        catch (error) {
            this.logger.error(`[IterativeDeployment] 工作流执行失败: workflowId=${workflowId}, error=${error === null || error === void 0 ? void 0 : error.message}`, error.stack);
            steps.push({
                step: 'workflow_error',
                status: 'FAILED',
                error: error.message,
            });
            return {
                workflowId,
                status: 'FAILED',
                steps,
            };
        }
    }
    async getWorkflowStatus(workflowId) {
        this.logger.warn(`[IterativeDeployment] getWorkflowStatus 未实现状态存储`);
        return {
            workflowId,
            status: 'RUNNING',
            steps: [],
        };
    }
};
exports.IterativeDeploymentWorkflowService = IterativeDeploymentWorkflowService;
exports.IterativeDeploymentWorkflowService = IterativeDeploymentWorkflowService = IterativeDeploymentWorkflowService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [trajectory_collection_service_1.TrajectoryCollectionService,
        trajectory_validator_service_1.TrajectoryValidatorService,
        reward_signal_extractor_service_1.RewardSignalExtractorService,
        training_data_preparation_service_1.TrainingDataPreparationService,
        training_pipeline_service_1.TrainingPipelineService,
        model_registry_service_1.ModelRegistryService,
        eval_suite_service_1.EvalSuiteService,
        regression_gate_service_1.RegressionGateService,
        replay_comparator_service_1.ReplayComparatorService,
        trajectory_etl_service_1.TrajectoryETLService])
], IterativeDeploymentWorkflowService);
//# sourceMappingURL=iterative-deployment-workflow.service.js.map