import { parseDocumentFields, mergeQualificationsFromDocuments } from './utils/document-ocr-parser.util';
import { ProjectFitAppealOverturnService } from './services/project-fit-appeal-overturn.service';

describe('document-ocr-parser.util', () => {
  it('extracts passport number and qualification types', () => {
    const fields = parseDocumentFields('PASSPORT', [
      '姓名：张三',
      'PASSPORT NO E12345678',
      '有效期 2028-12-31',
    ]);
    expect(fields.documentNumber).toBe('E12345678');
    expect(fields.fullName).toBe('张三');

    const certFields = parseDocumentFields('QUALIFICATION_CERT', [
      'PADI AOW 潜水证',
      'First Aid 急救培训',
    ]);
    expect(certFields.qualificationTypes).toEqual(
      expect.arrayContaining(['DIVING', 'FIRST_AID']),
    );
  });

  it('merges qualification types from multiple documents', () => {
    const merged = mergeQualificationsFromDocuments(['GUIDE_LICENSE'], [
      { qualificationTypes: ['FIRST_AID'] },
      { qualificationTypes: ['DIVING'] },
    ]);
    expect(merged).toEqual(expect.arrayContaining(['GUIDE_LICENSE', 'FIRST_AID', 'DIVING']));
  });
});

describe('ProjectFitAppealOverturnService', () => {
  const applications: Array<Record<string, unknown>> = [];
  const assessments: Array<Record<string, unknown>> = [];

  const prisma = {
    trustedProjectApplication: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        applications.find((a) => a.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { fitAssessmentId: string } }) =>
        applications.find((a) => a.fitAssessmentId === where.fitAssessmentId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = applications.find((a) => a.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    projectFitAssessment: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        assessments.find((a) => a.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = assessments.find((a) => a.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
  };

  const auditLog = { record: jest.fn() };
  const domainEvents = { emit: jest.fn() };
  const service = new ProjectFitAppealOverturnService(
    prisma as never,
    auditLog as never,
    domainEvents as never,
  );

  beforeEach(() => {
    applications.length = 0;
    assessments.length = 0;
    jest.clearAllMocks();
  });

  it('reopens REJECTED application when appeal is UPHELD', async () => {
    applications.push({
      id: 'app-1',
      applicantUserId: 'user-1',
      listingId: 'listing-1',
      status: 'REJECTED',
      fitAssessmentId: 'assess-1',
      listing: { commercialType: 'NON_COMMERCIAL' },
    });

    const result = await service.applyOverturn({
      id: 'appeal-1',
      submitterId: 'user-1',
      targetType: 'APPLICATION',
      targetId: 'app-1',
      status: 'UPHELD',
    });

    expect(result.reopenedApplicationIds).toEqual(['app-1']);
    expect(applications[0].status).toBe('UNDER_REVIEW');
    expect(applications[0].leaderDecision).toBeNull();
    expect(domainEvents.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'appeal.application_reopened' }),
    );
  });

  it('resets assessment and reopens linked application for FIT_ASSESSMENT appeal', async () => {
    assessments.push({
      id: 'assess-1',
      userId: 'user-1',
      status: 'COMPLETED',
      overallResult: 'NOT_RECOMMENDED',
    });
    applications.push({
      id: 'app-1',
      applicantUserId: 'user-1',
      listingId: 'listing-1',
      status: 'REJECTED',
      fitAssessmentId: 'assess-1',
      listing: { commercialType: 'COMMERCIAL' },
    });

    const result = await service.applyOverturn({
      id: 'appeal-2',
      submitterId: 'user-1',
      targetType: 'FIT_ASSESSMENT',
      targetId: 'assess-1',
      status: 'PARTIALLY_UPHELD',
    });

    expect(result.resetAssessmentIds).toEqual(['assess-1']);
    expect(result.reopenedApplicationIds).toEqual(['app-1']);
    expect(assessments[0].status).toBe('IN_PROGRESS');
    expect(assessments[0].overallResult).toBeNull();
  });

  it('does nothing when appeal is REJECTED', async () => {
    applications.push({
      id: 'app-1',
      status: 'REJECTED',
      listing: { commercialType: 'NON_COMMERCIAL' },
    });

    const result = await service.applyOverturn({
      id: 'appeal-3',
      submitterId: 'user-1',
      targetType: 'APPLICATION',
      targetId: 'app-1',
      status: 'REJECTED',
    });

    expect(result.reopenedApplicationIds).toEqual([]);
    expect(applications[0].status).toBe('REJECTED');
  });
});
