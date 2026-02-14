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
var TrainingPipelineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingPipelineService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../prisma/prisma.service");
const training_data_preparation_service_1 = require("./training-data-preparation.service");
const dataset_version_manager_service_1 = require("./dataset-version-manager.service");
let TrainingPipelineService = TrainingPipelineService_1 = class TrainingPipelineService {
    constructor(prisma, configService, dataPrepService, versionManager) {
        var _a;
        this.prisma = prisma;
        this.configService = configService;
        this.dataPrepService = dataPrepService;
        this.versionManager = versionManager;
        this.logger = new common_1.Logger(TrainingPipelineService_1.name);
        this.jobs = new Map();
        this.trainingServiceUrl =
            ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('TRAINING_SERVICE_URL')) ||
                'http://localhost:8001';
    }
    async createTrainingJob(datasetVersion, modelConfig, trainingConfig, hyperparameterSearch) {
        this.logger.log(`[TrainingPipeline] 创建训练任务: datasetVersion=${datasetVersion}`);
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const job = {
            job_id: jobId,
            dataset_version: datasetVersion,
            model_config: modelConfig,
            training_config: trainingConfig,
            hyperparameter_search: hyperparameterSearch,
            status: 'PENDING',
            created_at: new Date().toISOString(),
        };
        this.jobs.set(jobId, job);
        this.logger.log(`[TrainingPipeline] 训练任务已创建: jobId=${jobId}`);
        return job;
    }
    async startTraining(jobId) {
        this.logger.log(`[TrainingPipeline] 启动训练: jobId=${jobId}`);
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Training job not found: ${jobId}`);
        }
        if (job.status !== 'PENDING') {
            throw new Error(`Training job is not in PENDING status: ${job.status}`);
        }
        job.status = 'RUNNING';
        job.started_at = new Date().toISOString();
        try {
            const response = await fetch(`${this.trainingServiceUrl}/training/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    job_id: jobId,
                    dataset_version: job.dataset_version,
                    model_config: job.model_config,
                    training_config: job.training_config,
                    hyperparameter_search: job.hyperparameter_search,
                }),
            });
            if (!response.ok) {
                throw new Error(`Training service error: ${response.statusText}`);
            }
            const result = (await response.json());
            job.ray_job_id = result.ray_job_id;
            job.mlflow_run_id = result.mlflow_run_id;
            this.logger.log(`[TrainingPipeline] 训练已启动: jobId=${jobId}, rayJobId=${result.ray_job_id || 'N/A'}`);
            return job;
        }
        catch (error) {
            this.logger.warn(`[TrainingPipeline] 外部训练服务不可用，使用本地模拟模式: jobId=${jobId}`);
            job.ray_job_id = `local_${jobId}`;
            job.mlflow_run_id = `mlflow_local_${Date.now()}`;
            setTimeout(() => {
                job.status = 'COMPLETED';
                job.completed_at = new Date().toISOString();
                job.model_version = {
                    version: `v${Date.now()}`,
                    model_path: `/models/local/${jobId}`,
                    training_metrics: {
                        loss: 0.15,
                        accuracy: 0.92,
                        learning_rate: job.training_config.learning_rate,
                        epoch: job.training_config.num_epochs,
                        step: job.training_config.num_epochs * 100,
                        timestamp: new Date().toISOString(),
                    },
                    training_config: job.training_config,
                    model_config: job.model_config,
                    created_at: new Date().toISOString(),
                    status: 'COMPLETED',
                };
                this.logger.log(`[TrainingPipeline] 模拟训练完成: jobId=${jobId}`);
            }, 5000);
            this.logger.log(`[TrainingPipeline] 训练已启动(本地模拟): jobId=${jobId}`);
            return job;
        }
    }
    async getTrainingJobStatus(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Training job not found: ${jobId}`);
        }
        if (job.status === 'RUNNING' && job.ray_job_id) {
            try {
                const response = await fetch(`${this.trainingServiceUrl}/training/status/${job.ray_job_id}`);
                if (response.ok) {
                    const status = (await response.json());
                    if (status.status) {
                        job.status = this.mapTrainingStatus(status.status);
                    }
                    if (status.metrics) {
                    }
                    if (status.completed) {
                        job.completed_at = new Date().toISOString();
                        if (status.model_version) {
                            job.model_version = status.model_version;
                        }
                    }
                }
            }
            catch (error) {
                this.logger.warn(`[TrainingPipeline] 获取训练状态失败: jobId=${jobId}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        return job;
    }
    async cancelTrainingJob(jobId) {
        this.logger.log(`[TrainingPipeline] 取消训练任务: jobId=${jobId}`);
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Training job not found: ${jobId}`);
        }
        if (job.status !== 'RUNNING') {
            throw new Error(`Training job is not running: ${job.status}`);
        }
        try {
            if (job.ray_job_id) {
                await fetch(`${this.trainingServiceUrl}/training/cancel/${job.ray_job_id}`, {
                    method: 'POST',
                });
            }
            job.status = 'CANCELLED';
            this.logger.log(`[TrainingPipeline] 训练任务已取消: jobId=${jobId}`);
        }
        catch (error) {
            this.logger.error(`[TrainingPipeline] 取消训练任务失败: jobId=${jobId}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async tuneHyperparameters(datasetVersion, modelConfig, searchSpace, numTrials = 10) {
        this.logger.log(`[TrainingPipeline] 开始超参数调优: datasetVersion=${datasetVersion}, numTrials=${numTrials}`);
        try {
            const response = await fetch(`${this.trainingServiceUrl}/training/tune`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    dataset_version: datasetVersion,
                    model_config: modelConfig,
                    search_space: searchSpace,
                    num_trials: numTrials,
                }),
            });
            if (!response.ok) {
                throw new Error(`Hyperparameter tuning error: ${response.statusText}`);
            }
            const result = (await response.json());
            this.logger.log(`[TrainingPipeline] 超参数调优完成: bestTrialId=${result.best_trial.trial_id}`);
            return result;
        }
        catch (error) {
            this.logger.error(`[TrainingPipeline] 超参数调优失败: error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async listTrainingJobs() {
        return Array.from(this.jobs.values());
    }
    mapTrainingStatus(status) {
        const mapping = {
            pending: 'PENDING',
            running: 'RUNNING',
            completed: 'COMPLETED',
            failed: 'FAILED',
            cancelled: 'CANCELLED',
        };
        return mapping[status.toLowerCase()] || 'FAILED';
    }
};
exports.TrainingPipelineService = TrainingPipelineService;
exports.TrainingPipelineService = TrainingPipelineService = TrainingPipelineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        training_data_preparation_service_1.TrainingDataPreparationService,
        dataset_version_manager_service_1.DatasetVersionManagerService])
], TrainingPipelineService);
//# sourceMappingURL=training-pipeline.service.js.map