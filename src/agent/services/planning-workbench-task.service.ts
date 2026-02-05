// src/agent/services/planning-workbench-task.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PlanningWorkbenchRequest, PlanningWorkbenchResponse } from './planning-workbench-agent.service';

/**
 * 规划工作台任务状态
 */
export enum PlanningWorkbenchTaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * 规划工作台任务进度
 */
export interface PlanningWorkbenchTaskProgress {
  /**
   * 任务ID
   */
  taskId: string;

  /**
   * 任务状态
   */
  status: PlanningWorkbenchTaskStatus;

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
  result?: PlanningWorkbenchResponse;

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
 * 规划工作台任务服务
 * 
 * 职责：
 * 1. 管理规划工作台任务的创建、更新和查询
 * 2. 提供任务进度跟踪
 * 3. 存储任务结果
 * 
 * 注意：当前使用内存存储，生产环境应该使用Redis或数据库
 */
@Injectable()
export class PlanningWorkbenchTaskService {
  private readonly logger = new Logger(PlanningWorkbenchTaskService.name);

  /**
   * 任务存储（内存存储，重启后丢失）
   * 生产环境应该使用Redis或数据库
   */
  private tasks = new Map<string, PlanningWorkbenchTaskProgress>();

  /**
   * 创建任务
   */
  createTask(): string {
    const taskId = randomUUID();
    const now = new Date().toISOString();

    const task: PlanningWorkbenchTaskProgress = {
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

  /**
   * 获取任务进度
   */
  getTaskProgress(taskId: string): PlanningWorkbenchTaskProgress | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 更新任务进度
   */
  updateProgress(
    taskId: string,
    updates: Partial<PlanningWorkbenchTaskProgress>,
  ): void {
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

  /**
   * 标记任务为运行中
   */
  markRunning(taskId: string, currentStage?: string): void {
    this.updateProgress(taskId, {
      status: PlanningWorkbenchTaskStatus.RUNNING,
      currentStage: currentStage || '正在处理...',
      progress: 0,
    });
  }

  /**
   * 更新进度百分比
   */
  updateProgressPercent(taskId: string, percent: number, stage?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`更新进度失败: 任务不存在 taskId=${taskId}`);
      return;
    }

    const now = Date.now();
    const createdAt = new Date(task.createdAt).getTime();
    const elapsed = now - createdAt;

    // 计算预计剩余时间
    if (percent > 0 && percent < 100) {
      const estimatedTotal = (elapsed / percent) * 100;
      const remaining = estimatedTotal - elapsed;
      this.updateProgress(taskId, {
        progress: percent,
        currentStage: stage || task.currentStage,
        estimatedTimeRemaining: Math.ceil(remaining / 1000), // 转换为秒
      });
      this.logger.debug(`更新任务进度: taskId=${taskId}, progress=${percent}%, stage=${stage || task.currentStage}`);
    } else {
      this.updateProgress(taskId, {
        progress: percent,
        currentStage: stage || task.currentStage,
      });
      this.logger.debug(`更新任务进度: taskId=${taskId}, progress=${percent}%, stage=${stage || task.currentStage}`);
    }
  }

  /**
   * 标记任务为完成
   */
  markCompleted(taskId: string, result: PlanningWorkbenchResponse): void {
    this.updateProgress(taskId, {
      status: PlanningWorkbenchTaskStatus.COMPLETED,
      progress: 100,
      result,
      completedAt: new Date().toISOString(),
      estimatedTimeRemaining: 0,
    });
  }

  /**
   * 标记任务为失败
   */
  markFailed(taskId: string, error: string): void {
    this.updateProgress(taskId, {
      status: PlanningWorkbenchTaskStatus.FAILED,
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
          (task.status === PlanningWorkbenchTaskStatus.COMPLETED || 
           task.status === PlanningWorkbenchTaskStatus.FAILED ||
           task.status === PlanningWorkbenchTaskStatus.CANCELLED)) {
        this.tasks.delete(taskId);
        this.logger.debug(`清理过期任务: taskId=${taskId}`);
      }
    }
  }
}
