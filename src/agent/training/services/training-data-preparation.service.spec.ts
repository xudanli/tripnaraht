// src/agent/training/services/training-data-preparation.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { TrainingDataPreparationService } from './training-data-preparation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

jest.mock('fs/promises');

describe('TrainingDataPreparationService', () => {
  let service: TrainingDataPreparationService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockTrajectories = [
    {
      trajectoryId: 'traj_1',
      requestId: 'req_1',
      tripId: null,
      validationScore: 0.9,
      totalReward: 1.5,
      modelVersion: 'v1.0',
      countryCode: 'US',
      createdAt: new Date(),
      plan: { request_id: 'req_1', days: [] },
      decisionTrace: [{ step: 1, actor: 'architect' }],
      researchData: {},
      gateResult: { gate_result: 'ALLOW' },
      complianceResult: { risk_warnings: [] },
      timestamp: new Date(),
    },
    {
      trajectoryId: 'traj_2',
      requestId: 'req_2',
      tripId: null,
      validationScore: 0.85,
      totalReward: 1.2,
      modelVersion: 'v1.0',
      countryCode: 'CN',
      createdAt: new Date(),
      plan: { request_id: 'req_2', days: [] },
      decisionTrace: [{ step: 1, actor: 'architect' }],
      researchData: {},
      gateResult: { gate_result: 'ALLOW' },
      complianceResult: { risk_warnings: [] },
      timestamp: new Date(),
    },
  ];

  beforeEach(async () => {
    const mockPrismaService = {
      validatedTrajectory: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingDataPreparationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TrainingDataPreparationService>(
      TrainingDataPreparationService,
    );
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('prepareTrainingBatch', () => {
    it('should prepare training batch with default options', async () => {
      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        mockTrajectories as any,
      );

      const result = await service.prepareTrainingBatch({});

      expect(result.batchId).toBeDefined();
      expect(result.trajectories).toHaveLength(2);
      expect(result.trainingData).toHaveLength(2);
      expect(result.stats.totalTrajectories).toBe(2);
      expect(result.stats.avgScore).toBeCloseTo(0.875);
      expect(result.stats.avgReward).toBeCloseTo(1.35);
    });

    it('should filter by minScore', async () => {
      prismaService.validatedTrajectory.findMany.mockResolvedValue([
        mockTrajectories[0],
      ] as any);

      const result = await service.prepareTrainingBatch({ minScore: 0.9 });

      expect(result.trajectories).toHaveLength(1);
      expect(prismaService.validatedTrajectory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            validationScore: { gte: 0.9 },
          }),
        }),
      );
    });

    it('should filter by minReward', async () => {
      prismaService.validatedTrajectory.findMany.mockResolvedValue([
        mockTrajectories[0],
      ] as any);

      await service.prepareTrainingBatch({ minReward: 1.5 });

      expect(prismaService.validatedTrajectory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            totalReward: { gt: 1.5 },
          }),
        }),
      );
    });

    it('should filter by maxUsageCount', async () => {
      prismaService.validatedTrajectory.findMany.mockResolvedValue([]);

      await service.prepareTrainingBatch({ maxUsageCount: 2 });

      expect(prismaService.validatedTrajectory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            usedForTrainingCount: { lt: 2 },
          }),
        }),
      );
    });

    it('should limit batch size', async () => {
      const largeTrajectories = Array.from({ length: 2000 }, (_, i) => ({
        ...mockTrajectories[0],
        trajectoryId: `traj_${i}`,
      }));

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        largeTrajectories as any,
      );

      const result = await service.prepareTrainingBatch({ batchSize: 1000 });

      expect(result.trajectories.length).toBeLessThanOrEqual(1000);
      expect(prismaService.validatedTrajectory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1000,
        }),
      );
    });
  });

  describe('markAsUsed', () => {
    it('should mark trajectories as used', async () => {
      prismaService.validatedTrajectory.updateMany.mockResolvedValue({
        count: 2,
      } as any);

      await service.markAsUsed(['traj_1', 'traj_2'], 'batch_123');

      expect(prismaService.validatedTrajectory.updateMany).toHaveBeenCalledWith(
        {
          where: {
            trajectoryId: { in: ['traj_1', 'traj_2'] },
          },
          data: {
            usedForTraining: true,
            usedForTrainingCount: { increment: 1 },
            trainingBatchId: 'batch_123',
          },
        },
      );
    });
  });

  describe('exportToJSONL', () => {
    it('should export batch to JSONL format', async () => {
      const mockBatch = {
        batchId: 'batch_123',
        trajectories: [],
        trainingData: [
          {
            input: {
              user_request: 'Test request',
              research_data: {},
              gate_result: {},
              compliance_result: {},
            },
            output: {
              plan: {},
              decision_trace: [],
              reasoning: 'Test reasoning',
            },
            metadata: {
              trajectory_id: 'traj_1',
              request_id: 'req_1',
              trip_id: null,
              validation_score: 0.9,
              total_reward: 1.5,
              model_version: 'v1.0',
              timestamp: '2026-01-20T00:00:00Z',
            },
          },
        ],
        stats: {},
        createdAt: new Date(),
      };

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await service.exportToJSONL(
        mockBatch as any,
        './exports/batch.jsonl',
      );

      expect(result.filePath).toBe('./exports/batch.jsonl');
      expect(result.lineCount).toBe(1);
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.dirname('./exports/batch.jsonl'),
        { recursive: true },
      );
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('exportToJSON', () => {
    it('should export batch to JSON format', async () => {
      const mockBatch = {
        batchId: 'batch_123',
        trajectories: [],
        trainingData: [
          {
            input: {
              user_request: 'Test request',
              research_data: {},
              gate_result: {},
              compliance_result: {},
            },
            output: {
              plan: {},
              decision_trace: [],
              reasoning: 'Test reasoning',
            },
            metadata: {
              trajectory_id: 'traj_1',
              request_id: 'req_1',
              trip_id: null,
              validation_score: 0.9,
              total_reward: 1.5,
              model_version: 'v1.0',
              timestamp: '2026-01-20T00:00:00Z',
            },
          },
        ],
        stats: {},
        createdAt: new Date(),
      };

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await service.exportToJSON(
        mockBatch as any,
        './exports/batch.json',
      );

      expect(result.filePath).toBe('./exports/batch.json');
      expect(result.recordCount).toBe(1);
      expect(fs.writeFile).toHaveBeenCalledWith(
        './exports/batch.json',
        expect.stringContaining('batch_id'),
        'utf-8',
      );
    });
  });
});
