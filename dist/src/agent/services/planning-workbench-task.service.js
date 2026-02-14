"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlanningWorkbenchTaskService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningWorkbenchTaskService = exports.PlanningWorkbenchTaskStatus = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
var PlanningWorkbenchTaskStatus;
(function (PlanningWorkbenchTaskStatus) {
    PlanningWorkbenchTaskStatus["PENDING"] = "PENDING";
    PlanningWorkbenchTaskStatus["RUNNING"] = "RUNNING";
    PlanningWorkbenchTaskStatus["COMPLETED"] = "COMPLETED";
    PlanningWorkbenchTaskStatus["FAILED"] = "FAILED";
    PlanningWorkbenchTaskStatus["CANCELLED"] = "CANCELLED";
})(PlanningWorkbenchTaskStatus || (exports.PlanningWorkbenchTaskStatus = PlanningWorkbenchTaskStatus = {}));
let PlanningWorkbenchTaskService = PlanningWorkbenchTaskService_1 = class PlanningWorkbenchTaskService {
    constructor() {
        this.logger = new common_1.Logger(PlanningWorkbenchTaskService_1.name);
        this.tasks = new Map();
    }
    createTask() {
        const taskId = (0, crypto_1.randomUUID)();
        const now = new Date().toISOString();
        const task = {
            taskId,
            status: PlanningWorkbenchTaskStatus.PENDING,
            progress: 0,
            createdAt: now,
            updatedAt: now,
        };
        this.tasks.set(taskId, task);
        this.logger.debug(`创建规划工作台任务: taskId=${taskId}`);
        return taskId;
    }
    getTaskProgress(taskId) {
        return this.tasks.get(taskId) || null;
    }
    updateProgress(taskId, updates) {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.logger.warn(`任务不存在: taskId=${taskId}`);
            return;
        }
        Object.assign(task, updates, {
            updatedAt: new Date().toISOString(),
        });
        this.logger.debug(`更新任务进度: taskId=${taskId}, status=${task.status}, progress=${task.progress}%`);
    }
    markRunning(taskId, currentStage) {
        this.updateProgress(taskId, {
            status: PlanningWorkbenchTaskStatus.RUNNING,
            currentStage: currentStage || '正在处理...',
            progress: 0,
        });
    }
    updateProgressPercent(taskId, percent, stage) {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.logger.warn(`更新进度失败: 任务不存在 taskId=${taskId}`);
            return;
        }
        const now = Date.now();
        const createdAt = new Date(task.createdAt).getTime();
        const elapsed = now - createdAt;
        if (percent > 0 && percent < 100) {
            const estimatedTotal = (elapsed / percent) * 100;
            const remaining = estimatedTotal - elapsed;
            this.updateProgress(taskId, {
                progress: percent,
                currentStage: stage || task.currentStage,
                estimatedTimeRemaining: Math.ceil(remaining / 1000),
            });
            this.logger.debug(`更新任务进度: taskId=${taskId}, progress=${percent}%, stage=${stage || task.currentStage}`);
        }
        else {
            this.updateProgress(taskId, {
                progress: percent,
                currentStage: stage || task.currentStage,
            });
            this.logger.debug(`更新任务进度: taskId=${taskId}, progress=${percent}%, stage=${stage || task.currentStage}`);
        }
    }
    markCompleted(taskId, result) {
        this.updateProgress(taskId, {
            status: PlanningWorkbenchTaskStatus.COMPLETED,
            progress: 100,
            result,
            completedAt: new Date().toISOString(),
            estimatedTimeRemaining: 0,
        });
    }
    markFailed(taskId, error) {
        this.updateProgress(taskId, {
            status: PlanningWorkbenchTaskStatus.FAILED,
            error,
            completedAt: new Date().toISOString(),
        });
    }
    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return false;
        }
        if (task.status === PlanningWorkbenchTaskStatus.COMPLETED ||
            task.status === PlanningWorkbenchTaskStatus.FAILED ||
            task.status === PlanningWorkbenchTaskStatus.CANCELLED) {
            return false;
        }
        this.updateProgress(taskId, {
            status: PlanningWorkbenchTaskStatus.CANCELLED,
            completedAt: new Date().toISOString(),
        });
        this.logger.log(`任务已取消: taskId=${taskId}`);
        return true;
    }
    cleanupOldTasks() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000;
        for (const [taskId, task] of this.tasks.entries()) {
            const taskAge = now - new Date(task.createdAt).getTime();
            if (taskAge > maxAge &&
                (task.status === PlanningWorkbenchTaskStatus.COMPLETED ||
                    task.status === PlanningWorkbenchTaskStatus.FAILED ||
                    task.status === PlanningWorkbenchTaskStatus.CANCELLED)) {
                this.tasks.delete(taskId);
                this.logger.debug(`清理过期任务: taskId=${taskId}`);
            }
        }
    }
};
exports.PlanningWorkbenchTaskService = PlanningWorkbenchTaskService;
exports.PlanningWorkbenchTaskService = PlanningWorkbenchTaskService = PlanningWorkbenchTaskService_1 = __decorate([
    (0, common_1.Injectable)()
], PlanningWorkbenchTaskService);
//# sourceMappingURL=planning-workbench-task.service.js.map