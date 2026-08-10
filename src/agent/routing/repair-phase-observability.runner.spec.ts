import { recordRepairPhaseObservability } from './repair-phase-observability.runner';
import type { RepairPhaseObservabilityHost } from './repair-phase-observability.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('repair-phase-observability.runner', () => {
  it('swallows audit generation failures', async () => {
    const host: RepairPhaseObservabilityHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      normalizeDecisionOsAuditReport: jest.fn(() => {
        throw new Error('boom');
      }),
    };
    await expect(
      recordRepairPhaseObservability(host, {
        newState: { systemState: { version: 1 } } as any,
        state: { request_id: 'r1', metadata: {} } as unknown as OrchestratorState,
        request: { request_id: 'r1' } as RouteAndRunRequestDto,
      }),
    ).resolves.toBeUndefined();
  });
});
