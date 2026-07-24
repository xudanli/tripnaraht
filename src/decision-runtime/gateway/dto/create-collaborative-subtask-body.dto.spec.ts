import { ValidationPipe } from '@nestjs/common';
import { CreateCollaborativeSubTaskBodyDto } from './create-collaborative-subtask-body.dto';

describe('CreateCollaborativeSubTaskBodyDto (ValidationPipe whitelist)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    skipNullProperties: true,
    skipUndefinedProperties: true,
    transformOptions: { enableImplicitConversion: true },
  });

  async function transformBody(
    payload: Record<string, unknown>,
  ): Promise<CreateCollaborativeSubTaskBodyDto> {
    return pipe.transform(payload, {
      type: 'body',
      metatype: CreateCollaborativeSubTaskBodyDto,
    }) as Promise<CreateCollaborativeSubTaskBodyDto>;
  }

  it('preserves resolutionId and title', async () => {
    const body = await transformBody({
      resolutionId: 'res_p1_abc',
      title: '查取消政策',
      kind: 'CANCELLATION_POLICY',
    });
    expect(body.resolutionId).toBe('res_p1_abc');
    expect(body.title).toBe('查取消政策');
    expect(body.kind).toBe('CANCELLATION_POLICY');
  });

  it('allows omitting resolutionId (binds to active resolution server-side)', async () => {
    const body = await transformBody({ title: '团队确认' });
    expect(body.resolutionId).toBeUndefined();
    expect(body.title).toBe('团队确认');
  });
});
