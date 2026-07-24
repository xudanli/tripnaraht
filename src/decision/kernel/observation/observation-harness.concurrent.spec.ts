/**
 * 并行 + 超时：慢执行器在短阈值下应产生 OBSERVATION_TIMEOUT，且不阻塞其它并行任务完成。
 */
import { Test, TestingModule } from '@nestjs/testing';
import type { TripObservationAction } from '../../../trips/road/trip-action.types';
import type { DecisionState } from '../decision-state.types';
import type { ObservationToolExecutor } from './observation-harness.types';
import { ObservationHarnessService, OBSERVATION_TOOL_EXECUTOR } from './observation-harness.service';

class SlowThenFastExecutor implements ObservationToolExecutor {
  async execute(action: TripObservationAction, _dso: DecisionState) {
    const delay = action.type === 'OBSERVATION_SNS_CRAWL' ? 200 : 5;
    await new Promise(r => setTimeout(r, delay));
    return {
      evidenceKind: 'station_forecast',
      evidenceWeight: 0.5,
      passability01: action.type === 'OBSERVATION_SNS_CRAWL' ? 0.3 : 0.7,
      summary: action.type,
    };
  }
}

describe('ObservationHarnessService concurrency', () => {
  const prevTimeout = process.env.OBSERVATION_TIMEOUT_MS;
  const prevMax = process.env.OBSERVATION_MAX_ACTIONS;

  afterEach(() => {
    process.env.OBSERVATION_TIMEOUT_MS = prevTimeout;
    process.env.OBSERVATION_MAX_ACTIONS = prevMax;
  });

  it('runs observations in parallel under per-action timeout', async () => {
    process.env.OBSERVATION_TIMEOUT_MS = '80';
    process.env.OBSERVATION_MAX_ACTIONS = '2';
    process.env.OBSERVATION_VOI_THRESHOLD = '-1';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservationHarnessService,
        { provide: OBSERVATION_TOOL_EXECUTOR, useClass: SlowThenFastExecutor },
      ],
    }).compile();

    const harness = module.get(ObservationHarnessService);
    const dso = {
      requestId: 'conc-test',
      systemState: { requestId: 'conc-test', version: 1 },
      userIntent: {
        destination: { lat: 69.3, lng: 17.8 },
        mustIncludePoiIds: ['p1'],
      },
      environmentState: { weatherRisk: 0.95 },
    } as DecisionState;

    const t0 = Date.now();
    const out = await harness.handleObservations(dso);
    const elapsed = Date.now() - t0;

    expect(out.audit.length).toBeGreaterThanOrEqual(1);
    expect(elapsed).toBeLessThan(400);
    expect(out.audit.some(a => a.execution.summary === 'OBSERVATION_TIMEOUT')).toBe(true);
  });
});
