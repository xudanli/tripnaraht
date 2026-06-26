import { ProjectFitAppealService } from './services/project-fit-appeal.service';
import { ProjectFitAppealOverturnService } from './services/project-fit-appeal-overturn.service';
import { IdentityAuditLogService } from './services/audit-log.service';
import { ProjectFitAssessmentService } from './services/project-fit-assessment.service';
import { ProjectEligibilityRuleService } from './services/project-eligibility-rule.service';

describe('ProjectFitAppealService', () => {
  const store = {
    appeals: [] as Array<Record<string, unknown>>,
  };

  const prisma = {
    projectFitAppeal: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'appeal-1', createdAt: new Date(), updatedAt: new Date(), ...data };
        store.appeals.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.appeals.find((row) => row.id === where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = store.appeals.find((item) => item.id === where.id);
        Object.assign(row!, data, { updatedAt: new Date() });
        return row;
      },
      findMany: async () => store.appeals,
    },
  };

  const auditLog = { record: jest.fn() } as unknown as IdentityAuditLogService;
  const overturn = {
    applyOverturn: jest.fn().mockResolvedValue({ reopenedApplicationIds: [], resetAssessmentIds: [] }),
  } as unknown as ProjectFitAppealOverturnService;
  let service: ProjectFitAppealService;

  beforeEach(() => {
    store.appeals.length = 0;
    service = new ProjectFitAppealService(prisma as never, auditLog, overturn);
  });

  it('triages SUBMITTED appeal to TRIAGED', async () => {
    await service.submit('user-1', {
      targetType: 'FIT_ASSESSMENT',
      targetId: 'assessment-1',
      reason: '误判',
    });

    const triaged = await service.triage('admin-1', 'appeal-1', '已分诊');
    expect(triaged.status).toBe('TRIAGED');
  });

  it('starts review from TRIAGED to UNDER_REVIEW', async () => {
    await service.submit('user-1', {
      targetType: 'FIT_ASSESSMENT',
      targetId: 'assessment-1',
      reason: '误判',
    });
    await service.triage('admin-1', 'appeal-1');

    const reviewing = await service.startReview('admin-1', 'appeal-1');
    expect(reviewing.status).toBe('UNDER_REVIEW');
  });
});

describe('ProjectFitAssessmentService.getAssessmentStatusForUser', () => {
  const assessments = [
    {
      id: 'a1',
      userId: 'user-1',
      listingId: 'listing-1',
      status: 'COMPLETED',
      overallResult: 'HIGH_FIT',
      ruleSnapshotVersion: 1,
      expiresAt: new Date(Date.now() + 86400000),
      evaluatedAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const prisma = {
    trustedProjectListing: {
      findUnique: async () => ({ id: 'listing-1' }),
    },
    projectFitAssessment: {
      findFirst: async () => assessments[0],
      updateMany: async () => ({ count: 0 }),
    },
  };

  const eligibilityRules = {
    getRuleSnapshotVersion: jest.fn().mockResolvedValue(2),
  } as unknown as ProjectEligibilityRuleService;

  const service = new ProjectFitAssessmentService(
    prisma as never,
    { record: jest.fn() } as never,
    eligibilityRules,
  );

  it('flags needsReassessment when rule version is stale', async () => {
    const status = await service.getAssessmentStatusForUser('user-1', 'listing-1');
    expect(status.needsReassessment).toBe(true);
    expect(status.reasons.ruleStale).toBe(true);
  });

  it('does not flag needsReassessment before first assessment', async () => {
    const noAssessmentPrisma = {
      trustedProjectListing: {
        findUnique: async () => ({ id: 'listing-1' }),
      },
      projectFitAssessment: {
        findFirst: async () => null,
        updateMany: async () => ({ count: 0 }),
      },
    };

    const noAssessmentService = new ProjectFitAssessmentService(
      noAssessmentPrisma as never,
      { record: jest.fn() } as never,
      {
        getRuleSnapshotVersion: jest.fn().mockResolvedValue(1),
      } as unknown as ProjectEligibilityRuleService,
    );

    const status = await noAssessmentService.getAssessmentStatusForUser('user-1', 'listing-1');
    expect(status.hasAssessment).toBe(false);
    expect(status.needsReassessment).toBe(false);
    expect(status.assessment).toBeNull();
  });
});
