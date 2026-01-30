// src/trips/services/evidence-fetch-task.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * 任务状态
 */
export enum EvidenceFetchTaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * 证据获取任务进度
 */
export interface EvidenceFetchTaskProgress {
  /**
   * 任务ID
   */
  taskId: string;

  /**
   * 行程ID
   */
  tripId: string;

  /**
   * 任务状态
   */
  status: EvidenceFetchTaskStatus;

  /**
   * 总POI数量
   */
  totalPlaces: number;

  /**
   * 已处理POI数量
   */
  processedPlaces: number;

  /**
   * 当前处理的POI
   */
  currentPlace?: {
    id: number;
    name: string;
    evidenceTypes: string[];
  };

  /**
   * 预计剩余时间（秒）
   */
  estimatedTimeRemaining?: number;

  /**
   * 是否可以取消
   */
  canCancel: boolean;

  /**
   * 成功数量
   */
  successCount: number;

  /**
   * 失败数量
   */
  failedCount: number;

  /**
   * 部分成功数量
   */
  partialCount: number;

  /**
   * 错误信息（如果有）
   */
  error?: string;

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
}

/**
 * 证据获取任务服务
 * 
 * 职责：
 * 1. 管理证据获取任务
 * 2. 更新任务进度
 * 3. 提供进度查询接口
 */
@Injectable()
export class EvidenceFetchTaskService {
  private readonly logger = new Logger(EvidenceFetchTaskService.name);

  /**
   * 任务存储（内存存储，重启后丢失）
   * 生产环境应该使用Redis或数据库
   */
  private tasks = new Map<string, EvidenceFetchTaskProgress>();

  /**
   * 创建任务
   */
  createTask(tripId: string, totalPlaces: number): string {
    const taskId = randomUUID();
    const now = new Date().toISOString();

    const task: EvidenceFetchTaskProgress = {
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

  /**
   * 获取任务进度
   */
  getTaskProgress(taskId: string): EvidenceFetchTaskProgress | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 更新任务进度
   */
  updateProgress(
    taskId: string,
    updates: Partial<EvidenceFetchTaskProgress>,
  ): void {
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

  /**
   * 更新当前处理的POI
   */
  updateCurrentPlace(
    taskId: string,
    placeId: number,
    placeName: string,
    evidenceTypes: string[],
  ): void {
    this.updateProgress(taskId, {
      currentPlace: {
        id: placeId,
        name: placeName,
        evidenceTypes,
      },
    });
  }

  /**
   * 增加处理计数
   */
  incrementProcessed(
    taskId: string,
    status: 'success' | 'failed' | 'partial' = 'success',
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.processedPlaces++;
    
    if (status === 'success') {
      task.successCount++;
    } else if (status === 'failed') {
      task.failedCount++;
    } else {
      task.partialCount++;
    }

    // 计算预计剩余时间
    if (task.processedPlaces > 0 && task.status === EvidenceFetchTaskStatus.RUNNING) {
      const elapsed = Date.now() - new Date(task.createdAt).getTime();
      const avgTimePerPlace = elapsed / task.processedPlaces;
      const remainingPlaces = task.totalPlaces - task.processedPlaces;
      task.estimatedTimeRemaining = Math.ceil((avgTimePerPlace * remainingPlaces) / 1000);
    }

    this.updateProgress(taskId, {});
  }

  /**
   * 标记任务为运行中
   */
  markRunning(taskId: string): void {
    this.updateProgress(taskId, {
      status: EvidenceFetchTaskStatus.RUNNING,
      canCancel: true,
    });
  }

  /**
   * 标记任务为完成
   */
  markCompleted(taskId: string, successCount: number, failedCount: number, partialCount: number): void {
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

  /**
   * 标记任务为失败
   */
  markFailed(taskId: string, error: string): void {
    this.updateProgress(taskId, {
      status: EvidenceFetchTaskStatus.FAILED,
      canCancel: false,
      error,
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
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

  /**
   * 清理过期任务（可选）
   * 清理24小时前的已完成任务
   */
  cleanupOldTasks(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时

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
}
