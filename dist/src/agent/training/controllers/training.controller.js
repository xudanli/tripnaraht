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
var TrainingController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../../auth/decorators/public.decorator");
const fine_tune_service_1 = require("../services/fine-tune.service");
const vllm_client_service_1 = require("../services/vllm-client.service");
const llm_judge_client_service_1 = require("../services/llm-judge-client.service");
class StartTrainingDto {
}
class GenerateDto {
}
class ScorePlanDto {
}
class ComparePlansDto {
}
class EvaluateLoraDto {
}
let TrainingController = TrainingController_1 = class TrainingController {
    constructor(fineTuneService, vllmClientService, llmJudgeClientService) {
        this.fineTuneService = fineTuneService;
        this.vllmClientService = vllmClientService;
        this.llmJudgeClientService = llmJudgeClientService;
        this.logger = new common_1.Logger(TrainingController_1.name);
    }
    async healthCheck() {
        const trainServiceHealthy = await this.fineTuneService.checkTrainServiceHealth();
        const vllmServiceHealthy = this.vllmClientService.isServiceAvailable();
        const llmJudgeHealthy = this.llmJudgeClientService.isServiceHealthy();
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            services: {
                train_service: trainServiceHealthy,
                vllm_service: vllmServiceHealthy,
                llm_judge_service: llmJudgeHealthy,
            },
        };
    }
    async getGpuInfo() {
        return this.fineTuneService.getGpuInfo();
    }
    async startTraining(dto) {
        const taskId = `train-${Date.now()}`;
        this.logger.log(`Starting training task: ${taskId}`);
        const config = {};
        if (dto.model_name)
            config.model_name = dto.model_name;
        if (dto.lora_rank)
            config.lora_rank = dto.lora_rank;
        if (dto.lora_alpha)
            config.lora_alpha = dto.lora_alpha;
        if (dto.learning_rate)
            config.learning_rate = dto.learning_rate;
        if (dto.num_epochs)
            config.num_epochs = dto.num_epochs;
        if (dto.batch_size)
            config.batch_size = dto.batch_size;
        if (dto.dataset_name)
            config.dataset_name = dto.dataset_name;
        try {
            const result = await this.fineTuneService.startTraining(taskId, config, dto.resume_from_checkpoint);
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async listTasks() {
        return this.fineTuneService.listTrainingTasks();
    }
    async getTaskStatus(taskId) {
        const task = await this.fineTuneService.getTrainingStatus(taskId);
        if (!task) {
            throw new common_1.HttpException({ error: `Task ${taskId} not found` }, common_1.HttpStatus.NOT_FOUND);
        }
        return task;
    }
    async cancelTask(taskId) {
        try {
            const result = await this.fineTuneService.cancelTraining(taskId);
            return { success: true, ...result };
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async prepareTrainingData(minValidationScore, minTotalReward, maxUsageCount, limit) {
        try {
            const result = await this.fineTuneService.prepareTrainingData({
                minValidationScore: minValidationScore ? parseFloat(String(minValidationScore)) : undefined,
                minTotalReward: minTotalReward ? parseFloat(String(minTotalReward)) : undefined,
                maxUsageCount: maxUsageCount ? parseInt(String(maxUsageCount)) : undefined,
                limit: limit ? parseInt(String(limit)) : undefined,
            });
            return { success: true, ...result };
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async listModels() {
        return this.fineTuneService.listTrainedModels();
    }
    async listExperiments() {
        return this.fineTuneService.listExperiments();
    }
    async listRuns(experimentId) {
        return this.fineTuneService.listRuns(experimentId);
    }
    async listVllmModels() {
        return this.vllmClientService.listModels();
    }
    async listLoraAdapters() {
        return this.vllmClientService.getLoadedAdapters();
    }
    async generate(dto) {
        if (!this.vllmClientService.isServiceAvailable()) {
            throw new common_1.HttpException({ error: 'vLLM service is not available' }, common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        try {
            const result = await this.vllmClientService.generateDecision({
                userRequest: dto.user_request,
                systemPrompt: dto.system_prompt,
                loraAdapter: dto.lora_adapter,
                temperature: dto.temperature,
                maxTokens: dto.max_tokens,
            });
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async runPipeline(config, minValidationScore, minTotalReward) {
        try {
            const result = await this.fineTuneService.runFullTrainingPipeline({
                config,
                minValidationScore: minValidationScore ? parseFloat(String(minValidationScore)) : undefined,
                minTotalReward: minTotalReward ? parseFloat(String(minTotalReward)) : undefined,
            });
            return { success: true, ...result };
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async judgeHealthCheck() {
        return this.llmJudgeClientService.checkHealth();
    }
    async scorePlan(dto) {
        try {
            const result = await this.llmJudgeClientService.scorePlan(dto);
            return { success: true, ...result };
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async batchScore(requests) {
        try {
            const result = await this.llmJudgeClientService.batchScore(requests);
            return { success: true, ...result };
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async comparePlans(dto) {
        try {
            const result = await this.llmJudgeClientService.comparePlans(dto);
            return { success: true, ...result };
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async evaluateLora(dto) {
        try {
            const result = await this.llmJudgeClientService.evaluateLora(dto);
            return { success: true, ...result };
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async batchEvaluateLora(requests) {
        try {
            const results = await this.llmJudgeClientService.batchEvaluateLora(requests);
            const report = await this.llmJudgeClientService.generateLoraEvalReport(results);
            return { success: true, results, report };
        }
        catch (error) {
            throw new common_1.HttpException({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || String(error) }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.TrainingController = TrainingController;
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '服务健康检查' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '服务状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "healthCheck", null);
__decorate([
    (0, common_1.Get)('gpu/info'),
    (0, swagger_1.ApiOperation)({ summary: '获取 GPU 信息' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'GPU 信息' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getGpuInfo", null);
__decorate([
    (0, common_1.Post)('start'),
    (0, swagger_1.ApiOperation)({ summary: '启动训练任务' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '任务已启动' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求错误' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [StartTrainingDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "startTraining", null);
__decorate([
    (0, common_1.Get)('tasks'),
    (0, swagger_1.ApiOperation)({ summary: '列出所有训练任务' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '任务列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "listTasks", null);
__decorate([
    (0, common_1.Get)('tasks/:taskId'),
    (0, swagger_1.ApiOperation)({ summary: '获取训练任务状态' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '任务状态' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '任务不存在' }),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "getTaskStatus", null);
__decorate([
    (0, common_1.Post)('tasks/:taskId/cancel'),
    (0, swagger_1.ApiOperation)({ summary: '取消训练任务' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '任务已取消' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '任务不存在' }),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "cancelTask", null);
__decorate([
    (0, common_1.Post)('data/prepare'),
    (0, swagger_1.ApiOperation)({ summary: '准备训练数据' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '数据准备完成' }),
    __param(0, (0, common_1.Query)('min_validation_score')),
    __param(1, (0, common_1.Query)('min_total_reward')),
    __param(2, (0, common_1.Query)('max_usage_count')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Number, Number]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "prepareTrainingData", null);
__decorate([
    (0, common_1.Get)('models'),
    (0, swagger_1.ApiOperation)({ summary: '列出已训练的模型' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '模型列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "listModels", null);
__decorate([
    (0, common_1.Get)('experiments'),
    (0, swagger_1.ApiOperation)({ summary: '列出 MLflow 实验' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '实验列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "listExperiments", null);
__decorate([
    (0, common_1.Get)('experiments/:experimentId/runs'),
    (0, swagger_1.ApiOperation)({ summary: '列出 MLflow 运行' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '运行列表' }),
    __param(0, (0, common_1.Param)('experimentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "listRuns", null);
__decorate([
    (0, common_1.Get)('vllm/models'),
    (0, swagger_1.ApiOperation)({ summary: '列出 vLLM 可用模型' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '模型列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "listVllmModels", null);
__decorate([
    (0, common_1.Get)('vllm/adapters'),
    (0, swagger_1.ApiOperation)({ summary: '列出已加载的 LoRA 适配器' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '适配器列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "listLoraAdapters", null);
__decorate([
    (0, common_1.Post)('vllm/generate'),
    (0, swagger_1.ApiOperation)({ summary: '生成文本（使用 vLLM）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '生成结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [GenerateDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "generate", null);
__decorate([
    (0, common_1.Post)('pipeline/run'),
    (0, swagger_1.ApiOperation)({ summary: '执行完整训练流程' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '流程已启动' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)('min_validation_score')),
    __param(2, (0, common_1.Query)('min_total_reward')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "runPipeline", null);
__decorate([
    (0, common_1.Get)('judge/health'),
    (0, swagger_1.ApiOperation)({ summary: 'LLM Judge 服务健康检查' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '服务状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "judgeHealthCheck", null);
__decorate([
    (0, common_1.Post)('judge/score'),
    (0, swagger_1.ApiOperation)({ summary: '对计划进行质量评分' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '评分结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ScorePlanDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "scorePlan", null);
__decorate([
    (0, common_1.Post)('judge/batch-score'),
    (0, swagger_1.ApiOperation)({ summary: '批量评分' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '批量评分结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "batchScore", null);
__decorate([
    (0, common_1.Post)('judge/compare'),
    (0, swagger_1.ApiOperation)({ summary: '比较两个计划' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '比较结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ComparePlansDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "comparePlans", null);
__decorate([
    (0, common_1.Post)('judge/evaluate-lora'),
    (0, swagger_1.ApiOperation)({ summary: '评估 LoRA 模型输出质量' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '评估结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [EvaluateLoraDto]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "evaluateLora", null);
__decorate([
    (0, common_1.Post)('judge/batch-evaluate-lora'),
    (0, swagger_1.ApiOperation)({ summary: '批量评估 LoRA 模型' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '批量评估结果' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], TrainingController.prototype, "batchEvaluateLora", null);
exports.TrainingController = TrainingController = TrainingController_1 = __decorate([
    (0, swagger_1.ApiTags)('Training'),
    (0, common_1.Controller)('api/training'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [fine_tune_service_1.FineTuneService,
        vllm_client_service_1.VllmClientService,
        llm_judge_client_service_1.LlmJudgeClientService])
], TrainingController);
//# sourceMappingURL=training.controller.js.map