import { EXECUTION_SLIP_CANDIDATE_IDS } from '../contracts/execution-slip.types';
import {
  buildExecutionSlipOptionCopy,
  buildExecutionSlipScheduleContext,
  formatExecutionSlipClockLabel,
} from './execution-slip-option-copy.util';
import type { ExecutionSlipOptionContext } from '../contracts/execution-slip-option-preview.types';

function baseContext(overrides?: Partial<ExecutionSlipOptionContext>): ExecutionSlipOptionContext {
  return {
    currentActivityId: 'act_a',
    currentActivityTitle: 'POI A',
    nextActivityId: 'act_b',
    nextActivityTitle: 'POI B (Timed)',
    substituteActivityId: 'act_c',
    substituteActivityTitle: 'POI C (Substitute)',
    substituteLastEntryAt: '18:00',
    substituteLastEntryAtLabel: '18:00',
    shortenMinutes: 45,
    timezone: 'Atlantic/Reykjavik',
    scheduleContext: buildExecutionSlipScheduleContext({
      projectedEta: '2026-07-12T16:18:00.000Z',
      lastEntryAt: '2026-07-12T16:00:00.000Z',
      slipMinutes: 45,
      travelDurationMinutes: 128,
      timezone: 'Atlantic/Reykjavik',
      referenceIso: '2026-07-12T13:45:00.000Z',
    }),
    ...overrides,
  };
}

describe('execution-slip-option-copy.util', () => {
  it('formats projected ETA and last entry labels', () => {
    const ctx = buildExecutionSlipScheduleContext({
      projectedEta: '2026-07-12T16:18:00.000Z',
      lastEntryAt: '16:00',
      slipMinutes: 45,
      timezone: 'Atlantic/Reykjavik',
      referenceIso: '2026-07-12T13:45:00.000Z',
    });
    expect(ctx.projectedEtaLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(ctx.nextLastEntryAtLabel).toBe('16:00');
  });

  it('formats clock strings directly', () => {
    expect(formatExecutionSlipClockLabel('18:00', 'Atlantic/Reykjavik')).toBe('18:00');
  });

  it('builds remove-next copy with POI name and schedule', () => {
    const copy = buildExecutionSlipOptionCopy(
      EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY,
      baseContext(),
    );
    expect(copy.title).toContain('POI B (Timed)');
    expect(copy.summary).toContain('预计');
    expect(copy.summary).toContain('16:00');
    expect(copy.changePreview?.remove?.title).toBe('POI B (Timed)');
    expect(copy.sacrifices[0]).toContain('POI B (Timed)');
  });

  it('builds substitute copy with before/after POI names', () => {
    const copy = buildExecutionSlipOptionCopy(
      EXECUTION_SLIP_CANDIDATE_IDS.SUBSTITUTE_NEXT_ACTIVITY,
      baseContext(),
    );
    expect(copy.title).toContain('POI C (Substitute)');
    expect(copy.summary).toContain('POI B (Timed)');
    expect(copy.summary).toContain('18:00');
    expect(copy.changePreview?.remove?.title).toBe('POI B (Timed)');
    expect(copy.changePreview?.add?.title).toBe('POI C (Substitute)');
  });

  it('builds shorten-stay copy with minutes', () => {
    const copy = buildExecutionSlipOptionCopy(
      EXECUTION_SLIP_CANDIDATE_IDS.SHORTEN_CURRENT_STAY,
      baseContext(),
    );
    expect(copy.title).toContain('45');
    expect(copy.summary).toContain('POI B (Timed)');
    expect(copy.changePreview?.shortenMinutes).toBe(45);
  });
});
