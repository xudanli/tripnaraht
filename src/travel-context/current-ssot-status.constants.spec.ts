import {
  CURRENT_RUNTIME_SSOT,
  TARGET_CONTEXT_SSOT,
  TRAVEL_CONTEXT_MIGRATION_TABLE,
} from './current-ssot-status.constants';

describe('travel-context current SSOT status', () => {
  it('declares dual-track runtime and TravelContext as target', () => {
    expect(CURRENT_RUNTIME_SSOT).toContain('OrchestratorState');
    expect(TARGET_CONTEXT_SSOT).toContain('TravelContext');
    expect(TRAVEL_CONTEXT_MIGRATION_TABLE.length).toBeGreaterThanOrEqual(5);
  });
});
