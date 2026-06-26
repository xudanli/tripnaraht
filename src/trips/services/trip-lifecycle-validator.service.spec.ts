// src/trips/services/trip-lifecycle-validator.service.spec.ts
/**
 * Unit tests for TripLifecycleValidatorService
 *
 * Tests:
 * 1. State transition validation (valid and invalid)
 * 2. Guard condition validation
 * 3. Backward compatibility
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TripLifecycleValidatorService, extractTripContext, TripContext } from './trip-lifecycle-validator.service';
import { TripStatus, normalizeTripStatus } from '../dto/trip-status.dto';
import { Trip } from '@prisma/client';

describe('TripLifecycleValidatorService', () => {
  let service: TripLifecycleValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TripLifecycleValidatorService],
    }).compile();

    service = module.get<TripLifecycleValidatorService>(TripLifecycleValidatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateTransition', () => {
    describe('Valid transitions', () => {
      it('should allow DRAFT → RECRUITING with required context', () => {
        const context: TripContext = {
          destination: 'JP',
          startDate: new Date('2025-07-01'),
          endDate: new Date('2025-07-07'),
          budgetConfig: { totalBudget: 100000 },
        };

        const result = service.validateTransition(
          TripStatus.DRAFT,
          TripStatus.RECRUITING,
          context,
        );

        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should allow DRAFT → PLANNING with required context', () => {
        const context: TripContext = {
          destination: 'JP',
          startDate: new Date('2025-07-01'),
          endDate: new Date('2025-07-07'),
          budgetConfig: { totalBudget: 100000 },
        };

        const result = service.validateTransition(
          TripStatus.DRAFT,
          TripStatus.PLANNING,
          context,
        );

        expect(result.allowed).toBe(true);
      });

      it('should allow RECRUITING → FORMING with minimum members', () => {
        const context: TripContext = {
          minMembers: 2,
          acceptedMemberCount: 2,
        };

        const result = service.validateTransition(
          TripStatus.RECRUITING,
          TripStatus.FORMING,
          context,
        );

        expect(result.allowed).toBe(true);
      });

      it('should allow RECRUITING → PLANNING with minimum members', () => {
        const context: TripContext = {
          minMembers: 2,
          acceptedMemberCount: 2,
        };

        const result = service.validateTransition(
          TripStatus.RECRUITING,
          TripStatus.PLANNING,
          context,
        );

        expect(result.allowed).toBe(true);
      });

      it('should allow FORMING → PLANNING with member confirmations', () => {
        const context: TripContext = {
          memberConfirmations: true,
        };

        const result = service.validateTransition(
          TripStatus.FORMING,
          TripStatus.PLANNING,
          context,
        );

        expect(result.allowed).toBe(true);
      });

      it('should allow PLANNING → TRAVELING with plan confirmation', () => {
        const context: TripContext = {
          planConfirmed: true,
          startDate: new Date('2025-07-01'),
        };

        const result = service.validateTransition(
          TripStatus.PLANNING,
          TripStatus.TRAVELING,
          context,
        );

        expect(result.allowed).toBe(true);
      });

      it('should allow TRAVELING → COMPLETED with trip ended', () => {
        const context: TripContext = {
          tripEnded: true,
        };

        const result = service.validateTransition(
          TripStatus.TRAVELING,
          TripStatus.COMPLETED,
          context,
        );

        expect(result.allowed).toBe(true);
      });

      it('should allow any state → CANCELLED', () => {
        const result = service.validateTransition(
          TripStatus.PLANNING,
          TripStatus.CANCELLED,
        );

        expect(result.allowed).toBe(true);
      });

      it('should allow idempotent transitions (same state)', () => {
        const result = service.validateTransition(
          TripStatus.PLANNING,
          TripStatus.PLANNING,
        );

        expect(result.allowed).toBe(true);
      });
    });

    describe('Invalid transitions', () => {
      it('should block CANCELLED → any state', () => {
        const result = service.validateTransition(
          TripStatus.CANCELLED,
          TripStatus.PLANNING,
        );

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('不允许从 CANCELLED 转换到 PLANNING');
      });

      it('should block COMPLETED → PLANNING', () => {
        const result = service.validateTransition(
          TripStatus.COMPLETED,
          TripStatus.PLANNING,
        );

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('不允许从 COMPLETED 转换到 PLANNING');
      });

      it('should block COMPLETED → TRAVELING', () => {
        const result = service.validateTransition(
          TripStatus.COMPLETED,
          TripStatus.TRAVELING,
        );

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('不允许从 COMPLETED 转换到 TRAVELING');
      });

      it('should block TRAVELING → PLANNING', () => {
        const result = service.validateTransition(
          TripStatus.TRAVELING,
          TripStatus.PLANNING,
        );

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('不允许从 TRAVELING 转换到 PLANNING');
      });

      it('should block DRAFT → FORMING (not in allowed path)', () => {
        const result = service.validateTransition(
          TripStatus.DRAFT,
          TripStatus.FORMING,
        );

        expect(result.allowed).toBe(false);
      });
    });
  });

  describe('Guard condition validation', () => {
    describe('DRAFT → RECRUITING guard conditions', () => {
      it('should block when destination is missing', () => {
        const context: TripContext = {
          startDate: new Date('2025-07-01'),
          endDate: new Date('2025-07-07'),
          budgetConfig: { totalBudget: 100000 },
        };

        const result = service.validateTransition(
          TripStatus.DRAFT,
          TripStatus.RECRUITING,
          context,
        );

        expect(result.allowed).toBe(false);
        expect(result.missingConditions).toContain('目的地');
        expect(result.reason).toContain('目的地');
      });

      it('should block when startDate is missing', () => {
        const context: TripContext = {
          destination: 'JP',
          endDate: new Date('2025-07-07'),
          budgetConfig: { totalBudget: 100000 },
        };

        const result = service.validateTransition(
          TripStatus.DRAFT,
          TripStatus.RECRUITING,
          context,
        );

        expect(result.allowed).toBe(false);
        expect(result.missingConditions).toContain('开始日期');
      });

      it('should block when endDate is missing', () => {
        const context: TripContext = {
          destination: 'JP',
          startDate: new Date('2025-07-01'),
          budgetConfig: { totalBudget: 100000 },
        };

        const result = service.validateTransition(
          TripStatus.DRAFT,
          TripStatus.RECRUITING,
          context,
        );

        expect(result.allowed).toBe(false);
        expect(result.missingConditions).toContain('结束日期');
      });

      it('should block when budgetConfig is missing', () => {
        const context: TripContext = {
          destination: 'JP',
          startDate: new Date('2025-07-01'),
          endDate: new Date('2025-07-07'),
        };

        const result = service.validateTransition(
          TripStatus.DRAFT,
          TripStatus.RECRUITING,
          context,
        );

        expect(result.allowed).toBe(false);
        expect(result.missingConditions).toContain('预算配置');
      });

      it('should block when multiple conditions are missing', () => {
        const context: TripContext = {
          destination: 'JP',
        };

        const result = service.validateTransition(
          TripStatus.DRAFT,
          TripStatus.RECRUITING,
          context,
        );

        expect(result.allowed).toBe(false);
        expect(result.missingConditions).toContain('开始日期');
        expect(result.missingConditions).toContain('结束日期');
        expect(result.missingConditions).toContain('预算配置');
      });
    });

    describe('RECRUITING → FORMING guard conditions', () => {
      it('should block when not enough accepted members', () => {
        const context: TripContext = {
          minMembers: 3,
          acceptedMemberCount: 2,
        };

        const result = service.validateTransition(
          TripStatus.RECRUITING,
          TripStatus.FORMING,
          context,
        );

        expect(result.allowed).toBe(false);
        expect(result.missingConditions).toContain('至少 3 名已接受成员（当前：2）');
      });

      it('should allow when minimum members met', () => {
        const context: TripContext = {
          minMembers: 3,
          acceptedMemberCount: 3,
        };

        const result = service.validateTransition(
          TripStatus.RECRUITING,
          TripStatus.FORMING,
          context,
        );

        expect(result.allowed).toBe(true);
      });

      it('should default minMembers to 1 when not specified', () => {
        const context: TripContext = {
          acceptedMemberCount: 1,
        };

        const result = service.validateTransition(
          TripStatus.RECRUITING,
          TripStatus.FORMING,
          context,
        );

        expect(result.allowed).toBe(true);
      });
    });

    describe('FORMING → PLANNING guard conditions', () => {
      it('should block when member confirmations missing', () => {
        const context: TripContext = {
          memberConfirmations: false,
        };

        const result = service.validateTransition(
          TripStatus.FORMING,
          TripStatus.PLANNING,
          context,
        );

        expect(result.allowed).toBe(false);
        expect(result.missingConditions).toContain('成员确认');
      });

      it('should allow when member confirmations present', () => {
        const context: TripContext = {
          memberConfirmations: true,
        };

        const result = service.validateTransition(
          TripStatus.FORMING,
          TripStatus.PLANNING,
          context,
        );

        expect(result.allowed).toBe(true);
      });
    });

    describe('PLANNING → TRAVELING guard conditions', () => {
      it('should block when plan confirmation missing', () => {
        const context: TripContext = {
          planConfirmed: false,
          startDate: new Date('2025-07-01'),
        };

        const result = service.validateTransition(
          TripStatus.PLANNING,
          TripStatus.TRAVELING,
          context,
        );

        expect(result.allowed).toBe(false);
        expect(result.missingConditions).toContain('计划确认');
      });

      it('should block when startDate missing', () => {
        const context: TripContext = {
          planConfirmed: true,
        };

        const result = service.validateTransition(
          TripStatus.PLANNING,
          TripStatus.TRAVELING,
          context,
        );

        expect(result.allowed).toBe(false);
        expect(result.missingConditions).toContain('出发时间');
      });

      it('should allow when all conditions met', () => {
        const context: TripContext = {
          planConfirmed: true,
          startDate: new Date('2025-07-01'),
        };

        const result = service.validateTransition(
          TripStatus.PLANNING,
          TripStatus.TRAVELING,
          context,
        );

        expect(result.allowed).toBe(true);
      });
    });

    describe('TRAVELING → COMPLETED guard conditions', () => {
      it('should block when trip not ended', () => {
        const context: TripContext = {
          tripEnded: false,
        };

        const result = service.validateTransition(
          TripStatus.TRAVELING,
          TripStatus.COMPLETED,
          context,
        );

        expect(result.allowed).toBe(false);
        expect(result.missingConditions).toContain('行程结束确认');
      });

      it('should allow when trip ended', () => {
        const context: TripContext = {
          tripEnded: true,
        };

        const result = service.validateTransition(
          TripStatus.TRAVELING,
          TripStatus.COMPLETED,
          context,
        );

        expect(result.allowed).toBe(true);
      });
    });
  });

  describe('validateTransitionOrThrow', () => {
    it('should throw BadRequestException for invalid transition', () => {
      expect(() => {
        service.validateTransitionOrThrow(
          TripStatus.CANCELLED,
          TripStatus.PLANNING,
        );
      }).toThrow(BadRequestException);
    });

    it('should not throw for valid transition', () => {
      expect(() => {
        service.validateTransitionOrThrow(
          TripStatus.DRAFT,
          TripStatus.PLANNING,
          {
            destination: 'JP',
            startDate: new Date('2025-07-01'),
            endDate: new Date('2025-07-07'),
            budgetConfig: { totalBudget: 100000 },
          },
        );
      }).not.toThrow();
    });
  });
});

describe('extractTripContext', () => {
  it('should extract context from Trip entity', () => {
    const trip: Trip = {
      id: 'trip-123',
      destination: 'JP',
      startDate: new Date('2025-07-01'),
      endDate: new Date('2025-07-07'),
      budgetConfig: { totalBudget: 100000 },
      pacingConfig: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'PLANNING',
      name: 'Japan Trip',
      metadata: {
        acceptedMemberCount: 3,
        minMembers: 2,
        memberConfirmations: true,
        planConfirmed: true,
        tripEnded: false,
      },
    } as unknown as Trip;

    const context = extractTripContext(trip);

    expect(context.destination).toBe('JP');
    expect(context.startDate).toEqual(new Date('2025-07-01'));
    expect(context.endDate).toEqual(new Date('2025-07-07'));
    expect(context.budgetConfig).toEqual({ totalBudget: 100000 });
    expect(context.acceptedMemberCount).toBe(3);
    expect(context.minMembers).toBe(2);
    expect(context.memberConfirmations).toBe(true);
    expect(context.planConfirmed).toBe(true);
    expect(context.tripEnded).toBe(false);
  });

  it('should handle missing metadata gracefully', () => {
    const trip: Trip = {
      id: 'trip-123',
      destination: 'JP',
      startDate: new Date('2025-07-01'),
      endDate: new Date('2025-07-07'),
      budgetConfig: { totalBudget: 100000 },
      pacingConfig: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'PLANNING',
      name: 'Japan Trip',
      metadata: null,
    } as unknown as Trip;

    const context = extractTripContext(trip);

    expect(context.destination).toBe('JP');
    expect(context.acceptedMemberCount).toBeUndefined();
    expect(context.minMembers).toBeUndefined();
    expect(context.memberConfirmations).toBeUndefined();
  });
});

describe('normalizeTripStatus', () => {
  it('should map IN_PROGRESS to TRAVELING', () => {
    expect(normalizeTripStatus('IN_PROGRESS')).toBe(TripStatus.TRAVELING);
  });

  it('should return DRAFT for null status', () => {
    expect(normalizeTripStatus(null)).toBe(TripStatus.DRAFT);
  });

  it('should return valid status as-is', () => {
    expect(normalizeTripStatus('PLANNING')).toBe(TripStatus.PLANNING);
    expect(normalizeTripStatus('COMPLETED')).toBe(TripStatus.COMPLETED);
    expect(normalizeTripStatus('CANCELLED')).toBe(TripStatus.CANCELLED);
    expect(normalizeTripStatus('DRAFT')).toBe(TripStatus.DRAFT);
    expect(normalizeTripStatus('RECRUITING')).toBe(TripStatus.RECRUITING);
    expect(normalizeTripStatus('FORMING')).toBe(TripStatus.FORMING);
    expect(normalizeTripStatus('TRAVELING')).toBe(TripStatus.TRAVELING);
  });

  it('should return DRAFT for invalid status', () => {
    expect(normalizeTripStatus('INVALID_STATUS')).toBe(TripStatus.DRAFT);
  });

  it('should handle empty string', () => {
    expect(normalizeTripStatus('')).toBe(TripStatus.DRAFT);
  });
});
