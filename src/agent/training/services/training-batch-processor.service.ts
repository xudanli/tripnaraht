// src/agent/training/services/training-batch-processor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TrainingDataPreparationService, TrainingBatch } from './training-data-preparation.service';

/**
 * TrainingBatchProcessorService
 * 
 * 职责：异步批量处理训练数据准备和导出
 * 
 * 功能：
 * 1. 创建批量处理任务
 * 2. 异步执行任务
 * 3. 跟踪任务进度
 * 4. 查询任务状态
 */
@Injectable()
export class TrainingBatchProcessorService {
  private readonly logger = new Logger(TrainingBatchProcessorService.name);
  private readonly activeTasks = new Map<string, BatchTask>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly trainingDataPrep: TrainingDataPreparationService,
  ) {}

  /**
   * 创建批量处理任务
   */
  async createBatchTask(options: {
    minScore?: number;
    minReward?: number;
    maxUsageCount?: number;
    batchSize?: number;
    modelVersion?: string;
    countryCode?: string;
    exportFormat?: 'jsonl' | 'json' | 'both' | 'none';
    outputPath?: string;
  }): Promise<BatchTask> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const task: BatchTask = {
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

    // 异步执行任务
    this.processBatchTask(task).catch((error) => {
      this.logger.error(
        `[BatchProcessor] 任务执行失败: taskId=${taskId}, error=${error?.message}`,
        error?.stack,
      );
      task.status = 'failed';
      task.error = error?.message || 'Unknown error';
      task.updatedAt = new Date();
    });

    this.logger.log(`[BatchProcessor] 创建批量处理任务: taskId=${taskId}`);

    return task;
  }

  /**
   * 处理批量任务
   */
  private async processBatchTask(task: BatchTask): Promise<void> {
    try {
      // 阶段 1: 准备训练批次
      task.status = 'processing';
      task.currentStage = 'preparing';
      task.progress = 0;
      task.updatedAt = new Date();

      this.logger.log(
        `[BatchProcessor] 开始准备训练批次: taskId=${task.taskId}`,
      );

      const batch = await this.trainingDataPrep.prepareTrainingBatch(
        task.options,
      );

      task.progress = 50;
      task.currentStage = 'prepared';
      task.updatedAt = new Date();

      this.logger.log(
        `[BatchProcessor] 训练批次准备完成: taskId=${task.taskId}, count=${batch.trajectories.length}`,
      );

      // 阶段 2: 导出（如果需要）
      if (task.options.exportFormat && task.options.exportFormat !== 'none') {
        task.currentStage = 'exporting';
        task.progress = 60;
        task.updatedAt = new Date();

        const exportResults: any = {};

        if (
          task.options.exportFormat === 'jsonl' ||
          task.options.exportFormat === 'both'
        ) {
          const jsonlPath =
            task.options.outputPath ||
            `./exports/training_batch_${batch.batchId}_${Date.now()}.jsonl`;
          const jsonlResult = await this.trainingDataPrep.exportToJSONL(
            batch,
            jsonlPath,
          );
          exportResults.jsonl = jsonlResult;
          task.progress = 80;
          task.updatedAt = new Date();
        }

        if (
          task.options.exportFormat === 'json' ||
          task.options.exportFormat === 'both'
        ) {
          const jsonPath =
            task.options.outputPath ||
            `./exports/training_batch_${batch.batchId}_${Date.now()}.json`;
          const jsonResult = await this.trainingDataPrep.exportToJSON(
            batch,
            jsonPath,
          );
          exportResults.json = jsonResult;
          task.progress = 90;
          task.updatedAt = new Date();
        }

        task.result = {
          batch,
          exports: exportResults,
        };
      } else {
        task.result = {
          batch,
        };
      }

      // 完成
      task.status = 'completed';
      task.currentStage = 'completed';
      task.progress = 100;
      task.updatedAt = new Date();

      this.logger.log(
        `[BatchProcessor] 批量处理任务完成: taskId=${task.taskId}`,
      );
    } catch (error: any) {
      task.status = 'failed';
      task.error = error?.message || 'Unknown error';
      task.updatedAt = new Date();
      throw error;
    }
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): BatchTask | null {
    return this.activeTasks.get(taskId) || null;
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): BatchTask[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * 获取活跃任务
   */
  getActiveTasks(): BatchTask[] {
    return Array.from(this.activeTasks.values()).filter(
      (task) => task.status === 'pending' || task.status === 'processing',
    );
  }

  /**
   * 清理已完成的任务（保留最近 N 个）
   */
  cleanupCompletedTasks(keepCount: number = 100): void {
    const completedTasks = Array.from(this.activeTasks.values())
      .filter((task) => task.status === 'completed' || task.status === 'failed')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    if (completedTasks.length > keepCount) {
      const toRemove = completedTasks.slice(keepCount);
      for (const task of toRemove) {
        this.activeTasks.delete(task.taskId);
      }
      this.logger.log(
        `[BatchProcessor] 清理了 ${toRemove.length} 个已完成的任务`,
      );
    }
  }
}

/**
 * 批量处理任务
 */
export interface BatchTask {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentStage:
    | 'preparing'
    | 'prepared'
    | 'exporting'
    | 'completed'
    | 'failed';
  options: {
    minScore?: number;
    minReward?: number;
    maxUsageCount?: number;
    batchSize?: number;
    modelVersion?: string;
    countryCode?: string;
    exportFormat?: 'jsonl' | 'json' | 'both' | 'none';
    outputPath?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  error: string | null;
  result: {
    batch: TrainingBatch;
    exports?: {
      jsonl?: { filePath: string; lineCount: number };
      json?: { filePath: string; recordCount: number };
    };
  } | null;
}
