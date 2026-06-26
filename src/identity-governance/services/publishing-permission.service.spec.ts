import { PublishingPermissionService } from './publishing-permission.service';
import { IdentityAuditLogService } from './audit-log.service';
import { ProfessionalCertificationService } from './professional-certification.service';
import { AgencyCertificationService } from './agency-certification.service';
import { VerificationService } from './verification.service';

describe('PublishingPermissionService', () => {
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) } as unknown as IdentityAuditLogService;
  const professionalCertification = {
    getStatus: jest.fn().mockResolvedValue({ isVerifiedProfessional: false }),
  } as unknown as ProfessionalCertificationService;
  const agencyCertification = {
    isOrganizationVerified: jest.fn().mockResolvedValue(false),
  } as unknown as AgencyCertificationService;
  const verification = {
    getSummary: jest.fn().mockResolvedValue({ emailVerified: true, phoneVerified: false }),
  } as unknown as VerificationService;

  function createService(state: {
    publishingRows?: Array<Record<string, unknown>>;
    subscriptionRows?: Array<Record<string, unknown>>;
    organizationMembers?: Array<Record<string, unknown>>;
  }) {
    const publishingRows = [...(state.publishingRows ?? [])];
    const subscriptionRows = [...(state.subscriptionRows ?? [])];
    const organizationMembers = [...(state.organizationMembers ?? [])];

    const prisma = {
      subscription: {
        findFirst: jest.fn(async ({ where }: { where: { accountId: string } }) =>
          subscriptionRows.find((row) => row.accountId === where.accountId) ?? null,
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          subscriptionRows.push(data);
          return data;
        }),
      },
      publishingPermission: {
        findFirst: jest.fn(async ({ where }: { where: { subjectId?: string; status?: string } }) =>
          publishingRows.find(
            (row) =>
              row.subjectId === where.subjectId &&
              (where.status ? row.status === where.status : true),
          ) ?? null,
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          publishingRows.push({ ...data, grantedAt: new Date(), suspendedAt: null });
          return data;
        }),
      },
      publishingPermissionApplication: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      organizationMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(async ({ where }: { where: { userId: string; status?: string } }) =>
          organizationMembers.filter(
            (row) =>
              row.userId === where.userId &&
              (where.status ? row.status === where.status : true),
          ),
        ),
      },
    };

    return {
      service: new PublishingPermissionService(
        prisma as never,
        auditLog,
        professionalCertification,
        agencyCertification,
        verification,
      ),
      professionalCertification,
      organizationMembers,
    };
  }

  it('always blocks legacy match square public recruit', async () => {
    const { service } = createService({
      publishingRows: [
        {
          subjectType: 'USER',
          subjectId: 'user-1',
          level: 'PUBLIC_NON_COMMERCIAL',
          status: 'ACTIVE',
          reason: 'pilot',
          grantedAt: new Date(),
          suspendedAt: null,
        },
      ],
    });
    const check = await service.canPublicRecruit('user-1');
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('搭子广场公开招募已暂停');
  });

  it('blocks trusted project publish without certification even when permission is public', async () => {
    const { service } = createService({
      subscriptionRows: [{ accountId: 'user-2', status: 'ACTIVE', plan: 'FREE' }],
      publishingRows: [
        {
          subjectType: 'USER',
          subjectId: 'user-2',
          level: 'PUBLIC_NON_COMMERCIAL',
          status: 'ACTIVE',
          reason: 'pilot',
          grantedAt: new Date(),
          suspendedAt: null,
        },
      ],
    });

    const check = await service.canPublishPublicTrustedProject('user-2');
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('专业领队或机构认证');
  });

  it('allows trusted project publish when professional verified and permission is public', async () => {
    const { service, professionalCertification } = createService({
      subscriptionRows: [{ accountId: 'user-3', status: 'ACTIVE', plan: 'PROFESSIONAL_PRO' }],
      publishingRows: [
        {
          subjectType: 'USER',
          subjectId: 'user-3',
          level: 'PUBLIC_NON_COMMERCIAL',
          status: 'ACTIVE',
          reason: 'pilot',
          grantedAt: new Date(),
          suspendedAt: null,
        },
      ],
    });
    (professionalCertification.getStatus as jest.Mock).mockResolvedValue({
      isVerifiedProfessional: true,
    });

    const check = await service.canPublishPublicTrustedProject('user-3');
    expect(check.allowed).toBe(true);
  });

  it('allows trusted project publish when user belongs to a verified agency', async () => {
    const { service } = createService({
      subscriptionRows: [{ accountId: 'user-4', status: 'ACTIVE', plan: 'AGENCY_PLAN' }],
      publishingRows: [
        {
          subjectType: 'USER',
          subjectId: 'user-4',
          level: 'PUBLIC_COMMERCIAL',
          status: 'ACTIVE',
          reason: 'pilot',
          grantedAt: new Date(),
          suspendedAt: null,
        },
      ],
      organizationMembers: [
        {
          userId: 'user-4',
          status: 'ACTIVE',
          Organization: { verificationStatus: 'VERIFIED' },
        },
      ],
    });

    const check = await service.canPublishPublicTrustedProject('user-4');
    expect(check.allowed).toBe(true);
  });
});
