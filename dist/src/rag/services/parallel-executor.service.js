"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ParallelExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParallelExecutorService = void 0;
const common_1 = require("@nestjs/common");
let ParallelExecutorService = ParallelExecutorService_1 = class ParallelExecutorService {
    constructor() {
        this.logger = new common_1.Logger(ParallelExecutorService_1.name);
    }
    async executeAll(tasks, options = {}) {
        const { maxConcurrency = 5, taskTimeout = 30000, failFast = false, delayMs = 0, } = options;
        if (tasks.length === 0) {
            return [];
        }
        this.logger.log(`[ParallelExecutor] 开始并行执行: tasks=${tasks.length}, concurrency=${maxConcurrency}, timeout=${taskTimeout}ms`);
        const startTime = Date.now();
        const results = [];
        const executing = [];
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const promise = this.executeTask(task, taskTimeout).then((result) => {
                var _a;
                results.push(result);
                if (!result.success && failFast) {
                    this.logger.warn(`[ParallelExecutor] Task ${task.id} failed in failFast mode: ${(_a = result.error) === null || _a === void 0 ? void 0 : _a.message}`);
                }
            });
            executing.push(promise);
            if (executing.length >= maxConcurrency) {
                await Promise.race(executing);
                const stillExecuting = executing.filter((p) => {
                    return true;
                });
                executing.length = 0;
                executing.push(...stillExecuting);
            }
            if (delayMs > 0 && i < tasks.length - 1) {
                await this.sleep(delayMs);
            }
        }
        await Promise.all(executing);
        const totalDuration = Date.now() - startTime;
        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.filter((r) => !r.success).length;
        this.logger.log(`[ParallelExecutor] 执行完成: total=${results.length}, success=${successCount}, failed=${failureCount}, duration=${totalDuration}ms`);
        return results;
    }
    async executeAllSimple(tasks, timeout = 30000) {
        if (tasks.length === 0) {
            return [];
        }
        this.logger.log(`[ParallelExecutor] 简单并行执行: tasks=${tasks.length}, timeout=${timeout}ms`);
        const promises = tasks.map((task) => this.executeTask(task, timeout));
        const results = await Promise.all(promises);
        const successCount = results.filter((r) => r.success).length;
        this.logger.log(`[ParallelExecutor] 简单并行执行完成: success=${successCount}/${results.length}`);
        return results;
    }
    async executeTask(task, timeout) {
        const startTime = Date.now();
        try {
            const result = await Promise.race([
                task.operation(),
                this.createTimeoutPromise(timeout, task.id),
            ]);
            const duration = Date.now() - startTime;
            this.logger.debug(`[ParallelExecutor] Task ${task.id} succeeded (${duration}ms)`);
            return {
                id: task.id,
                success: true,
                result,
                duration,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.warn(`[ParallelExecutor] Task ${task.id} failed (${duration}ms): ${error.message}`);
            return {
                id: task.id,
                success: false,
                error: error,
                duration,
            };
        }
    }
    createTimeoutPromise(timeout, taskId) {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Task ${taskId} timed out after ${timeout}ms`));
            }, timeout);
        });
    }
    async executeBatch(tasks, batchSize, options = {}) {
        if (tasks.length === 0) {
            return [];
        }
        this.logger.log(`[ParallelExecutor] 批量执行: tasks=${tasks.length}, batchSize=${batchSize}`);
        const allResults = [];
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(tasks.length / batchSize);
            this.logger.debug(`[ParallelExecutor] 执行批次 ${batchNum}/${totalBatches}: ${batch.length} tasks`);
            const batchResults = await this.executeAll(batch, options);
            allResults.push(...batchResults);
            if (i + batchSize < tasks.length && options.delayMs) {
                await this.sleep(options.delayMs);
            }
        }
        const successCount = allResults.filter((r) => r.success).length;
        this.logger.log(`[ParallelExecutor] 批量执行完成: success=${successCount}/${allResults.length}`);
        return allResults;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    getStats(results) {
        if (results.length === 0) {
            return {
                total: 0,
                success: 0,
                failed: 0,
                avgDuration: 0,
                maxDuration: 0,
                minDuration: 0,
            };
        }
        const durations = results.map((r) => r.duration);
        const successCount = results.filter((r) => r.success).length;
        return {
            total: results.length,
            success: successCount,
            failed: results.length - successCount,
            avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
            maxDuration: Math.max(...durations),
            minDuration: Math.min(...durations),
        };
    }
};
exports.ParallelExecutorService = ParallelExecutorService;
exports.ParallelExecutorService = ParallelExecutorService = ParallelExecutorService_1 = __decorate([
    (0, common_1.Injectable)()
], ParallelExecutorService);
//# sourceMappingURL=parallel-executor.service.js.map