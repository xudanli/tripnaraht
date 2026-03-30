// src/agent/training/training.controller.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { TrainingController } from './training.controller';
import { TrajectoryCollectionService } from './services/trajectory-collection.service';
import { TrajectoryValidatorService } from './services/trajectory-validator.service';
import { TrainingDataPreparationService } from './services/training-data-preparation.service';
import { TrainingMetricsService } from './services/training-metrics.service';
import { TrainingBatchProcessorService } from './services/training-batch-processor.service';
import { ModelCollapseMonitorService } from './services/model-collapse-monitor.service';
import { TrainingQualityAnalyzerService } from './services/training-quality-analyzer.service';
import { CollectTrajectoryDto, ValidateTrajectoryDto } from './dto/trajectory.dto';

describe('TrainingController', () => {
  let controller: TrainingController;
  let collectionService: jest.Mocked<TrajectoryCollectionService>;
  let validatorService: jest.Mocked<TrajectoryValidatorService>;
  let trainingDataPrepService: jest.Mocked<TrainingDataPreparationService>;
  let metricsService: jest.Mocked<TrainingMetricsService>;
  let batchProcessor: jest.Mocked<TrainingBatchProcessorService>;
  let collapseMonitor: jest.Mocked<ModelCollapseMonitorService>;
  let qualityAnalyzer: jest.Mocked<TrainingQualityAnalyzerService>;

  const mockCollectionService = {
    collectTrajectory: jest.fn(),
    updateTrajectoryWithApproval: jest.fn(),
    updateTrajectoryWithExecution: jest.fn(),
    findTrajectoryByRequestId: jest.fn(),
  };

  const mockValidatorService = {
    validateTrajectory: jest.fn(),
  };

  const mockTrainingDataPrepService = {
    prepareTrainingBatch: jest.fn(),
    markAsUsed: jest.fn(),
    exportToJSONL: jest.fn(),
    exportToJSON: jest.fn(),
  };

  const mockMetricsService = {
    getCollectionStats: jest.fn(),
    getTrainingDataQuality: jest.fn(),
  };

  const mockBatchProcessor = {
    createBatchTask: jest.fn(),
    getTaskStatus: jest.fn(),
    getAllTasks: jest.fn(),
  };

  const mockCollapseMonitor = {
    detectCollapseRisk: jest.fn(),
  };

  const mockQualityAnalyzer = {
    analyzeQuality: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingController],
      providers: [
        {
          provide: TrajectoryCollectionService,
          useValue: mockCollectionService,
        },
        {
          provide: TrajectoryValidatorService,
          useValue: mockValidatorService,
        },
        {
          provide: TrainingDataPreparationService,
          useValue: mockTrainingDataPrepService,
        },
        {
          provide: TrainingMetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: TrainingBatchProcessorService,
          useValue: mockBatchProcessor,
        },
        {
          provide: ModelCollapseMonitorService,
          useValue: mockCollapseMonitor,
        },
        {
          provide: TrainingQualityAnalyzerService,
          useValue: mockQualityAnalyzer,
        },
      ],
    }).compile();

    controller = module.get<TrainingController>(TrainingController);
    collectionService = module.get(TrajectoryCollectionService);
    validatorService = module.get(TrajectoryValidatorService);
    trainingDataPrepService = module.get(TrainingDataPreparationService);
    metricsService = module.get(TrainingMetricsService);
    batchProcessor = module.get(TrainingBatchProcessorService);
    collapseMonitor = module.get(ModelCollapseMonitorService);
    qualityAnalyzer = module.get(TrainingQualityAnalyzerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /training/trajectories/collect', () => {
    const validDto: CollectTrajectoryDto = {
      requestId: 'req_test_123',
      tripId: undefined,
      plan: { request_id: 'req_test_123', days: [] },
      decisionTrace: [],
      researchData: {},
      gateResult: {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        confidence: 0.9,
      },
      complianceResult: {
        risk_warnings: [],
        disclaimers: [],
        required_confirmations: [],
      },
      modelVersion: 'v1.0',
      countryCode: undefined,
    };

    it('should collect trajectory successfully', async () => {
      collectionService.collectTrajectory.mockResolvedValue({
        trajectoryId: 'traj_test_123',
        status: 'VALIDATED',
      });

      const result = await controller.collectTrajectory(validDto);

      expect(result.success).toBe(true);
      expect(result.data.trajectoryId).toBe('traj_test_123');
      expect(result.data.status).toBe('VALIDATED');
      expect(collectionService.collectTrajectory).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req_test_123',
        }),
      );
    });

    it('should handle collection errors', async () => {
      collectionService.collectTrajectory.mockRejectedValue(
        new Error('Collection failed'),
      );

      await expect(controller.collectTrajectory(validDto)).rejects.toThrow();
    });
  });

  describe('POST /training/trajectories/:id/validate', () => {
    const validateDto: ValidateTrajectoryDto = {
      gateResult: {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        confidence: 0.9,
      },
      complianceResult: {
        risk_warnings: [],
        disclaimers: [],
        required_confirmations: [],
      },
      userApproval: 'APPROVED',
      executionResult: {
        success: true,
      },
    };

    it('should validate trajectory successfully', async () => {
      validatorService.validateTrajectory.mockResolvedValue({
        isValid: true,
        score: 0.95,
        reasons: ['Gate ALLOW', 'User approved'],
      });

      const result = await controller.validateTrajectory(
        'traj_test_123',
        validateDto,
      );

      expect(result.success).toBe(true);
      expect(result.data.isValid).toBe(true);
      expect(result.data.score).toBe(0.95);
      expect(result.data.validationStatus).toBe('VALIDATED');
      expect(validatorService.validateTrajectory).toHaveBeenCalled();
    });

    it('should reject invalid trajectory', async () => {
      validatorService.validateTrajectory.mockResolvedValue({
        isValid: false,
        score: 0,
        reasons: ['Gate BLOCK'],
      });

      const result = await controller.validateTrajectory(
        'traj_test_123',
        validateDto,
      );

      expect(result.success).toBe(true);
      expect(result.data.isValid).toBe(false);
      expect(result.data.validationStatus).toBe('REJECTED');
    });

    it('should throw error if gateResult and complianceResult are missing', async () => {
      const invalidDto: ValidateTrajectoryDto = {};

      await expect(
        controller.validateTrajectory('traj_test_123', invalidDto),
      ).rejects.toThrow('gateResult 和 complianceResult 必须提供');
    });
  });

  describe('GET /training/trajectories/by-request/:requestId', () => {
    it('should find trajectory by requestId', async () => {
      collectionService.findTrajectoryByRequestId.mockResolvedValue({
        trajectoryId: 'traj_test_123',
      });

      const result = await controller.findTrajectoryByRequestId('req_test_123');

      expect(result.success).toBe(true);
      expect(result.data.trajectoryId).toBe('traj_test_123');
      expect(collectionService.findTrajectoryByRequestId).toHaveBeenCalledWith(
        'req_test_123',
      );
    });

    it('should return null if trajectory not found', async () => {
      collectionService.findTrajectoryByRequestId.mockResolvedValue({
        trajectoryId: null,
      });

      const result = await controller.findTrajectoryByRequestId('nonexistent');

      expect(result.success).toBe(true);
      expect(result.data.trajectoryId).toBeNull();
    });
  });

  describe('POST /training/batches/prepare', () => {
    it('should prepare training batch successfully', async () => {
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

      trainingDataPrepService.prepareTrainingBatch.mockResolvedValue(mockBatch as any);

      const result = await controller.prepareTrainingBatch({
        minScore: 0.8,
        minReward: 0,
        batchSize: 1000,
      });

      expect(result.success).toBe(true);
      expect(result.data.batchId).toBe('batch_123');
      expect(result.data.trajectoryCount).toBe(1);
      expect(trainingDataPrepService.prepareTrainingBatch).toHaveBeenCalled();
    });
  });

  describe('POST /training/batches/:batchId/export/jsonl', () => {
    it('should export batch to JSONL successfully', async () => {
      const mockBatch = {
        batchId: 'batch_123',
        trajectories: [],
        trainingData: [],
        stats: {},
        createdAt: new Date(),
      };

      trainingDataPrepService.prepareTrainingBatch.mockResolvedValue(mockBatch as any);
      trainingDataPrepService.exportToJSONL.mockResolvedValue({
        filePath: './exports/batch.jsonl',
        lineCount: 10,
      });

      const result = await controller.exportBatchToJSONL('batch_123', {});

      expect(result.success).toBe(true);
      expect(result.data.filePath).toBe('./exports/batch.jsonl');
      expect(result.data.lineCount).toBe(10);
    });
  });

  describe('POST /training/batches/:batchId/export/json', () => {
    it('should export batch to JSON successfully', async () => {
      const mockBatch = {
        batchId: 'batch_123',
        trajectories: [],
        trainingData: [],
        stats: {},
        createdAt: new Date(),
      };

      trainingDataPrepService.prepareTrainingBatch.mockResolvedValue(mockBatch as any);
      trainingDataPrepService.exportToJSON.mockResolvedValue({
        filePath: './exports/batch.json',
        recordCount: 10,
      });

      const result = await controller.exportBatchToJSON('batch_123', {});

      expect(result.success).toBe(true);
      expect(result.data.filePath).toBe('./exports/batch.json');
      expect(result.data.recordCount).toBe(10);
    });
  });

  describe('POST /training/batches/process-async', () => {
    it('should create async batch task successfully', async () => {
      const mockTask = {
        taskId: 'task_123',
        status: 'pending' as const,
        progress: 0,
        currentStage: 'preparing' as const,
        options: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        error: null,
        result: null,
      };

      batchProcessor.createBatchTask.mockResolvedValue(mockTask as any);

      const result = await controller.createBatchTask({
        minScore: 0.8,
        exportFormat: 'jsonl',
      });

      expect(result.success).toBe(true);
      expect(result.data.taskId).toBe('task_123');
      expect(batchProcessor.createBatchTask).toHaveBeenCalled();
    });
  });

  describe('GET /training/batches/tasks/:taskId', () => {
    it('should get task status successfully', async () => {
      const mockTask = {
        taskId: 'task_123',
        status: 'completed' as const,
        progress: 100,
        currentStage: 'completed' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        error: null,
        result: {
          batch: {
            batchId: 'batch_123',
            trajectories: [],
          },
        },
      };

      batchProcessor.getTaskStatus.mockReturnValue(mockTask as any);

      const result = await controller.getTaskStatus('task_123');

      expect(result.success).toBe(true);
      expect(result.data.taskId).toBe('task_123');
      expect(result.data.status).toBe('completed');
    });

    it('should return error if task not found', async () => {
      batchProcessor.getTaskStatus.mockReturnValue(null);

      const result = await controller.getTaskStatus('nonexistent');

      expect(result.success).toBe(false);
      expect(result.data.error).toBe('Task not found');
    });
  });

  describe('GET /training/metrics/collection-stats', () => {
    it('should get collection stats successfully', async () => {
      const mockStats = {
        totalTrajectories: 100,
        validatedCount: 80,
        rejectedCount: 20,
        pendingCount: 0,
        validationRate: 0.8,
        avgValidationScore: 0.9,
        avgReward: 1.5,
        byModelVersion: { 'v1.0': 100 },
        byCountry: { 'US': 50, 'CN': 50 },
      };

      metricsService.getCollectionStats.mockResolvedValue(mockStats);

      const result = await controller.getCollectionStats({});

      expect(result.success).toBe(true);
      expect(result.data.totalTrajectories).toBe(100);
      expect(result.data.validationRate).toBe(0.8);
    });
  });

  describe('GET /training/metrics/training-quality', () => {
    it('should get training quality metrics successfully', async () => {
      const mockQuality = {
        eligibleCount: 50,
        avgScore: 0.92,
        avgReward: 1.5,
        scoreDistribution: {
          '0.8-0.9': 10,
          '0.9-0.95': 20,
          '0.95-1.0': 20,
        },
        rewardDistribution: {
          '0-1': 10,
          '1-2': 30,
          '2+': 10,
        },
      };

      metricsService.getTrainingDataQuality.mockResolvedValue(mockQuality);

      const result = await controller.getTrainingQuality({});

      expect(result.success).toBe(true);
      expect(result.data.eligibleCount).toBe(50);
      expect(result.data.avgScore).toBe(0.92);
    });
  });

  describe('GET /training/monitoring/collapse-risk', () => {
    it('should detect collapse risk successfully', async () => {
      const mockReport = {
        riskLevel: 'LOW' as const,
        riskScore: 0.2,
        indicators: {
          performanceTrend: 'STABLE' as const,
          diversityTrend: 'STABLE' as const,
          distributionShift: 'STABLE' as const,
        },
        metrics: {
          trajectoryCount: 100,
          avgScore: 0.9,
          avgReward: 1.5,
          diversityScore: 0.75,
        },
        recommendations: ['✅ 当前未检测到 Model Collapse 风险'],
        timestamp: new Date(),
      };

      collapseMonitor.detectCollapseRisk.mockResolvedValue(mockReport);

      const result = await controller.detectCollapseRisk({
        modelVersion: 'v1.0',
        lookbackDays: 30,
      });

      expect(result.success).toBe(true);
      expect(result.data.riskLevel).toBe('LOW');
      expect(result.data.riskScore).toBe(0.2);
    });
  });

  describe('GET /training/analysis/quality', () => {
    it('should analyze quality successfully', async () => {
      const mockAnalysis = {
        summary: {
          totalTrajectories: 100,
          highQualityCount: 70,
          highQualityPercentage: 70,
          avgScore: 0.92,
          avgReward: 1.5,
          scoreTrend: 'STABLE' as const,
          rewardTrend: 'INCREASING' as const,
          qualityGrade: 'A' as const,
        },
        distribution: {
          score: {
            mean: 0.92,
            median: 0.93,
            stdDev: 0.05,
            min: 0.8,
            max: 1.0,
            distribution: {},
          },
          reward: {
            mean: 1.5,
            median: 1.5,
            stdDev: 0.3,
            min: 0.5,
            max: 2.5,
            distribution: {},
          },
          byModelVersion: {},
          byCountry: {},
          byWeek: {},
        },
        trends: {
          scoreTrend: 'STABLE' as const,
          rewardTrend: 'INCREASING' as const,
          dataPoints: [],
        },
        anomalies: {
          scoreOutliers: {
            count: 2,
            percentage: 2,
            trajectoryIds: [],
          },
          rewardOutliers: {
            count: 1,
            percentage: 1,
            trajectoryIds: [],
          },
        },
        timestamp: new Date(),
      };

      qualityAnalyzer.analyzeQuality.mockResolvedValue(mockAnalysis);

      const result = await controller.analyzeQuality({
        startDate: '2026-01-01',
        endDate: '2026-01-20',
      });

      expect(result.success).toBe(true);
      expect(result.data.summary.qualityGrade).toBe('A');
      expect(result.data.summary.totalTrajectories).toBe(100);
    });
  });
});
