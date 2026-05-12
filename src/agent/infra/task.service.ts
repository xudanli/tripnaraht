// src/agent/infra/task.service.ts

/**
 * 通用任务服务
 * 
 * 职责:
 * - 管理异步任务的创建、更新和查询
 * - 提供任务进度跟踪
 * - 存储任务结果
 * 
 * 注意: 当前使用内存存储，生产环境应该使用Redis或数据库
 * 
 * 参考文档:
 * - API_REDESIGN_CODE_TEMPLATES.md - 代码模板
 * - API_REDESIGN_REVIEW_ARCHITECT.md - 架构师评审
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CacheService } from '../../common/cache/cache.service';

/**
 * 任务状态
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * 任务信息
 */
export interface TaskInfo {
  /**
   * 任务ID
   */
  taskId: string;

  /**
   * 任务类型
   */
  type: string;

  /**
   * 任务状态
   */
  status: TaskStatus;

  /**
   * 进度百分比 (0-100)
   */
  progress: number;

  /**
   * 当前阶段描述
   */
  currentStage?: string;

  /**
   * 预计剩余时间（秒）
   */
  estimatedTimeRemaining?: number;

  /**
   * 错误信息（如果有）
   */
  error?: string;

  /**
   * 结果（如果已完成）
   */
  result?: any;

  /**
   * 创建时间
   */
  createdAt: string;

  /**
   * 更新时间
   */
  updatedAt: string;

  /**
   * 完成时间（如果已完成）
   */
  completedAt?: string;

