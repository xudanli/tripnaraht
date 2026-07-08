import { ValidationPipe } from '@nestjs/common';
import { SubmitResolutionBodyDto } from './submit-resolution-body.dto';

describe('SubmitResolutionBodyDto (ValidationPipe whitelist)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    skipNullProperties: true,
    skipUndefinedProperties: true,
    transformOptions: { enableImplicitConversion: true },
  });

  async function transformBody(payload: Record<string, unknown>): Promise<SubmitResolutionBodyDto> {
    return pipe.transform(payload, {
      type: 'body',
      metatype: SubmitResolutionBodyDto,
    }) as Promise<SubmitResolutionBodyDto>;
  }

  it('preserves selectedActionId (global whitelist must not strip it)', async () => {
    const body = await transformBody({
      selectedActionId: 'option-1',
      idempotencyKey: 'resolution:probe',
    });
    expect(body.selectedActionId).toBe('option-1');
    expect(body.idempotencyKey).toBe('resolution:probe');
  });

  it('preserves actionId alias', async () => {
    const body = await transformBody({ actionId: 'option-2' });
    expect(body.actionId).toBe('option-2');
  });

  it('preserves causalTraceRef on submit body', async () => {
    const body = await transformBody({
      selectedActionId: 'option-1',
      causalTraceRef: {
        traceId: 'ct_abc123',
        worldStateVersion: 'ws_v1',
        protocolVersion: 'causal-trace-v1',
      },
    });
    expect(body.causalTraceRef?.traceId).toBe('ct_abc123');
    expect(body.causalTraceRef?.worldStateVersion).toBe('ws_v1');
  });

  it('strips unknown fields', async () => {
    const body = await transformBody({
      selectedActionId: 'option-1',
      unknownField: 'drop-me',
    });
    expect(body).not.toHaveProperty('unknownField');
  });
});
