import {
  resolveTravelContextAssemblyModeFromEnv,
} from './travel-context-assembler.service';

describe('resolveTravelContextAssemblyModeFromEnv', () => {
  it('defaults to off', () => {
    expect(resolveTravelContextAssemblyModeFromEnv({})).toBe('off');
  });

  it('maps shadow aliases', () => {
    expect(resolveTravelContextAssemblyModeFromEnv({ TRAVEL_CONTEXT_ASSEMBLY: 'shadow' })).toBe(
      'shadow',
    );
    expect(resolveTravelContextAssemblyModeFromEnv({ TRAVEL_CONTEXT_ASSEMBLY: '1' })).toBe(
      'shadow',
    );
  });

  it('maps consume', () => {
    expect(resolveTravelContextAssemblyModeFromEnv({ TRAVEL_CONTEXT_ASSEMBLY: 'consume' })).toBe(
      'consume',
    );
  });
});
