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
var TrainingBatchProcessorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingBatchProcessorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const training_data_preparation_service_1 = require("./training-data-preparation.service");
let TrainingBatchProcessorService = TrainingBatchProcessorService_1 = class TrainingBatchProcessorService {
    constructor(prisma, trainingDataPrep) {
        this.prisma = prisma;
        this.trainingDataPrep = trainingDataPrep;
        this.logger = new common_1.Logger(TrainingBatchProcessorService_1.name);
        this.activeTasks = new Map();
    }
    async createBatchTask(options) {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const task = {
            taskId,
            status: 'pending',
            progress: 0,
            currentStage: 'preparing',
            options,
            createdAt: new Date(),
            updatedAt: new Date(),
            error: null,
            result: null,
        };
        this.activeTasks.set(taskId, task);
        this.processBatchTask(task).catch((error) => {
            this.logger.error(`[BatchProcessor] 任务执行失败: taskId=${taskId}, error=${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            task.status = 'failed';
            task.error = (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error';
            task.updatedAt = new Date();
        });
        this.logger.log(`[BatchProcessor] 创建批量处理任务: taskId=${taskId}`);
        return task;
    }
    async processBatchTask(task) {
        try {
            task.status = 'processing';
            task.currentStage = 'preparing';
            task.progress = 0;
            task.updatedAt = new Date();
            this.logger.log(`[BatchProcessor] 开始准备训练批次: taskId=${task.taskId}`);
            const batch = await this.trainingDataPrep.prepareTrainingBatch(task.options);
            task.progress = 50;
            task.currentStage = 'prepared';
            task.updatedAt = new Date();
            this.logger.log(`[BatchProcessor] 训练批次准备完成: taskId=${task.taskId}, count=${batch.trajectories.length}`);
            if (task.options.exportFormat && task.options.exportFormat !== 'none') {
                task.currentStage = 'exporting';
                task.progress = 60;
                task.updatedAt = new Date();
                const exportResults = {};
                if (task.options.exportFormat === 'jsonl' ||
                    task.options.exportFormat === 'both') {
                    const jsonlPath = task.options.outputPath ||
                        `./exports/training_batch_${batch.batchId}_${Date.now()}.jsonl`;
                    const jsonlResult = await this.trainingDataPrep.exportToJSONL(batch, jsonlPath);
                    exportResults.jsonl = jsonlResult;
                    task.progress = 80;
                    task.updatedAt = new Date();
                }
                if (task.options.exportFormat === 'json' ||
                    task.options.exportFormat === 'both') {
                    const jsonPath = task.options.outputPath ||
                        `./exports/training_batch_${batch.batchId}_${Date.now()}.json`;
                    const jsonResult = await this.trainingDataPrep.exportToJSON(batch, jsonPath);
                    exportResults.json = jsonResult;
                    task.progress = 90;
                    task.updatedAt = new Date();
                }
                task.result = {
                    batch,
                    exports: exportResults,
                };
            }
            else {
                task.result = {
                    batch,
                };
            }
            task.status = 'completed';
            task.currentStage = 'completed';
            task.progress = 100;
            task.updatedAt = new Date();
            this.logger.log(`[BatchProcessor] 批量处理任务完成: taskId=${task.taskId}`);
        }
        catch (error) {
            task.status = 'failed';
            task.error = (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error';
            task.updatedAt = new Date();
            throw error;
        }
    }
    getTaskStatus(taskId) {
        return this.activeTasks.get(taskId) || null;
    }
    getAllTasks() {
        return Array.from(this.activeTasks.values());
    }
    getActiveTasks() {
        return Array.from(this.activeTasks.values()).filter((task) => task.status === 'pending' || task.status === 'processing');
    }
    cleanupCompletedTasks(keepCount = 100) {
        const completedTasks = Array.from(this.activeTasks.values())
            .filter((task) => task.status === 'completed' || task.status === 'failed')
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        if (completedTasks.length > keepCount) {
            const toRemove = completedTasks.slice(keepCount);
            for (const task of toRemove) {
                this.activeTasks.delete(task.taskId);
            }
            this.logger.log(`[BatchProcessor] 清理了 ${toRemove.length} 个已完成的任务`);
        }
    }
};
exports.TrainingBatchProcessorService = TrainingBatchProcessorService;
exports.TrainingBatchProcessorService = TrainingBatchProcessorService = TrainingBatchProcessorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        training_data_preparation_service_1.TrainingDataPreparationService])
], TrainingBatchProcessorService);
//# sourceMappingURL=training-batch-processor.service.js.map