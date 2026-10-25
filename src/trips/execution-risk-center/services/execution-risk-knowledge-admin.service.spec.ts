import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ExecutionRiskKnowledgeAdminService } from './execution-risk-knowledge-admin.service';

function createService(prisma: Record<string, unknown>, knowledgeRepo?: Record<string, unknown>) {
  return new ExecutionRiskKnowledgeAdminService(
    prisma as never,
    (knowledgeRepo ?? {
      getPackageRoot: () => '/pkg',
      getDefaultVersionId: () => 'v1.0.0',
      getCacheSource: () => 'package-files',
      refreshCache: jest.fn().mockResolvedValue(undefined),
    }) as never,
  );
}

describe('ExecutionRiskKnowledgeAdminService (P0)', () => {
  it('getActiveVersion returns package fallback when no active row', async () => {
    const prisma = {
      executionRiskKnowledgeVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const svc = createService(prisma);
    const result = await svc.getActiveVersion();
    expect(result.version).toBeNull();
    expect(result.runtimeFallback?.source).toBe('package-files');
  });

  it('getVersion throws NotFound for missing id', async () => {
    const prisma = {
      executionRiskKnowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const svc = createService(prisma);
    await expect(svc.getVersion('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('activateVersion rejects non-VALIDATED when requireValidated', async () => {
    const prisma = {
      executionRiskKnowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'erv_1',
          status: 'DRAFT',
          isActive: false,
        }),
        findFirst: jest.fn(),
      },
    };
    const svc = createService(prisma);
    await expect(svc.activateVersion('erv_1', { requireValidated: true })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('deprecateVersion blocks active without force', async () => {
    const prisma = {
      executionRiskKnowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'erv_1',
          status: 'VALIDATED',
          isActive: true,
        }),
      },
    };
    const svc = createService(prisma);
    await expect(svc.deprecateVersion('erv_1', false)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listDefinitions maps rows for a version', async () => {
    const prisma = {
      executionRiskKnowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 'erv_1', status: 'DRAFT' }),
      },
      executionRiskDefinition: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            canonicalCode: 'WEATHER_STRONG_WIND',
            knowledgeCode: 'ENV-WIND-01',
            riskType: 'ENVIRONMENT',
            displayName: { zh: '强风' },
            definition: 'wind',
            isRootCause: true,
            sourceAliases: [],
            status: 'DRAFT',
            since: '2026-07-09',
            generationMode: null,
            capabilityStatus: null,
          },
        ]),
      },
    };
    const svc = createService(prisma);
    const result = await svc.listDefinitions('erv_1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.knowledgeCode).toBe('ENV-WIND-01');
  });
});
