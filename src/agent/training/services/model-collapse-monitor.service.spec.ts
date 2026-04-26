// src/agent/training/services/model-collapse-monitor.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ModelCollapseMonitorService } from './model-collapse-monitor.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('ModelCollapseMonitorService', () => {
  let service: ModelCollapseMonitorService;
  let prismaService: jest.Mocked<PrismaService>;

  const createMockTrajectory = (
    score: number,
    reward: number,
    daysAgo: number = 0,
  ) => ({
    trajectoryId: `traj_${score}_${reward}`,
    validationScore: score,
    totalReward: reward,
    modelVersion: 'v1.0',
    createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    plan: {},
    decisionTrace: [{ step: 1, actor: 'architect' }],
  });

  beforeEach(async () => {
    const mockPrismaService = {
      validatedTrajectory: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelCollapseMonitorService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ModelCollapseMonitorService>(
      ModelCollapseMonitorService,
    );
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectCollapseRisk', () => {
    it('should return LOW risk for stable performance', async () => {
      const trajectories = Array.from({ length: 50 }, (_, i) =>
        createMockTrajectory(0.9, 1.5, i),
      );

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.detectCollapseRisk({
        lookbackDays: 30,
        minTrajectories: 20,
      });

      expect(report.riskLevel).toBe('LOW');
      expect(report.riskScore).toBeLessThan(0.3);
      expect(report.indicators.performanceTrend).toBe('STABLE');
    });

    it('should return HIGH risk for declining performance', async () => {
      // First half: high scores
      const firstHalf = Array.from({ length: 25 }, (_, i) =>
        createMockTrajectory(0.95, 2.0, 30 - i),
      );
      // Second half: low scores
      const secondHalf = Array.from({ length: 25 }, (_, i) =>
        createMockTrajectory(0.7, 0.5, 15 - i),
      );

      prismaService.validatedTrajectory.findMany.mockResolvedValue([
        ...firstHalf,
        ...secondHalf,
      ] as any);

      const report = await service.detectCollapseRisk({
        lookbackDays: 30,
        minTrajectories: 20,
      });

      expect(report.indicators.performanceTrend).toBe('DECLINING');
      expect(report.riskLevel).toBe('HIGH');
      expect(report.riskScore).toBeGreaterThan(0.6);
    });

    it('should return INSUFFICIENT_DATA for too few trajectories', async () => {
      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) =>
          createMockTrajectory(0.9, 1.5, i),
        ) as any,
      );

      const report = await service.detectCollapseRisk({
        lookbackDays: 30,
        minTrajectories: 100,
      });

      expect(report.riskLevel).toBe('LOW');
      expect(report.indicators.performanceTrend).toBe('INSUFFICIENT_DATA');
      expect(report.recommendations).toContainEqual(
        expect.stringContaining('需要更多轨迹数据'),
      );
    });

    it('should detect diversity decline', async () => {
      // Create trajectories with similar decision traces (low diversity)
      const trajectories = Array.from({ length: 50 }, (_, i) => ({
        ...createMockTrajectory(0.9, 1.5, i),
        decisionTrace: [{ step: 1, actor: 'architect' }], // All similar
      }));

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.detectCollapseRisk({
        lookbackDays: 30,
        minTrajectories: 20,
      });

      expect(report.metrics.diversityScore).toBeDefined();
      expect(report.metrics.diversityScore).toBeLessThan(1.0);
    });

    it('should detect distribution shift', async () => {
      // First half: consistent scores
      const firstHalf = Array.from({ length: 25 }, (_, i) =>
        createMockTrajectory(0.9, 1.5, 30 - i),
      );
      // Second half: variable scores
      const secondHalf = Array.from({ length: 25 }, (_, i) =>
        createMockTrajectory(
          0.5 + Math.random() * 0.5,
          0.5 + Math.random() * 1.5,
          15 - i,
        ),
      );

      prismaService.validatedTrajectory.findMany.mockResolvedValue([
        ...firstHalf,
        ...secondHalf,
      ] as any);

      const report = await service.detectCollapseRisk({
        lookbackDays: 30,
        minTrajectories: 20,
      });

      expect(report.indicators.distributionShift).toBeDefined();
    });

    it('should filter by modelVersion', async () => {
      prismaService.validatedTrajectory.findMany.mockResolvedValue([]);

      await service.detectCollapseRisk({
        modelVersion: 'v1.0',
        lookbackDays: 30,
      });

      expect(prismaService.validatedTrajectory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            modelVersion: 'v1.0',
          }),
        }),
      );
    });

    it('should generate recommendations', async () => {
      const trajectories = Array.from({ length: 50 }, (_, i) =>
        createMockTrajectory(0.7, 0.5, i), // Declining performance
      );

      prismaService.validatedTrajectory.findMany.mockResolvedValue(
        trajectories as any,
      );

      const report = await service.detectCollapseRisk({
        lookbackDays: 30,
        minTrajectories: 20,
      });

      expect(report.recommendations).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });
});
