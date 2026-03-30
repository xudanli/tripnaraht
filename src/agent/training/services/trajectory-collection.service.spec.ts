// src/agent/training/services/trajectory-collection.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { TrajectoryCollectionService } from './trajectory-collection.service';
import { TrajectoryValidatorService } from './trajectory-validator.service';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { GateResult } from '../../interfaces/trip-plan.interface';
import { ApprovalStatus } from '@prisma/client';
import { ComplianceResult, ExecutionResult } from '../interfaces/trajectory.interface';

describe('TrajectoryCollectionService', () => {
  let service: TrajectoryCollectionService;
  let prismaService: jest.Mocked<PrismaService>;
  let validatorService: jest.Mocked<TrajectoryValidatorService>;

  const mockTrajectory = {
    id: 'test-id',
    trajectoryId: 'traj_test_123',
    requestId: 'req_test_123',
    tripId: null,
    validationStatus: 'VALIDATED',
    validationScore: 0.9,
    validationReasons: ['Gate ALLOW', 'User approved'],
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
    totalReward: 0,
    rewardSignals: [],
    userApproval: null,
    executionResult: null,
    modelVersion: 'v1.0',
    countryCode: null,
    timestamp: new Date(),
    usedForTraining: false,
    trainingBatchId: null,
    usedForTrainingCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      validatedTrajectory: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockValidatorService = {
      validateTrajectory: jest.fn().mockResolvedValue({
        isValid: true,
        score: 0.9,
        reasons: ['Gate ALLOW'],
      }),
    };

    const mockRewardExtractorService = {
      extractFromApproval: jest.fn().mockReturnValue([
        { type: 'USER_APPROVAL', value: 1.0, timestamp: '2026-01-20T00:00:00Z' },
      ]),
      extractFromExecution: jest.fn().mockReturnValue([
        { type: 'EXECUTION_SUCCESS', value: 0.8, timestamp: '2026-01-20T00:00:00Z' },
      ]),
      mergeSignals: jest.fn((...arrays) => arrays.flat()),
      calculateTotalReward: jest.fn((signals) =>
        signals.reduce((sum: number, s: any) => sum + s.value, 0),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrajectoryCollectionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: TrajectoryValidatorService,
          useValue: mockValidatorService,
        },
        {
          provide: RewardSignalExtractorService,
          useValue: mockRewardExtractorService,
        },
      ],
    }).compile();

    service = module.get<TrajectoryCollectionService>(
      TrajectoryCollectionService,
    );
    prismaService = module.get(PrismaService);
    validatorService = module.get(TrajectoryValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('collectTrajectory', () => {
    const validGateResult: GateResult = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.9,
    };

    const validComplianceResult: ComplianceResult = {
      risk_warnings: [],
      disclaimers: [],
      required_confirmations: [],
    };

    const collectionData = {
      requestId: 'req_test_123',
      tripId: undefined,
      plan: { request_id: 'req_test_123', days: [] },
      decisionTrace: [],
      researchData: {},
      gateResult: validGateResult,
      complianceResult: validComplianceResult,
      modelVersion: 'v1.0',
      countryCode: undefined,
    };

    it('should collect trajectory successfully', async () => {
      prismaService.validatedTrajectory.create.mockResolvedValue({
        ...mockTrajectory,
        trajectoryId: 'traj_req_test_123_1234567890',
        validationStatus: 'VALIDATED',
      });

      const result = await service.collectTrajectory(collectionData);

      expect(result.trajectoryId).toBeDefined();
      expect(result.status).toBe('VALIDATED');
      expect(prismaService.validatedTrajectory.create).toHaveBeenCalled();
      expect(validatorService.validateTrajectory).toHaveBeenCalled();
    });

    it('should handle collection errors gracefully', async () => {
      prismaService.validatedTrajectory.create.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.collectTrajectory(collectionData)).rejects.toThrow();
    });
  });

  describe('updateTrajectoryWithApproval', () => {
    it('should update trajectory with APPROVED status', async () => {
      prismaService.validatedTrajectory.findUnique.mockResolvedValue(
        mockTrajectory as any,
      );
      prismaService.validatedTrajectory.update.mockResolvedValue({
        ...mockTrajectory,
        userApproval: ApprovalStatus.APPROVED,
        validationStatus: 'VALIDATED',
      } as any);

      validatorService.validateTrajectory.mockResolvedValue({
        isValid: true,
        score: 1.0,
        reasons: ['Gate ALLOW', 'User approved'],
      });

      await service.updateTrajectoryWithApproval(
        'traj_test_123',
        ApprovalStatus.APPROVED,
      );

      expect(prismaService.validatedTrajectory.findUnique).toHaveBeenCalledWith(
        {
          where: { trajectoryId: 'traj_test_123' },
        },
      );
      expect(prismaService.validatedTrajectory.update).toHaveBeenCalled();
      expect(validatorService.validateTrajectory).toHaveBeenCalled();
    });

    it('should throw error if trajectory not found', async () => {
      prismaService.validatedTrajectory.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTrajectoryWithApproval(
          'nonexistent',
          ApprovalStatus.APPROVED,
        ),
      ).rejects.toThrow('轨迹不存在');
    });
  });

  describe('updateTrajectoryWithExecution', () => {
    it('should update trajectory with successful execution', async () => {
      prismaService.validatedTrajectory.findUnique.mockResolvedValue(
        mockTrajectory as any,
      );
      prismaService.validatedTrajectory.update.mockResolvedValue({
        ...mockTrajectory,
        executionResult: { success: true },
        validationStatus: 'VALIDATED',
      } as any);

      validatorService.validateTrajectory.mockResolvedValue({
        isValid: true,
        score: 1.0,
        reasons: ['Gate ALLOW', 'Execution succeeded'],
      });

      const executionResult: ExecutionResult = {
        success: true,
      };

      await service.updateTrajectoryWithExecution(
        'traj_test_123',
        executionResult,
      );

      expect(prismaService.validatedTrajectory.findUnique).toHaveBeenCalled();
      expect(prismaService.validatedTrajectory.update).toHaveBeenCalled();
      expect(validatorService.validateTrajectory).toHaveBeenCalled();
    });

    it('should update trajectory with failed execution', async () => {
      prismaService.validatedTrajectory.findUnique.mockResolvedValue(
        mockTrajectory as any,
      );
      prismaService.validatedTrajectory.update.mockResolvedValue({
        ...mockTrajectory,
        executionResult: { success: false, error: 'Execution failed' },
        validationStatus: 'REJECTED',
      } as any);

      validatorService.validateTrajectory.mockResolvedValue({
        isValid: false,
        score: 0,
        reasons: ['Execution failed'],
      });

      const executionResult: ExecutionResult = {
        success: false,
        error: 'Execution failed',
      };

      await service.updateTrajectoryWithExecution(
        'traj_test_123',
        executionResult,
      );

      expect(prismaService.validatedTrajectory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            validationStatus: 'REJECTED',
          }),
        }),
      );
    });
  });

  describe('findTrajectoryByRequestId', () => {
    it('should find trajectory by requestId', async () => {
      prismaService.validatedTrajectory.findFirst.mockResolvedValue({
        trajectoryId: 'traj_test_123',
      } as any);

      const result = await service.findTrajectoryByRequestId('req_test_123');

      expect(result.trajectoryId).toBe('traj_test_123');
      expect(prismaService.validatedTrajectory.findFirst).toHaveBeenCalledWith(
        {
          where: { requestId: 'req_test_123' },
          orderBy: { createdAt: 'desc' },
          select: { trajectoryId: true },
        },
      );
    });

    it('should return null if trajectory not found', async () => {
      prismaService.validatedTrajectory.findFirst.mockResolvedValue(null);

      const result = await service.findTrajectoryByRequestId('nonexistent');

      expect(result.trajectoryId).toBeNull();
    });
  });
});
