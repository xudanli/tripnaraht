import { ConflictException } from '@nestjs/common';
import { ExecutionRiskKnowledgeAdminDraftService } from './execution-risk-knowledge-admin-draft.service';

describe('ExecutionRiskKnowledgeAdminDraftService', () => {
  function create(prisma: Record<string, unknown>) {
    return new ExecutionRiskKnowledgeAdminDraftService(prisma as never);
  }

  it('rejects edits when version is not DRAFT', async () => {
    const prisma = {
      executionRiskKnowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 'erv_1', status: 'VALIDATED' }),
      },
    };
    const svc = create(prisma);
    await expect(svc.assertDraftEditable('erv_1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows edits for DRAFT version', async () => {
    const prisma = {
      executionRiskKnowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 'erv_1', status: 'DRAFT' }),
      },
    };
    const svc = create(prisma);
    await expect(svc.assertDraftEditable('erv_1')).resolves.toMatchObject({ status: 'DRAFT' });
  });

  it('createDefinition writes and returns mapped row', async () => {
    const created = {
      id: 'erv_1:ENV-TEST-01',
      canonicalCode: 'TEST',
      knowledgeCode: 'ENV-TEST-01',
      riskType: 'ENVIRONMENT',
      displayName: { zh: '测试' },
      definition: 'desc',
      isRootCause: true,
      sourceAliases: [],
      status: 'DRAFT',
      since: null,
      generationMode: null,
      capabilityStatus: null,
    };
    const prisma = {
      executionRiskKnowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 'erv_1', status: 'DRAFT' }),
      },
      executionRiskDefinition: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(created),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const svc = create(prisma);
    const result = await svc.createDefinition('erv_1', {
      canonicalCode: 'TEST',
      knowledgeCode: 'ENV-TEST-01',
      riskType: 'ENVIRONMENT',
      displayName: { zh: '测试' },
      definition: 'desc',
    });
    expect(result.knowledgeCode).toBe('ENV-TEST-01');
    expect(prisma.executionRiskDefinition.create).toHaveBeenCalled();
  });
});
