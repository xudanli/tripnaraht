"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EvidenceFetchTaskService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceFetchTaskService = exports.EvidenceFetchTaskStatus = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
var EvidenceFetchTaskStatus;
(function (EvidenceFetchTaskStatus) {
    EvidenceFetchTaskStatus["PENDING"] = "PENDING";
    EvidenceFetchTaskStatus["RUNNING"] = "RUNNING";
    EvidenceFetchTaskStatus["COMPLETED"] = "COMPLETED";
    EvidenceFetchTaskStatus["FAILED"] = "FAILED";
    EvidenceFetchTaskStatus["CANCELLED"] = "CANCELLED";
})(EvidenceFetchTaskStatus || (exports.EvidenceFetchTaskStatus = EvidenceFetchTaskStatus = {}));
let EvidenceFetchTaskService = EvidenceFetchTaskService_1 = class EvidenceFetchTaskService {
    constructor() {
        this.logger = new common_1.Logger(EvidenceFetchTaskService_1.name);
        this.tasks = new Map();
    }
    createTask(tripId, totalPlaces) {
        const taskId = (0, crypto_1.randomUUID)();
        const now = new Date().toISOString();
        const task = {
            taskId,
            tripId,
            status: EvidenceFetchTaskStatus.PENDING,
            totalPlaces,
            processedPlaces: 0,
            canCancel: true,
            successCount: 0,
            failedCount: 0,
            partialCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        this.tasks.set(taskId, task);
        this.logger.debug(`创建证据获取任务: taskId=${taskId}, tripId=${tripId}, totalPlaces=${totalPlaces}`);
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
        this.logger.debug(`更新任务进度: taskId=${taskId}, processedPlaces=${task.processedPlaces}/${task.totalPlaces}`);
    }
    updateCurrentPlace(taskId, placeId, placeName, evidenceTypes) {
        this.updateProgress(taskId, {
            currentPlace: {
                id: placeId,
                name: placeName,
                evidenceTypes,
            },
        });
    }
    incrementProcessed(taskId, status = 'success') {
        const task = this.tasks.get(taskId);
        if (!task) {
            return;
        }
        task.processedPlaces++;
        if (status === 'success') {
            task.successCount++;
        }
        else if (status === 'failed') {
            task.failedCount++;
        }
        else {
            task.partialCount++;
        }
        if (task.processedPlaces > 0 && task.status === EvidenceFetchTaskStatus.RUNNING) {
            const elapsed = Date.now() - new Date(task.createdAt).getTime();
            const avgTimePerPlace = elapsed / task.processedPlaces;
            const remainingPlaces = task.totalPlaces - task.processedPlaces;
            task.estimatedTimeRemaining = Math.ceil((avgTimePerPlace * remainingPlaces) / 1000);
        }
        this.updateProgress(taskId, {});
    }
    markRunning(taskId) {
        this.updateProgress(taskId, {
            status: EvidenceFetchTaskStatus.RUNNING,
            canCancel: true,
        });
    }
    markCompleted(taskId, successCount, failedCount, partialCount) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return;
        }
        this.updateProgress(taskId, {
            status: EvidenceFetchTaskStatus.COMPLETED,
            canCancel: false,
            successCount,
            failedCount,
            partialCount,
            completedAt: new Date().toISOString(),
            estimatedTimeRemaining: 0,
            currentPlace: undefined,
        });
    }
    markFailed(taskId, error) {
        this.updateProgress(taskId, {
            status: EvidenceFetchTaskStatus.FAILED,
            canCancel: false,
            error,
            completedAt: new Date().toISOString(),
        });
    }
    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return false;
        }
        if (task.status === EvidenceFetchTaskStatus.COMPLETED ||
            task.status === EvidenceFetchTaskStatus.FAILED ||
            task.status === EvidenceFetchTaskStatus.CANCELLED) {
            return false;
        }
        this.updateProgress(taskId, {
            status: EvidenceFetchTaskStatus.CANCELLED,
            canCancel: false,
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
                (task.status === EvidenceFetchTaskStatus.COMPLETED ||
                    task.status === EvidenceFetchTaskStatus.FAILED ||
                    task.status === EvidenceFetchTaskStatus.CANCELLED)) {
                this.tasks.delete(taskId);
                this.logger.debug(`清理过期任务: taskId=${taskId}`);
            }
        }
    }
};
exports.EvidenceFetchTaskService = EvidenceFetchTaskService;
exports.EvidenceFetchTaskService = EvidenceFetchTaskService = EvidenceFetchTaskService_1 = __decorate([
    (0, common_1.Injectable)()
], EvidenceFetchTaskService);
//# sourceMappingURL=evidence-fetch-task.service.js.map