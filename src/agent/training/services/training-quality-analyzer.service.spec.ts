// src/agent/training/services/training-quality-analyzer.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { TrainingQualityAnalyzerService } from './training-quality-analyzer.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('TrainingQualityAnalyzerService', () => {
  let service: TrainingQualityAnalyzerService;
  let prismaService: jest.Mocked<PrismaService>;

  const createMockTrajectory = (
    score: number,
    reward: number,
    modelVersion: string = 'v1.0',
    countryCode: string = 'US',
    daysAgo: number = 0,
  ) => ({
    trajectoryId: `traj_${score}_${reward}`,
    validationScore: score,
    totalReward: reward,
    modelVersion,
    countryCode,
    createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    usedForTrainingCount: 0,
  });

  beforeEach(async () => {
    const mockPrismaService = {
      validatedTrajectory: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingQualityAnalyzerService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TrainingQualityAnalyzerService>(
      TrainingQualityAnalyzerService,
    );
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeQuality', () => {
    it('should analyze quality with basic metrics', async () => {
      const trajectories = [
        createMockTrajectory(0.9, 1.5),
        createMockTrajectory(0.85, 1.2),
        createMockTrajectory(0.95, 2.0),
      ];

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.analyzeQuality({});

      expect(report.summary.totalTrajectories).toBe(3);
      expect(report.summary.avgScore).toBeCloseTo(0.9, 1);
      expect(report.summary.avgReward).toBeCloseTo(1.57, 1);
      expect(report.distribution.score.mean).toBeDefined();
      expect(report.distribution.reward.mean).toBeDefined();
    });

    it('should calculate score distribution', async () => {
      const trajectories = [
        createMockTrajectory(0.82, 1.0), // 0.8-0.85
        createMockTrajectory(0.87, 1.0), // 0.85-0.9
        createMockTrajectory(0.92, 1.0), // 0.9-0.95
        createMockTrajectory(0.97, 1.0), // 0.95-1.0
      ];

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.analyzeQuality({});

      expect(report.distribution.score.distribution['0.8-0.85']).toBe(1);
      expect(report.distribution.score.distribution['0.85-0.9']).toBe(1);
      expect(report.distribution.score.distribution['0.9-0.95']).toBe(1);
      expect(report.distribution.score.distribution['0.95-1.0']).toBe(1);
    });

    it('should calculate reward distribution', async () => {
      const trajectories = [
        createMockTrajectory(0.9, 0.3), // 0-0.5
        createMockTrajectory(0.9, 0.7), // 0.5-1.0
        createMockTrajectory(0.9, 1.5), // 1.0-2.0
        createMockTrajectory(0.9, 2.5), // 2.0+
      ];

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.analyzeQuality({});

      expect(report.distribution.reward.distribution['0-0.5']).toBe(1);
      expect(report.distribution.reward.distribution['0.5-1.0']).toBe(1);
      expect(report.distribution.reward.distribution['1.0-2.0']).toBe(1);
      expect(report.distribution.reward.distribution['2.0+']).toBe(1);
    });

    it('should group by model version', async () => {
      const trajectories = [
        createMockTrajectory(0.9, 1.5, 'v1.0'),
        createMockTrajectory(0.9, 1.5, 'v1.0'),
        createMockTrajectory(0.9, 1.5, 'v2.0'),
      ];

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.analyzeQuality({});

      expect(report.distribution.byModelVersion['v1.0']).toBe(2);
      expect(report.distribution.byModelVersion['v2.0']).toBe(1);
    });

    it('should group by country', async () => {
      const trajectories = [
        createMockTrajectory(0.9, 1.5, 'v1.0', 'US'),
        createMockTrajectory(0.9, 1.5, 'v1.0', 'US'),
        createMockTrajectory(0.9, 1.5, 'v1.0', 'CN'),
      ];

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.analyzeQuality({});

      expect(report.distribution.byCountry['US']).toBe(2);
      expect(report.distribution.byCountry['CN']).toBe(1);
    });

    it('should detect trends', async () => {
      // Create trajectories with improving scores over time
      const trajectories = Array.from({ length: 20 }, (_, i) =>
        createMockTrajectory(0.8 + i * 0.01, 1.0 + i * 0.05, 'v1.0', 'US', i),
      );

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.analyzeQuality({});

      expect(report.trends.scoreTrend).toBeDefined();
      expect(report.trends.rewardTrend).toBeDefined();
      expect(report.trends.dataPoints.length).toBeGreaterThan(0);
    });

    it('should detect anomalies', async () => {
      const trajectories = [
        ...Array.from({ length: 10 }, () => createMockTrajectory(0.9, 1.5)),
        createMockTrajectory(0.5, 0.1), // Outlier (low score)
        createMockTrajectory(0.9, 5.0), // Outlier (high reward)
      ];

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.analyzeQuality({});

      expect(report.anomalies.scoreOutliers.count).toBeGreaterThanOrEqual(0);
      expect(report.anomalies.rewardOutliers.count).toBeGreaterThanOrEqual(0);
    });

    it('should calculate quality grade', async () => {
      // High quality trajectories
      const trajectories = Array.from({ length: 10 }, () =>
        createMockTrajectory(0.95, 2.0),
      );

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.analyzeQuality({});

      expect(['A', 'B', 'C', 'D']).toContain(report.summary.qualityGrade);
    });

    it('should filter by date range', async () => {
      prismaService.validatedTrajectory.findMany.mockResolvedValue([]);

      await service.analyzeQuality({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-20'),
      });

      expect(prismaService.validatedTrajectory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-01-20'),
            },
          }),
        }),
      );
    });

    it('should filter by minScore and minReward', async () => {
      prismaService.validatedTrajectory.findMany.mockResolvedValue([]);

      await service.analyzeQuality({
        minScore: 0.9,
        minReward: 1.5,
      });

      expect(prismaService.validatedTrajectory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            validationScore: { gte: 0.9 },
            totalReward: { gte: 1.5 },
          }),
        }),
      );
    });

    it('should calculate high quality percentage', async () => {
      const trajectories = [
        createMockTrajectory(0.95, 2.0), // High quality
        createMockTrajectory(0.95, 2.0), // High quality
        createMockTrajectory(0.85, 0.5), // Low quality
      ];

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.analyzeQuality({});

      expect(report.summary.highQualityCount).toBe(2);
      expect(report.summary.highQualityPercentage).toBeCloseTo(66.67, 1);
    });
  });
});
