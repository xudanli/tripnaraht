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
var TaskService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskService = exports.TaskStatus = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const cache_service_1 = require("../../common/cache/cache.service");
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "PENDING";
    TaskStatus["PROCESSING"] = "PROCESSING";
    TaskStatus["COMPLETED"] = "COMPLETED";
    TaskStatus["FAILED"] = "FAILED";
    TaskStatus["CANCELLED"] = "CANCELLED";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
let TaskService = TaskService_1 = class TaskService {
    constructor(cacheService) {
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(TaskService_1.name);
        this.tasks = new Map();
        this.TASK_RESULT_CACHE_PREFIX = 'task:result';
        this.TASK_INFO_CACHE_PREFIX = 'task:info';
        this.TASK_RESULT_TTL = 24 * 60 * 60;
        this.logger.log('🚀 通用任务服务已初始化');
    }
    createTask(type, params) {
        const taskId = (0, crypto_1.randomUUID)();
        const now = new Date().toISOString();
        const task = {
            taskId,
            type,
            status: TaskStatus.PENDING,
            progress: 0,
            createdAt: now,
            updatedAt: now,
            params,
        };
        this.tasks.set(taskId, task);
        if (this.cacheService) {
            const cacheKey = this.cacheService.generateKey(this.TASK_INFO_CACHE_PREFIX, taskId);
            this.cacheService.set(cacheKey, task, this.TASK_RESULT_TTL).catch(error => {
                this.logger.warn(`任务信息缓存失败: taskId=${taskId}`, error);
            });
        }
        this.logger.debug(`创建任务: taskId=${taskId}, type=${type}`);
        return taskId;
    }
    async getTaskStatus(taskId) {
        let task = this.tasks.get(taskId);
        if (!task && this.cacheService) {
            const cacheKey = this.cacheService.generateKey(this.TASK_INFO_CACHE_PREFIX, taskId);
            task = await this.cacheService.get(cacheKey);
            if (task) {
                this.tasks.set(taskId, task);
            }
        }
        return task || null;
    }
    async updateTaskStatus(taskId, updates) {
        let task = this.tasks.get(taskId);
        if (!task) {
            if (this.cacheService) {
                const cacheKey = this.cacheService.generateKey(this.TASK_INFO_CACHE_PREFIX, taskId);
                task = await this.cacheService.get(cacheKey);
                if (task) {
                    this.tasks.set(taskId, task);
                }
            }
            if (!task) {
                this.logger.warn(`更新任务状态失败: 任务不存在 taskId=${taskId}`);
                return;
            }
        }
        Object.assign(task, updates, {
            updatedAt: new Date().toISOString(),
        });
        if (updates.status === TaskStatus.COMPLETED || updates.status === TaskStatus.FAILED) {
            task.completedAt = new Date().toISOString();
        }
        if (this.cacheService) {
            const cacheKey = this.cacheService.generateKey(this.TASK_INFO_CACHE_PREFIX, taskId);
            await this.cacheService.set(cacheKey, task, this.TASK_RESULT_TTL).catch(error => {
                this.logger.warn(`任务信息缓存更新失败: taskId=${taskId}`, error);
            });
        }
        this.logger.debug(`更新任务状态: taskId=${taskId}, status=${task.status}, progress=${task.progress}%`);
    }
    async markProcessing(taskId, currentStage) {
        await this.updateTaskStatus(taskId, {
            status: TaskStatus.PROCESSING,
            currentStage: currentStage || '正在处理...',
            progress: 0,
        });
    }
    async updateProgress(taskId, percent, stage) {
        const task = await this.getTaskStatus(taskId);
        if (!task) {
            this.logger.warn(`更新进度失败: 任务不存在 taskId=${taskId}`);
            return;
        }
        const now = Date.now();
        const createdAt = new Date(task.createdAt).getTime();
        const elapsed = now - createdAt;
        let estimatedTimeRemaining;
        if (percent > 0 && percent < 100) {
            const estimatedTotal = (elapsed / percent) * 100;
            const remaining = estimatedTotal - elapsed;
            estimatedTimeRemaining = Math.ceil(remaining / 1000);
        }
        else if (percent >= 100) {
            estimatedTimeRemaining = 0;
        }
        await this.updateTaskStatus(taskId, {
            progress: percent,
            currentStage: stage || task.currentStage,
            estimatedTimeRemaining,
        });
    }
    async markCompleted(taskId, result) {
        await this.updateTaskStatus(taskId, {
            status: TaskStatus.COMPLETED,
            progress: 100,
            result,
            completedAt: new Date().toISOString(),
            estimatedTimeRemaining: 0,
        });
        if (this.cacheService) {
            const resultCacheKey = this.cacheService.generateKey(this.TASK_RESULT_CACHE_PREFIX, taskId);
            await this.cacheService.set(resultCacheKey, result, this.TASK_RESULT_TTL).catch(error => {
                this.logger.warn(`任务结果缓存失败: taskId=${taskId}`, error);
            });
        }
    }
    async markFailed(taskId, error) {
        const errorMessage = error instanceof Error ? error.message : error;
        await this.updateTaskStatus(taskId, {
            status: TaskStatus.FAILED,
            error: errorMessage,
            completedAt: new Date().toISOString(),
        });
    }
    async cancelTask(taskId) {
        const task = await this.getTaskStatus(taskId);
        if (!task) {
            return false;
        }
        if (task.status === TaskStatus.COMPLETED ||
            task.status === TaskStatus.FAILED ||
            task.status === TaskStatus.CANCELLED) {
            return false;
        }
        await this.updateTaskStatus(taskId, {
            status: TaskStatus.CANCELLED,
            completedAt: new Date().toISOString(),
        });
        this.logger.log(`任务已取消: taskId=${taskId}`);
        return true;
    }
    async getTaskResult(taskId) {
        const task = await this.getTaskStatus(taskId);
        if (task && task.status === TaskStatus.COMPLETED) {
            return task.result || null;
        }
        if (this.cacheService) {
            const resultCacheKey = this.cacheService.generateKey(this.TASK_RESULT_CACHE_PREFIX, taskId);
            return await this.cacheService.get(resultCacheKey);
        }
        return null;
    }
    cleanupOldTasks() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000;
        for (const [taskId, task] of this.tasks.entries()) {
            const taskAge = now - new Date(task.createdAt).getTime();
            if (taskAge > maxAge &&
                (task.status === TaskStatus.COMPLETED ||
                    task.status === TaskStatus.FAILED ||
                    task.status === TaskStatus.CANCELLED)) {
                this.tasks.delete(taskId);
                if (this.cacheService) {
                    const infoCacheKey = this.cacheService.generateKey(this.TASK_INFO_CACHE_PREFIX, taskId);
                    const resultCacheKey = this.cacheService.generateKey(this.TASK_RESULT_CACHE_PREFIX, taskId);
                    this.cacheService.delete(infoCacheKey).catch(() => { });
                    this.cacheService.delete(resultCacheKey).catch(() => { });
                }
                this.logger.debug(`清理过期任务: taskId=${taskId}`);
            }
        }
    }
};
exports.TaskService = TaskService;
exports.TaskService = TaskService = TaskService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [cache_service_1.CacheService])
], TaskService);
//# sourceMappingURL=task.service.js.map