  /**
   * 任务参数（可选）
   */
  params?: Record<string, any>;
}

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  // 任务存储（内存存储，重启后丢失）
  // 生产环境应该使用Redis或数据库
  private tasks = new Map<string, TaskInfo>();

  // 任务结果缓存键前缀
  private readonly TASK_RESULT_CACHE_PREFIX = 'task:result';
  private readonly TASK_INFO_CACHE_PREFIX = 'task:info';

  // 任务结果缓存TTL（24小时）
  private readonly TASK_RESULT_TTL = 24 * 60 * 60;

  constructor(
    @Optional() private readonly cacheService?: CacheService,
  ) {
    this.logger.log('🚀 通用任务服务已初始化');
  }

  /**
   * 创建任务
   */
  createTask(type: string, params?: Record<string, any>): string {
    const taskId = randomUUID();
    const now = new Date().toISOString();

    const task: TaskInfo = {
      taskId,
      type,
      status: TaskStatus.PENDING,
      progress: 0,
      createdAt: now,
      updatedAt: now,
      params,
    };

    this.tasks.set(taskId, task);

    // 如果启用了缓存服务，也存储到缓存
    if (this.cacheService) {
      const cacheKey = this.cacheService.generateKey(this.TASK_INFO_CACHE_PREFIX, taskId);
      this.cacheService.set(cacheKey, task, this.TASK_RESULT_TTL).catch(error => {
        this.logger.warn(`任务信息缓存失败: taskId=${taskId}`, error);
      });
    }

    this.logger.debug(`创建任务: taskId=${taskId}, type=${type}`);
    return taskId;
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string): Promise<TaskInfo | null> {
    // 优先从内存获取
    let task = this.tasks.get(taskId);

    // 如果内存中没有，尝试从缓存获取
    if (!task && this.cacheService) {
      const cacheKey = this.cacheService.generateKey(this.TASK_INFO_CACHE_PREFIX, taskId);
      task = (await this.cacheService.get<TaskInfo>(cacheKey)) ?? undefined;
      if (task) {
        // 回填到内存
        this.tasks.set(taskId, task);
      }
    }

    return task || null;
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    taskId: string,
    updates: Partial<TaskInfo>,
  ): Promise<void> {
    let task = this.tasks.get(taskId);
    if (!task) {
      // 尝试从缓存获取
      if (this.cacheService) {
        const cacheKey = this.cacheService.generateKey(this.TASK_INFO_CACHE_PREFIX, taskId);
        task = (await this.cacheService.get<TaskInfo>(cacheKey)) ?? undefined;
        if (task) {
          this.tasks.set(taskId, task);
        }
      }

      if (!task) {
        this.logger.warn(`更新任务状态失败: 任务不存在 taskId=${taskId}`);
        return;
      }
    }

    // 更新任务信息
    Object.assign(task, updates, {
      updatedAt: new Date().toISOString(),
    });

    // 如果任务完成，设置完成时间
    if (updates.status === TaskStatus.COMPLETED || updates.status === TaskStatus.FAILED) {
      task.completedAt = new Date().toISOString();
    }

    // 更新缓存
    if (this.cacheService) {
      const cacheKey = this.cacheService.generateKey(this.TASK_INFO_CACHE_PREFIX, taskId);
      await this.cacheService.set(cacheKey, task, this.TASK_RESULT_TTL).catch(error => {
        this.logger.warn(`任务信息缓存更新失败: taskId=${taskId}`, error);
      });
    }

    this.logger.debug(
      `更新任务状态: taskId=${taskId}, status=${task.status}, progress=${task.progress}%`
    );
  }

  /**
   * 标记任务为处理中
   */
  async markProcessing(taskId: string, currentStage?: string): Promise<void> {
    await this.updateTaskStatus(taskId, {
      status: TaskStatus.PROCESSING,
      currentStage: currentStage || '正在处理...',
      progress: 0,
    });
  }

  /**
   * 更新进度百分比
   */
  async updateProgress(taskId: string, percent: number, stage?: string): Promise<void> {
    const task = await this.getTaskStatus(taskId);
    if (!task) {
      this.logger.warn(`更新进度失败: 任务不存在 taskId=${taskId}`);
      return;
    }

    const now = Date.now();
    const createdAt = new Date(task.createdAt).getTime();
    const elapsed = now - createdAt;

    // 计算预计剩余时间
    let estimatedTimeRemaining: number | undefined;
    if (percent > 0 && percent < 100) {
      const estimatedTotal = (elapsed / percent) * 100;
      const remaining = estimatedTotal - elapsed;
      estimatedTimeRemaining = Math.ceil(remaining / 1000); // 转换为秒
    } else if (percent >= 100) {
      estimatedTimeRemaining = 0;
    }

    await this.updateTaskStatus(taskId, {
      progress: percent,
      currentStage: stage || task.currentStage,
      estimatedTimeRemaining,
    });
  }

  /**
   * 标记任务为完成
   */
  async markCompleted(taskId: string, result: any): Promise<void> {
    await this.updateTaskStatus(taskId, {
      status: TaskStatus.COMPLETED,
      progress: 100,
      result,
      completedAt: new Date().toISOString(),
      estimatedTimeRemaining: 0,
    });

    // 存储任务结果到缓存（单独存储，方便后续查询）
    if (this.cacheService) {
      const resultCacheKey = this.cacheService.generateKey(this.TASK_RESULT_CACHE_PREFIX, taskId);
      await this.cacheService.set(resultCacheKey, result, this.TASK_RESULT_TTL).catch(error => {
        this.logger.warn(`任务结果缓存失败: taskId=${taskId}`, error);
      });
    }
  }

  /**
   * 标记任务为失败
   */
  async markFailed(taskId: string, error: string | Error): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    await this.updateTaskStatus(taskId, {
      status: TaskStatus.FAILED,
      error: errorMessage,
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = await this.getTaskStatus(taskId);
    if (!task) {
      return false;
    }

    if (
      task.status === TaskStatus.COMPLETED ||
      task.status === TaskStatus.FAILED ||
      task.status === TaskStatus.CANCELLED
    ) {
      return false;
    }

    await this.updateTaskStatus(taskId, {
      status: TaskStatus.CANCELLED,
      completedAt: new Date().toISOString(),
    });

    this.logger.log(`任务已取消: taskId=${taskId}`);
    return true;
  }

  /**
   * 获取任务结果
   */
  async getTaskResult(taskId: string): Promise<any | null> {
    const task = await this.getTaskStatus(taskId);
    if (task && task.status === TaskStatus.COMPLETED) {
      return task.result || null;
    }

    // 尝试从缓存获取结果
    if (this.cacheService) {
      const resultCacheKey = this.cacheService.generateKey(this.TASK_RESULT_CACHE_PREFIX, taskId);
      return await this.cacheService.get(resultCacheKey);
    }

    return null;
  }

  /**
   * 清理过期任务（可选）
   * 清理24小时前的已完成任务
   */
  cleanupOldTasks(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时

    for (const [taskId, task] of this.tasks.entries()) {
      const taskAge = now - new Date(task.createdAt).getTime();
      if (
        taskAge > maxAge &&
        (task.status === TaskStatus.COMPLETED ||
          task.status === TaskStatus.FAILED ||
          task.status === TaskStatus.CANCELLED)
      ) {
        this.tasks.delete(taskId);

        // 清理缓存
        if (this.cacheService) {
          const infoCacheKey = this.cacheService.generateKey(this.TASK_INFO_CACHE_PREFIX, taskId);
          const resultCacheKey = this.cacheService.generateKey(
            this.TASK_RESULT_CACHE_PREFIX,
            taskId
          );
          this.cacheService.delete(infoCacheKey).catch(() => {});
          this.cacheService.delete(resultCacheKey).catch(() => {});
        }

        this.logger.debug(`清理过期任务: taskId=${taskId}`);
      }
    }
  }
}
