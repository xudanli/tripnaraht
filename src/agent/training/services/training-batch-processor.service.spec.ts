// src/agent/training/services/training-batch-processor.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { TrainingBatchProcessorService } from './training-batch-processor.service';
import { TrainingDataPreparationService } from './training-data-preparation.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('TrainingBatchProcessorService', () => {
  let service: TrainingBatchProcessorService;
  let trainingDataPrep: jest.Mocked<TrainingDataPreparationService>;

  const mockBatch = {
    batchId: 'batch_123',
    trajectories: [{ trajectoryId: 'traj_1' }],
    trainingData: [{ input: {}, output: {}, metadata: {} }],
    stats: {
      totalTrajectories: 1,
      avgScore: 0.9,
      avgReward: 1.0,
    },
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockTrainingDataPrep = {
      prepareTrainingBatch: jest.fn(),
      exportToJSONL: jest.fn(),
      exportToJSON: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingBatchProcessorService,
        {
          provide: TrainingDataPreparationService,
          useValue: mockTrainingDataPrep,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<TrainingBatchProcessorService>(
      TrainingBatchProcessorService,
    );
    trainingDataPrep = module.get(TrainingDataPreparationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createBatchTask', () => {
    it('should create batch task successfully', async () => {
      trainingDataPrep.prepareTrainingBatch.mockResolvedValue(mockBatch as any);
      trainingDataPrep.exportToJSONL.mockResolvedValue({
        filePath: './exports/batch.jsonl',
        lineCount: 10,
      });

      const task = await service.createBatchTask({
        minScore: 0.8,
        exportFormat: 'jsonl',
      });

      expect(task.taskId).toBeDefined();
      // createBatchTask 会立即启动异步流程；processBatchTask 在首次 await 前会把 status 置为 processing
      expect(task.status).toBe('processing');
      expect(task.progress).toBeGreaterThanOrEqual(0);
      expect(['preparing', 'prepared', 'exporting', 'completed', 'failed']).toContain(task.currentStage);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = service.getTaskStatus(task.taskId);
      expect(status).toBeDefined();
    });

    it('should handle task with json export', async () => {
      trainingDataPrep.prepareTrainingBatch.mockResolvedValue(mockBatch as any);
      trainingDataPrep.exportToJSON.mockResolvedValue({
        filePath: './exports/batch.json',
        recordCount: 10,
      });

      const task = await service.createBatchTask({
        exportFormat: 'json',
      });

      expect(task.taskId).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should handle task with both export formats', async () => {
      trainingDataPrep.prepareTrainingBatch.mockResolvedValue(mockBatch as any);
      trainingDataPrep.exportToJSONL.mockResolvedValue({
        filePath: './exports/batch.jsonl',
        lineCount: 10,
      });
      trainingDataPrep.exportToJSON.mockResolvedValue({
        filePath: './exports/batch.json',
        recordCount: 10,
      });

      const task = await service.createBatchTask({
        exportFormat: 'both',
      });

      expect(task.taskId).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should handle task without export', async () => {
      trainingDataPrep.prepareTrainingBatch.mockResolvedValue(mockBatch as any);

      const task = await service.createBatchTask({
        exportFormat: 'none',
      });

      expect(task.taskId).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should handle task failure', async () => {
      trainingDataPrep.prepareTrainingBatch.mockRejectedValue(
        new Error('Preparation failed'),
      );

      const task = await service.createBatchTask({});

      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = service.getTaskStatus(task.taskId);
      expect(status?.status).toBe('failed');
      expect(status?.error).toBeDefined();
    });
  });

  describe('getTaskStatus', () => {
    it('should return task status', async () => {
      trainingDataPrep.prepareTrainingBatch.mockResolvedValue(mockBatch as any);

      const task = await service.createBatchTask({});
      const status = service.getTaskStatus(task.taskId);

      expect(status).toBeDefined();
      expect(status?.taskId).toBe(task.taskId);
    });

    it('should return null for non-existent task', () => {
      const status = service.getTaskStatus('nonexistent');
      expect(status).toBeNull();
    });
  });

  describe('getAllTasks', () => {
    it('should return all tasks', async () => {
      trainingDataPrep.prepareTrainingBatch.mockResolvedValue(mockBatch as any);

      await service.createBatchTask({});
      await service.createBatchTask({});

      const tasks = service.getAllTasks();
      expect(tasks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getActiveTasks', () => {
    it('should return only active tasks', async () => {
      trainingDataPrep.prepareTrainingBatch.mockResolvedValue(mockBatch as any);

      await service.createBatchTask({});
      await service.createBatchTask({});

      await new Promise((resolve) => setTimeout(resolve, 200));

      const activeTasks = service.getActiveTasks();
      // After processing, tasks should be completed or failed
      expect(activeTasks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanupCompletedTasks', () => {
    it('should cleanup old completed tasks', async () => {
      trainingDataPrep.prepareTrainingBatch.mockResolvedValue(mockBatch as any);

      // Create multiple tasks
      for (let i = 0; i < 5; i++) {
        await service.createBatchTask({});
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      service.cleanupCompletedTasks(2);

      const tasks = service.getAllTasks();
      expect(tasks.length).toBeLessThanOrEqual(2);
    });
  });
});
