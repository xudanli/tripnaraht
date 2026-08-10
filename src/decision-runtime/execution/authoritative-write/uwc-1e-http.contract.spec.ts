import * as fs from 'fs';
import * as path from 'path';
import { HttpException } from '@nestjs/common';
import {
  ClientWriteProtocolController,
  UWC_1E_HTTP_PATHS,
  UWC_1E_HTTP_ROUTE_PREFIX,
} from './client-write-protocol.controller';
import { createUwc1eClient } from './client-write-protocol.client';
import { UWC_1E_OPENAPI_FREEZE } from './client-write-protocol.openapi.freeze';
import { ClientWriteProtocolService } from './client-write-protocol.service';
import { clearUwc1eProtocolSessionsForTests } from './client-write-protocol.store';
import {
  UWC_1E_PROTOCOL_VERSION,
  UWC_1E_SCHEMA_ID,
} from './client-write-protocol.types';
import { AuthoritativeWriteGatewayService } from './authoritative-write-gateway.service';
import { AuthoritativeWriteHandlerRegistryService } from './corridor-handler.registry';
import { UWC_1C_OCC_UNLOCKED } from './corridor-write-mode.config';
import { UWC_1D_COMPENSATION_EXEC_AUTHORIZED } from './compensation-auth.gate';

describe('UWC-1e HTTP adapter + shared client', () => {
  const registry = new AuthoritativeWriteHandlerRegistryService();
  const gateway = new AuthoritativeWriteGatewayService(registry);
  const protocol = new ClientWriteProtocolService(gateway, registry);
  const controller = new ClientWriteProtocolController(protocol);

  beforeEach(() => {
    clearUwc1eProtocolSessionsForTests();
  });

  it('controller paths match OpenAPI freeze (web=ios)', () => {
    expect(UWC_1E_HTTP_ROUTE_PREFIX).toBe('uwc/v1');
    expect(UWC_1E_OPENAPI_FREEZE.servers[0].url).toBe('/uwc/v1');
    expect(Object.keys(UWC_1E_OPENAPI_FREEZE.paths)).toEqual([
      `/${UWC_1E_HTTP_PATHS.preview}`,
      `/${UWC_1E_HTTP_PATHS.confirm}`,
      `/${UWC_1E_HTTP_PATHS.apply}`,
    ]);
    expect(controller.openApiFreeze()).toBe(UWC_1E_OPENAPI_FREEZE);
  });

  it('DTO source freezes enums aligned with OpenAPI', () => {
    const dtoPath = path.join(__dirname, 'client-write-protocol.http.dto.ts');
    const src = fs.readFileSync(dtoPath, 'utf8');
    expect(src).toContain("stage: 'PREVIEW'");
    expect(src).toContain("stage: 'CONFIRM'");
    expect(src).toContain("stage: 'APPLY'");
    expect(src).toContain('explicitConfirm');
    expect(src).toContain('UWC_1E_PRODUCT_SURFACES');
    expect(src).toContain('UWC_1E_FIRST_BATCH_SLICES');
  });

  it('HTTP Preview → Confirm → Apply happy path (web)', async () => {
    const preview = await controller.preview({
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'PREVIEW',
      productSurface: 'web',
      slice: 'actions_commit',
      tripId: 't-http-1',
      intendedMutation: {
        request_id: 'r-http',
        context_signature: 'sig-http',
      },
      expectedWriteVersion: {
        kind: 'RESOURCE_VERSION_SET',
        resources: [{ resourceId: 't-http-1', expectedVersion: 1 }],
      },
    });
    expect(preview.draft.applyPipelineEntered).toBe(false);

    const confirm = await controller.confirm({
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'CONFIRM',
      draftId: preview.draft.draftId,
      explicitConfirm: true,
      productSurface: 'web',
    });
    expect(confirm.applyPipelineEntered).toBe(false);

    const prev = process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT;
    process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT = 'AUTHORITATIVE';
    try {
      const applied = await controller.apply({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'APPLY',
        draftId: preview.draft.draftId,
        confirmationId: confirm.confirmationId,
        idempotencyKey: 'idem-http-1',
        productSurface: 'web',
      });
      expect(applied.stage).toBe('APPLY');
      expect(applied.applyPipelineStages.length).toBe(7);
    } finally {
      if (prev === undefined) delete process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT;
      else process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT = prev;
    }
  });

  it('excluded capability → HTTP 403 protocol reject', async () => {
    try {
      await controller.preview({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'PREVIEW',
        productSurface: 'ios',
        slice: 'actions_commit',
        tripId: 't-x',
        intendedMutation: { capability: 'mixedTargets' },
        expectedWriteVersion: { kind: 'NO_VERSION_REQUIRED' },
      });
      fail('expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(403);
      expect(ex.getResponse()).toMatchObject({
        errorCode: 'EXCLUDED_CAPABILITY',
      });
    }
  });

  it('shared client uses freeze paths for web and ios', async () => {
    const calls: string[] = [];
    const client = createUwc1eClient({
      baseUrl: 'https://example.test/api',
      fetchImpl: async (url, init) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          productSurface: string;
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            schemaId: UWC_1E_SCHEMA_ID,
            protocolVersion: UWC_1E_PROTOCOL_VERSION,
            stage: 'PREVIEW',
            sessionState: 'DRAFT',
            draft: {
              draftId: `draft_${body.productSurface}`,
              productSurface: body.productSurface,
              writesPerformed: false,
              applyPipelineEntered: false,
            },
            reasonCodes: ['PREVIEW_DRAFT_ONLY'],
          }),
        };
      },
    });

    await client.preview({
      productSurface: 'web',
      slice: 'actions_commit',
      tripId: 't1',
      intendedMutation: {},
      expectedWriteVersion: { kind: 'NO_VERSION_REQUIRED' },
    });
    await client.preview({
      productSurface: 'ios',
      slice: 'unified_plan_version_only',
      tripId: 't2',
      intendedMutation: {},
      expectedWriteVersion: {
        kind: 'PLAN_VERSION',
        expectedPlanVersionId: 'pv',
      },
    });

    expect(calls).toEqual([
      'POST https://example.test/api/uwc/v1/write/preview',
      'POST https://example.test/api/uwc/v1/write/preview',
    ]);
    expect(client.clientRules.webIosSameContract).toBe(true);
    expect(client.clientRules.conflictMustRePreview).toBe(true);
  });

  it('OCC + compensation unlocked (UWC-OCC/COMP-UNLOCK-01) via HTTP layer markers', () => {
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
    expect(UWC_1E_OPENAPI_FREEZE['x-uwc-locks'].globalOccUnlock).toBe(true);
    expect(UWC_1E_OPENAPI_FREEZE['x-uwc-locks'].compensationExec).toBe(true);
  });
});
