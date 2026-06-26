import { BadRequestException } from '@nestjs/common';
import { Gate1RuntimeCommandHandler } from './gate1-runtime-command.handler';
import { Gate1RuntimeCommandType } from '../../decision-runtime/commands/gate1-runtime-command.types';
import { RuntimeCanonicalEventType } from '../../decision-runtime/types/runtime-event-catalog';

describe('Gate1RuntimeCommandHandler', () => {
  const prisma = {
    gate1ConflictFinding: { findUnique: jest.fn() },
    gate1ReadinessFinding: { findUnique: jest.fn() },
  };
  const decisions = { submit: jest.fn() };
  const conflicts = { publish: jest.fn(), recordFeedback: jest.fn(), recordFindingAction: jest.fn() };
  const candidates = { publish: jest.fn() };
  const readiness = { publish: jest.fn(), upsertDraft: jest.fn(), recordFeedback: jest.fn(), recordFindingAction: jest.fn() };
  const planB = { publish: jest.fn() };
  const outcomes = { submitOutcome: jest.fn() };
  const participants = { recordConsent: jest.fn(), savePreferences: jest.fn() };
  const privacy = { reviewSanitized: jest.fn() };
  const runtimeEvents = {
    commandRejected: jest.fn().mockResolvedValue({ persisted: true }),
  };

  let handler: Gate1RuntimeCommandHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new Gate1RuntimeCommandHandler(
      prisma as any,
      decisions as any,
      conflicts as any,
      candidates as any,
      readiness as any,
      planB as any,
      outcomes as any,
      participants as any,
      privacy as any,
      runtimeEvents as any,
    );
  });

  it('delegates PUBLISH_CANDIDATE to candidate service', async () => {
    candidates.publish.mockResolvedValue({ id: 'c1' });
    const dto = { humanMinutes: 30 };

    await handler.execute({
      type: Gate1RuntimeCommandType.PUBLISH_CANDIDATE,
      projectId: 'p1',
      candidateId: 'c1',
      actorId: 'u1',
      dto,
    });

    expect(candidates.publish).toHaveBeenCalledWith('p1', 'c1', 'u1', dto);
  });

  it('records COMMAND_REJECTED on 4xx and rethrows', async () => {
    conflicts.publish.mockRejectedValue(
      new BadRequestException('Conflict report must contain findings'),
    );

    await expect(
      handler.execute({
        type: Gate1RuntimeCommandType.PUBLISH_CONFLICT,
        projectId: 'p1',
        version: 1,
        actorId: 'u1',
        dto: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await new Promise((r) => setImmediate(r));

    expect(runtimeEvents.commandRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        commandType: Gate1RuntimeCommandType.PUBLISH_CONFLICT,
        actorId: 'u1',
        statusCode: 400,
        reason: 'Conflict report must contain findings',
      }),
    );
  });

  it('resolves projectId from findingId for rejection events', async () => {
    prisma.gate1ReadinessFinding.findUnique.mockResolvedValue({
      report: { projectId: 'p-from-finding' },
    });
    readiness.recordFeedback.mockRejectedValue(new BadRequestException('invalid'));

    await expect(
      handler.execute({
        type: Gate1RuntimeCommandType.RECORD_READINESS_FEEDBACK,
        findingId: 'f1',
        actorId: 'u1',
        dto: { feedback: 'CONFIRMED' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await new Promise((r) => setImmediate(r));

    expect(runtimeEvents.commandRejected).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p-from-finding' }),
    );
  });
});

describe('commandRejected catalog', () => {
  it('maps COMMAND_REJECTED canonical type', () => {
    expect(RuntimeCanonicalEventType.COMMAND_REJECTED).toBe('COMMAND_REJECTED');
  });
});
