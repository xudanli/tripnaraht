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
var FineTuneService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FineTuneService = exports.TrainingStatus = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const prisma_service_1 = require("../../../prisma/prisma.service");
var TrainingStatus;
(function (TrainingStatus) {
    TrainingStatus["PENDING"] = "pending";
    TrainingStatus["RUNNING"] = "running";
    TrainingStatus["COMPLETED"] = "completed";
    TrainingStatus["FAILED"] = "failed";
    TrainingStatus["CANCELLED"] = "cancelled";
})(TrainingStatus || (exports.TrainingStatus = TrainingStatus = {}));
let FineTuneService = FineTuneService_1 = class FineTuneService {
    constructor(configService, httpService, prisma) {
        this.configService = configService;
        this.httpService = httpService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(FineTuneService_1.name);
        this.defaultConfig = {
            model_name: 'Qwen/Qwen2.5-7B-Instruct',
            lora_rank: 64,
            lora_alpha: 128,
            learning_rate: 2e-4,
            num_epochs: 3,
            batch_size: 2,
            dataset_name: 'tripnara_decision',
        };
        this.trainServiceUrl = this.configService.get('TRAIN_SERVICE_URL') || 'http://localhost:8000';
    }
    async onModuleInit() {
        this.logger.log(`FineTuneService initialized, train service: ${this.trainServiceUrl}`);
        const healthy = await this.checkTrainServiceHealth();
        if (healthy) {
            this.logger.log('Training service is healthy');
        }
        else {
            this.logger.warn('Training service is not available');
        }
    }
    async checkTrainServiceHealth() {
        var _a;
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.trainServiceUrl}/health`).pipe((0, rxjs_1.timeout)(5000), (0, rxjs_1.catchError)(() => {
                throw new Error('Health check timeout');
            })));
            return ((_a = response.data) === null || _a === void 0 ? void 0 : _a.status) === 'healthy';
        }
        catch (error) {
            this.logger.warn(`Training service health check failed: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return false;
        }
    }
    async getGpuInfo() {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.trainServiceUrl}/gpu/info`).pipe((0, rxjs_1.timeout)(5000)));
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to get GPU info: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return { available: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) };
        }
    }
    async startTraining(taskId, config, resumeFromCheckpoint) {
        const finalConfig = { ...this.defaultConfig, ...config };
        this.logger.log(`Starting training task: ${taskId}`);
        this.logger.log(`Config: ${JSON.stringify(finalConfig)}`);
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.trainServiceUrl}/training/start`, {
                task_id: taskId,
                config: finalConfig,
                resume_from_checkpoint: resumeFromCheckpoint,
            }).pipe((0, rxjs_1.timeout)(30000)));
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to start training: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            throw new Error(`Failed to start training: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
        }
    }
    async getTrainingStatus(taskId) {
        var _a;
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.trainServiceUrl}/training/${taskId}`).pipe((0, rxjs_1.timeout)(10000)));
            return response.data;
        }
        catch (error) {
            if (((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) === 404) {
                return null;
            }
            this.logger.error(`Failed to get training status: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            throw error;
        }
    }
    async listTrainingTasks() {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.trainServiceUrl}/training`).pipe((0, rxjs_1.timeout)(10000)));
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to list training tasks: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return [];
        }
    }
    async cancelTraining(taskId) {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.trainServiceUrl}/training/${taskId}/cancel`).pipe((0, rxjs_1.timeout)(30000)));
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to cancel training: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            throw error;
        }
    }
    async prepareTrainingData(options) {
        const { minValidationScore = 0.85, minTotalReward = 0.5, maxUsageCount = 3, limit = 10000, } = options || {};
        this.logger.log('Preparing training data from validated trajectories...');
        const trajectories = await this.prisma.validatedTrajectory.findMany({
            where: {
                validationStatus: 'VALIDATED',
                validationScore: { gte: minValidationScore },
                totalReward: { gte: minTotalReward },
                usedForTrainingCount: { lt: maxUsageCount },
            },
            orderBy: [
                { totalReward: 'desc' },
                { validationScore: 'desc' },
            ],
            take: limit,
        });
        this.logger.log(`Found ${trajectories.length} high-quality trajectories`);
        if (trajectories.length === 0) {
            return {
                dataset_name: 'tripnara_decision',
                train_samples: 0,
                eval_samples: 0,
            };
        }
        const trainingData = [];
        for (const trajectory of trajectories) {
            const item = this.convertTrajectoryToTrainingData(trajectory);
            if (item) {
                trainingData.push(item);
            }
        }
        const shuffled = trainingData.sort(() => Math.random() - 0.5);
        const splitIndex = Math.floor(shuffled.length * 0.9);
        const trainData = shuffled.slice(0, splitIndex);
        const evalData = shuffled.slice(splitIndex);
        try {
            await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.trainServiceUrl}/datasets/upload`, {
                name: 'tripnara_decision_train',
                data: trainData,
            }).pipe((0, rxjs_1.timeout)(60000)));
            await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.trainServiceUrl}/datasets/upload`, {
                name: 'tripnara_decision_eval',
                data: evalData,
            }).pipe((0, rxjs_1.timeout)(60000)));
            const trajectoryIds = trajectories.map(t => t.id);
            await this.prisma.validatedTrajectory.updateMany({
                where: { id: { in: trajectoryIds } },
                data: { usedForTrainingCount: { increment: 1 } },
            });
            this.logger.log(`Training data prepared: ${trainData.length} train, ${evalData.length} eval`);
            return {
                dataset_name: 'tripnara_decision',
                train_samples: trainData.length,
                eval_samples: evalData.length,
            };
        }
        catch (error) {
            this.logger.error(`Failed to upload training data: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            throw error;
        }
    }
    convertTrajectoryToTrainingData(trajectory) {
        var _a;
        try {
            const plan = trajectory.plan;
            const decisionTrace = trajectory.decisionTrace;
            const researchData = trajectory.researchData;
            let userContent = '请帮我规划行程：\n';
            if (plan === null || plan === void 0 ? void 0 : plan.request) {
                const req = plan.request;
                if (req.origin)
                    userContent += `出发地：${req.origin}\n`;
                if (req.destination)
                    userContent += `目的地：${req.destination}\n`;
                if (req.start_date)
                    userContent += `出发日期：${req.start_date}\n`;
                if (req.days)
                    userContent += `天数：${req.days}天\n`;
            }
            let assistantContent = '';
            if (((_a = decisionTrace === null || decisionTrace === void 0 ? void 0 : decisionTrace.steps) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                assistantContent += '## 决策过程\n\n';
                for (const step of decisionTrace.steps) {
                    assistantContent += `### ${step.step_type}\n`;
                    if (step.result) {
                        assistantContent += `${JSON.stringify(step.result, null, 2)}\n\n`;
                    }
                }
            }
            if (plan === null || plan === void 0 ? void 0 : plan.itinerary) {
                assistantContent += '## 行程方案\n\n';
                assistantContent += JSON.stringify(plan.itinerary, null, 2);
                assistantContent += '\n\n';
            }
            if (plan === null || plan === void 0 ? void 0 : plan.explanation) {
                assistantContent += `## 决策说明\n\n${plan.explanation}\n`;
            }
            if (!assistantContent) {
                return null;
            }
            return {
                conversations: [
                    { from: 'human', value: userContent },
                    { from: 'gpt', value: assistantContent },
                ],
            };
        }
        catch (error) {
            this.logger.warn(`Failed to convert trajectory: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return null;
        }
    }
    async listTrainedModels() {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.trainServiceUrl}/models`).pipe((0, rxjs_1.timeout)(10000)));
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to list trained models: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return [];
        }
    }
    async listExperiments() {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.trainServiceUrl}/mlflow/experiments`).pipe((0, rxjs_1.timeout)(10000)));
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to list experiments: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return [];
        }
    }
    async listRuns(experimentId) {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.trainServiceUrl}/mlflow/runs/${experimentId}`).pipe((0, rxjs_1.timeout)(10000)));
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to list runs: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return [];
        }
    }
    async runFullTrainingPipeline(options) {
        const taskId = `train-${Date.now()}`;
        this.logger.log(`Starting full training pipeline: ${taskId}`);
        const dataResult = await this.prepareTrainingData({
            minValidationScore: options === null || options === void 0 ? void 0 : options.minValidationScore,
            minTotalReward: options === null || options === void 0 ? void 0 : options.minTotalReward,
        });
        if (dataResult.train_samples === 0) {
            throw new Error('No training data available');
        }
        await this.startTraining(taskId, options === null || options === void 0 ? void 0 : options.config);
        return {
            task_id: taskId,
            data_preparation: {
                train_samples: dataResult.train_samples,
                eval_samples: dataResult.eval_samples,
            },
            status: 'started',
        };
    }
};
exports.FineTuneService = FineTuneService;
exports.FineTuneService = FineTuneService = FineTuneService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService,
        prisma_service_1.PrismaService])
], FineTuneService);
//# sourceMappingURL=fine-tune.service.js.map